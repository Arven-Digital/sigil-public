import { ethers } from 'ethers';
import type {
  SigilConfig,
  UserOp,
  TxResult,
  EvalResult,
  AccountInfo,
  PolicyInfo,
  AuthResponse,
} from './types.js';
import { SigilError } from './errors.js';
import { getRpcUrl, getGasPrice, getNonce as rpcGetNonce } from './rpc.js';
import { encodeExecute, getUserOpHash, signUserOpHash, ENTRY_POINT } from './userOp.js';

const DEFAULT_API_URL = 'https://api.sigil.codes';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

// Per-chain default priority fees (gwei)
const CHAIN_PRIORITY_FEES: Record<number, bigint> = {
  137:   1_000_000_000n,   // Polygon: 1 gwei (spikes handled by maxFee buffer)
  43114: 2_000_000_000n,   // Avalanche: 2 gwei
  8453:  100_000_000n,     // Base: 0.1 gwei
  42161: 10_000_000n,      // Arbitrum: 0.01 gwei
  16661: 1_000_000_000n,   // 0G: 1 gwei
};

export class SigilSDK {
  private readonly apiKey: string;
  private readonly accountAddress: string;
  private readonly agentPrivateKey: string;
  private readonly chainId: number;
  private readonly apiUrl: string;
  private readonly rpcUrl: string;

  private token: string | null = null;
  private tokenExpiresAt = 0;
  private nonce: bigint | null = null;

  constructor(config: SigilConfig) {
    this.apiKey = config.apiKey;
    this.accountAddress = config.accountAddress;
    this.agentPrivateKey = config.agentPrivateKey;
    this.chainId = config.chainId;
    this.apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, '');
    this.rpcUrl = getRpcUrl(config.chainId);
  }

  // ── Auth ──────────────────────────────────────────────────

  async authenticate(): Promise<void> {
    const res = await fetch(`${this.apiUrl}/v1/agent/auth/api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: this.apiKey }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw SigilError.fromApiResponse(res.status, body as Record<string, unknown>);
    }
    const data = (await res.json()) as AuthResponse;
    this.token = data.token;
    // JWT payload is base64url; decode exp
    try {
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      this.tokenExpiresAt = (payload.exp as number) * 1000;
    } catch {
      // fallback: 4h from now
      this.tokenExpiresAt = Date.now() + 4 * 60 * 60 * 1000;
    }
  }

  private async ensureAuth(): Promise<string> {
    if (!this.token || Date.now() >= this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      await this.authenticate();
    }
    return this.token!;
  }

  private async apiFetch(
    path: string,
    opts: { method?: string; body?: unknown } = {},
  ): Promise<unknown> {
    const token = await this.ensureAuth();
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });

    if (res.status === 401) {
      // Token expired mid-flight — re-auth once and retry
      await this.authenticate();
      const retryRes = await fetch(`${this.apiUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
      });
      if (!retryRes.ok) {
        const body = await retryRes.json().catch(() => ({}));
        throw SigilError.fromApiResponse(retryRes.status, body as Record<string, unknown>);
      }
      return retryRes.json();
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw SigilError.fromApiResponse(res.status, body as Record<string, unknown>);
    }
    return res.json();
  }

  // ── High-level Helpers ────────────────────────────────────

  async approve(token: string, spender: string, amount: bigint): Promise<TxResult> {
    const iface = new ethers.Interface(['function approve(address,uint256)']);
    const data = iface.encodeFunctionData('approve', [spender, amount]);
    return this.contractCall(token, BigInt(0), data);
  }

  async transfer(token: string, to: string, amount: bigint): Promise<TxResult> {
    const iface = new ethers.Interface(['function transfer(address,uint256)']);
    const data = iface.encodeFunctionData('transfer', [to, amount]);
    return this.contractCall(token, BigInt(0), data);
  }

  async transferNative(to: string, amount: bigint): Promise<TxResult> {
    return this.contractCall(to, amount, '0x');
  }

  async contractCall(target: string, value: bigint, data: string): Promise<TxResult> {
    const op = await this.buildUserOp(target, value, data);
    const sig = await this.signUserOp(op);
    op.signature = sig;
    return this.submitUserOp(op);
  }

  // ── Evaluate (dry run) ────────────────────────────────────

  async evaluate(target: string, value: bigint, data: string): Promise<EvalResult> {
    const op = await this.buildUserOp(target, value, data);
    const sig = await this.signUserOp(op);
    op.signature = sig;
    // API derives chainId from account's DB record, not from request
    return (await this.apiFetch('/v1/evaluate', {
      method: 'POST',
      body: { userOp: op },
    })) as EvalResult;
  }

  // ── Account Info ──────────────────────────────────────────

  async getAccount(): Promise<AccountInfo> {
    return (await this.apiFetch(`/v1/accounts/${this.accountAddress}`)) as AccountInfo;
  }

  async getPolicy(): Promise<PolicyInfo> {
    return (await this.apiFetch(`/v1/accounts/${this.accountAddress}/policy`)) as PolicyInfo;
  }

  // ── Low-level UserOp ─────────────────────────────────────

  async buildUserOp(target: string, value: bigint, innerData: string): Promise<UserOp> {
    // Fetch nonce if not cached
    if (this.nonce === null) {
      this.nonce = await rpcGetNonce(this.rpcUrl, ENTRY_POINT, this.accountAddress, 0);
    }

    // Dynamic gas: base price from RPC + chain-appropriate priority fee
    const baseGasPrice = await getGasPrice(this.rpcUrl);
    const priorityFee = CHAIN_PRIORITY_FEES[this.chainId] ?? 1_000_000_000n;
    // maxFeePerGas = 2x base + priority (handles spikes)
    const maxFeePerGas = baseGasPrice * BigInt(2) + priorityFee;

    const callData = encodeExecute(target, value, innerData);

    // Pack gas fields into v0.7 format
    const vgl = BigInt(300000);
    const cgl = BigInt(300000);
    const accountGasLimits = '0x' + vgl.toString(16).padStart(32, '0') + cgl.toString(16).padStart(32, '0');
    const gasFees = '0x' + priorityFee.toString(16).padStart(32, '0') + maxFeePerGas.toString(16).padStart(32, '0');

    return {
      sender: this.accountAddress,
      nonce: '0x' + this.nonce.toString(16),
      callData,
      accountGasLimits,
      preVerificationGas: '0x' + (60000).toString(16),
      gasFees,
      signature: '0x',
    };
  }

  async signUserOp(userOp: UserOp): Promise<string> {
    const hash = getUserOpHash(userOp, this.chainId);
    return signUserOpHash(hash, this.agentPrivateKey);
  }

  async submitUserOp(userOp: UserOp): Promise<TxResult> {
    try {
      const result = (await this.apiFetch('/v1/execute', {
        method: 'POST',
        body: { userOp, chainId: this.chainId },
      })) as TxResult;

      // Success — increment local nonce
      if (this.nonce !== null) {
        this.nonce += BigInt(1);
      }

      return result;
    } catch (err) {
      if (err instanceof SigilError && err.code === 'NONCE_ERROR') {
        // Refresh nonce and retry once
        this.nonce = await rpcGetNonce(this.rpcUrl, ENTRY_POINT, this.accountAddress, 0);
        userOp.nonce = '0x' + this.nonce.toString(16);
        userOp.signature = await this.signUserOp(userOp);

        const result = (await this.apiFetch('/v1/execute', {
          method: 'POST',
          body: { userOp, chainId: this.chainId },
        })) as TxResult;

        this.nonce += BigInt(1);
        return result;
      }
      throw err;
    }
  }

  // ── Circuit Breaker Reset ─────────────────────────────────

  async resetCircuitBreaker(): Promise<void> {
    await this.apiFetch(`/v1/accounts/${this.accountAddress}/protection/reset-circuit-breaker`, {
      method: 'POST',
      body: { chainId: this.chainId },
    });
  }
}
