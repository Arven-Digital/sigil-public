/**
 * @sigil-protocol/sdk — TypeScript SDK for Sigil agent wallets
 *
 * Usage:
 *   const sigil = new SigilSDK({ apiUrl: 'https://api.sigil.codes', agentKey, accountAddress });
 *   const result = await sigil.evaluateTransaction(txParams);
 *   const signed = await sigil.signAndSubmit(txParams);
 */

import { ethers } from 'ethers';
import {
  SigilConfig,
  TransactionParams,
  UserOperation,
  EvaluationResult,
  AccountInfo,
  PolicyInfo,
  UpdatePolicyParams,
  TransactionListParams,
  TransactionListResult,
  FreezeResult,
  RotateKeyResult,
  RecoveryConfig,
  RecoveryRequest,
  RecoveryStatus,
  UpgradeStatus,
} from './types';
import {
  SigilError,
  SigilAPIError,
  SigilRejectionError,
  AuthError,
  EvaluationError,
  NetworkError,
  FrozenAccountError,
  RecoveryError,
  UpgradeError,
} from './errors';

// Re-export all types and errors
export * from './types';
export * from './errors';

export class SigilSDK {
  private apiUrl: string;
  private apiKey?: string;
  private agentWallet?: ethers.Wallet;
  private ownerWallet?: ethers.Wallet;
  private accountAddress: string;
  private maxRetries: number;
  private retryBaseDelay: number;
  private chainId?: number;

  constructor(config: SigilConfig) {
    // R10: Validate API URL scheme
    if (!config.apiUrl.startsWith('http://') && !config.apiUrl.startsWith('https://')) {
      throw new SigilError('apiUrl must use http:// or https:// scheme');
    }
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.accountAddress = config.accountAddress;
    this.maxRetries = config.maxRetries ?? 3;
    this.chainId = config.chainId;
    this.retryBaseDelay = config.retryBaseDelay ?? 1000;

    if (config.agentKey) {
      this.agentWallet = new ethers.Wallet(config.agentKey);
    }
    if (config.ownerKey) {
      this.ownerWallet = new ethers.Wallet(config.ownerKey);
    }
  }

  // ─── Account Management ───

  async getAccount(): Promise<AccountInfo> {
    return this.request<AccountInfo>(`/v1/accounts/${this.accountAddress}`);
  }

  async registerAccount(params: {
    owner: string;
    agentKey: string;
    guardianKey?: string;
    chainId: number;
  }): Promise<AccountInfo> {
    return this.request<AccountInfo>('/v1/accounts', {
      method: 'POST',
      body: {
        address: this.accountAddress,
        ...params,
      },
    });
  }

  // ─── Policy Management ───

  async getPolicy(): Promise<PolicyInfo> {
    const account = await this.getAccount();
    return account.policy;
  }

  async updatePolicy(params: UpdatePolicyParams): Promise<PolicyInfo> {
    return this.request<PolicyInfo>(`/v1/accounts/${this.accountAddress}/policy`, {
      method: 'PUT',
      body: params,
    });
  }

  // ─── Transaction Evaluation ───

  async evaluateTransaction(tx: TransactionParams): Promise<EvaluationResult> {
    return this.evaluate(tx);
  }

  async evaluate(tx: TransactionParams): Promise<EvaluationResult> {
    const userOp = await this.buildUserOp(tx);

    return this.request<EvaluationResult>('/v1/evaluate', {
      method: 'POST',
      body: { userOp },
    });
  }

  /**
   * Sign a transaction, evaluate it with the Guardian, and return the result
   * with the guardian co-signature. The caller is responsible for submitting
   * the signed UserOp to a bundler.
   *
   * I2 note: This does NOT submit to a bundler. Use the returned
   * guardianSignature + agent signature to build the full multi-sig,
   * then submit via your bundler of choice.
   */
  async signAndEvaluate(tx: TransactionParams): Promise<EvaluationResult> {
    if (!this.agentWallet) {
      throw new AuthError('Agent key required for signAndEvaluate');
    }

    const result = await this.evaluateTransaction(tx);

    if (result.verdict === 'REJECTED') {
      throw new SigilRejectionError(
        result.rejectionReason ?? 'Transaction rejected',
        result.riskScore,
        result
      );
    }

    return result;
  }

  /** @deprecated Use signAndEvaluate() — this does NOT submit to a bundler */
  async signAndSubmit(tx: TransactionParams): Promise<EvaluationResult> {
    return this.signAndEvaluate(tx);
  }

  // ─── Transaction History ───

  async getTransactions(params?: TransactionListParams): Promise<TransactionListResult> {
    const qs = new URLSearchParams({
      account: this.accountAddress,
      ...(params?.limit && { limit: String(params.limit) }),
      ...(params?.offset && { offset: String(params.offset) }),
      ...(params?.verdict && { verdict: params.verdict }),
    });

    return this.request(`/v1/transactions?${qs}`);
  }

  // ─── Emergency Controls ───

  async freeze(reason: string = 'Frozen via SDK'): Promise<FreezeResult> {
    return this.request<FreezeResult>(`/v1/accounts/${this.accountAddress}/freeze`, {
      method: 'POST',
      body: { reason },
    });
  }

  // ─── Key Management ───

  async rotateKey(newKey: string): Promise<RotateKeyResult> {
    return this.request<RotateKeyResult>(`/v1/accounts/${this.accountAddress}/rotate-key`, {
      method: 'POST',
      body: { newAgentKey: newKey },
    });
  }

  // ─── Audit Log ───

  async getAuditLog(limit?: number): Promise<{ events: any[] }> {
    const qs = new URLSearchParams({
      account: this.accountAddress,
      ...(limit && { limit: String(limit) }),
    });

    return this.request(`/v1/audit?${qs}`);
  }

  // ─── Social Recovery ───

  private _getAccountContract(): ethers.Contract {
    if (!this.provider) {
      throw new NetworkError('RPC provider required. Call setProvider(rpcUrl) first.');
    }
    const abi = [
      // Guardian management
      'function addRecoveryGuardian(address guardian) external',
      'function removeRecoveryGuardian(address guardian) external',
      'function setRecoveryThreshold(uint256 threshold) external',
      'function setRecoveryDelay(uint256 delay) external',
      // Recovery flow
      'function initiateRecovery(address newOwner) external returns (bytes32)',
      'function supportRecovery(bytes32 recoveryId) external',
      'function executeRecovery(bytes32 recoveryId) external',
      'function cancelRecovery(bytes32 recoveryId) external',
      // Recovery views
      'function getRecoveryConfig() external view returns (uint256 threshold, uint256 guardianCount, uint256 delay)',
      'function getRecoveryGuardians() external view returns (address[])',
      'function getRecoveryStatus(bytes32 recoveryId) external view returns (address newOwner, uint256 supportCount, uint256 executeAfter, bool executed, bool cancelled, uint256 epoch)',
      'function guardianEpoch() external view returns (uint256)',
      'function removeSessionTarget(uint256 sessionId, address target) external',
      'function removeSessionFunction(uint256 sessionId, bytes4 selector) external',
      'function isRecoveryGuardian(address addr) external view returns (bool)',
      // Upgrade
      'function requestUpgrade(address newImplementation) external',
      'function cancelUpgrade() external',
      'function pendingImplementation() external view returns (address)',
      'function upgradeRequestedAt() external view returns (uint256)',
      'function UPGRADE_DELAY() external view returns (uint256)',
      // Session keys
      'function createSessionKey(address key, uint256 validAfter, uint256 validUntil, uint256 spendLimit, uint256 maxTxValue, uint256 cooldown, bool allowAllTargets) external returns (uint256)',
      'function revokeSessionKey(uint256 sessionId) external',
      'function getSessionKey(uint256 sessionId) external view returns (address key, uint256 validAfter, uint256 validUntil, uint256 spendLimit, uint256 spent, uint256 maxTxVal, uint256 cooldown, uint256 lastUsedAt, bool allowAllTargets, bool revoked)',
      'function isValidSessionKey(address key) external view returns (bool)',
      'function addSessionTarget(uint256 sessionId, address target) external',
      'function addSessionFunction(uint256 sessionId, bytes4 selector) external',
      // Token policies
      'function setTokenPolicy(address token, uint256 maxApproval, uint256 dailyTransferLimit) external',
      'function removeTokenPolicy(address token) external',
      'function getTokenPolicy(address token) external view returns (uint256 maxApproval, uint256 dailyTransferLimit, uint256 dailyTransferred, bool exists)',
      // Multicall
      'function multicall(bytes[] calldata data) external returns (bytes[])',
      // ERC-1271
      'function isValidSignature(bytes32 hash, bytes signature) external view returns (bytes4)',
      // ERC-165
      'function supportsInterface(bytes4 interfaceId) external view returns (bool)',
      // Events
      'event SessionKeyCreated(uint256 indexed sessionId, address indexed key, uint256 validAfter, uint256 validUntil, uint256 spendLimit)',
    ];
    return new ethers.Contract(this.accountAddress, abi, this.provider);
  }

  /**
   * M3 fix: Get account contract connected with owner wallet for direct calls.
   * Admin operations (recovery, upgrades, policy) must use direct contract calls,
   * NOT UserOps, because the policy engine blocks self-calls (target == address(this)).
   */
  private _getOwnerContract(): ethers.Contract {
    if (!this.ownerWallet) {
      throw new AuthError('Owner key required for admin operations. Pass ownerKey in SigilConfig.');
    }
    if (!this.provider) {
      throw new NetworkError('RPC provider required. Call setProvider(rpcUrl) first.');
    }
    const connectedWallet = this.ownerWallet.connect(this.provider);
    return this._getAccountContract().connect(connectedWallet) as ethers.Contract;
  }

  /**
   * Build a UserOperation that calls a contract function on the account itself.
   *
   * ⚠️ M5 FIX NOTE: These UserOps target execute(address(this), ...) which is blocked
   * by the on-chain policy engine (self-call protection). They will REVERT if submitted
   * through the EntryPoint. Use the owner-direct methods (e.g., addRecoveryGuardianDirect)
   * or call the contract directly from the owner wallet instead.
   *
   * @deprecated Use direct contract calls from owner wallet for admin operations.
   */
  private async _buildAccountCallUserOp(functionData: string): Promise<UserOperation> {
    const iface = new ethers.Interface([
      'function execute(address target, uint256 value, bytes data)',
    ]);

    const callData = iface.encodeFunctionData('execute', [
      this.accountAddress,
      0n,
      functionData,
    ]);

    const nonce = await this.getNonce();

    const userOp: UserOperation = {
      sender: this.accountAddress,
      nonce,
      callData,
      callGasLimit: '0x30D40',
      verificationGasLimit: '0x186A0',
      preVerificationGas: '0x5208',
      maxFeePerGas: '0x6FC23AC00',
      maxPriorityFeePerGas: '0x3B9ACA00',
      signature: '0x',
    };

    if (this.agentWallet) {
      const hash = this.hashUserOp(userOp);
      userOp.signature = await this.agentWallet.signMessage(ethers.getBytes(hash));
    }

    return userOp;
  }

  /**
   * M3 fix: All recovery/admin methods now use direct contract calls via owner wallet.
   * Returns tx hash on success.
   */
  async addRecoveryGuardian(guardian: string): Promise<string> {
    if (!guardian.match(/^0x[0-9a-fA-F]{40}$/)) {
      throw new RecoveryError('Invalid guardian address');
    }
    const contract = this._getOwnerContract();
    const tx = await contract.addRecoveryGuardian(guardian);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async removeRecoveryGuardian(guardian: string): Promise<string> {
    if (!guardian.match(/^0x[0-9a-fA-F]{40}$/)) {
      throw new RecoveryError('Invalid guardian address');
    }
    const contract = this._getOwnerContract();
    const tx = await contract.removeRecoveryGuardian(guardian);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async setRecoveryThreshold(threshold: number): Promise<string> {
    if (threshold < 1) {
      throw new RecoveryError('Threshold must be at least 1');
    }
    const contract = this._getOwnerContract();
    const tx = await contract.setRecoveryThreshold(threshold);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async setRecoveryDelay(delay: number): Promise<string> {
    const MIN_DELAY = 48 * 60 * 60; // 48 hours
    if (delay < MIN_DELAY) {
      throw new RecoveryError('Recovery delay must be at least 48 hours (172800 seconds)');
    }
    const contract = this._getOwnerContract();
    const tx = await contract.setRecoveryDelay(delay);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async getRecoveryConfig(): Promise<RecoveryConfig> {
    const contract = this._getAccountContract();
    const [threshold, guardianCount, delay] = await contract.getRecoveryConfig();
    const guardians = await contract.getRecoveryGuardians();
    return {
      threshold: Number(threshold),
      guardianCount: Number(guardianCount),
      delay: Number(delay),
      guardians: guardians as string[],
    };
  }

  async initiateRecovery(newOwner: string): Promise<string> {
    if (!newOwner.match(/^0x[0-9a-fA-F]{40}$/)) {
      throw new RecoveryError('Invalid new owner address');
    }
    // Note: initiateRecovery is called by recovery guardians, not owner
    // Use provider with guardian's wallet (caller must set up appropriately)
    const contract = this._getOwnerContract();
    const tx = await contract.initiateRecovery(newOwner);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async supportRecovery(recoveryId: string): Promise<string> {
    if (!recoveryId.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new RecoveryError('Invalid recovery ID');
    }
    const contract = this._getOwnerContract();
    const tx = await contract.supportRecovery(recoveryId);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async executeRecovery(recoveryId: string): Promise<string> {
    if (!recoveryId.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new RecoveryError('Invalid recovery ID');
    }
    const contract = this._getOwnerContract();
    const tx = await contract.executeRecovery(recoveryId);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async cancelRecovery(recoveryId: string): Promise<string> {
    if (!recoveryId.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new RecoveryError('Invalid recovery ID');
    }
    const contract = this._getOwnerContract();
    const tx = await contract.cancelRecovery(recoveryId);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async getRecoveryStatus(recoveryId: string): Promise<RecoveryRequest & { status: RecoveryStatus }> {
    if (!recoveryId.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new RecoveryError('Invalid recovery ID');
    }
    const contract = this._getAccountContract();
    const [newOwner, supportCount, executeAfter, executed, cancelled, epoch] =
      await contract.getRecoveryStatus(recoveryId);

    const request: RecoveryRequest = {
      newOwner: newOwner as string,
      supportCount: Number(supportCount),
      executeAfter: Number(executeAfter),
      executed: executed as boolean,
      cancelled: cancelled as boolean,
      epoch: Number(epoch),
    };

    let status: RecoveryStatus;
    if (cancelled) {
      status = 'cancelled';
    } else if (executed) {
      status = 'executed';
    } else if (Number(executeAfter) > 0 && Date.now() / 1000 >= Number(executeAfter)) {
      status = 'ready';
    } else {
      status = 'pending';
    }

    return { ...request, status };
  }

  // ─── UUPS Upgrades ───

  async requestUpgrade(newImplementation: string): Promise<string> {
    if (!newImplementation.match(/^0x[0-9a-fA-F]{40}$/)) {
      throw new UpgradeError('Invalid implementation address');
    }
    const contract = this._getOwnerContract();
    const tx = await contract.requestUpgrade(newImplementation);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async cancelUpgrade(): Promise<string> {
    const contract = this._getOwnerContract();
    const tx = await contract.cancelUpgrade();
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async getUpgradeStatus(): Promise<UpgradeStatus> {
    const contract = this._getAccountContract();
    const [pendingImpl, requestedAt, upgradeDelay] = await Promise.all([
      contract.pendingImplementation(),
      contract.upgradeRequestedAt(),
      contract.UPGRADE_DELAY(),
    ]);
    const requestedAtNum = Number(requestedAt);
    const delayNum = Number(upgradeDelay);
    return {
      pendingImplementation: pendingImpl as string,
      requestedAt: requestedAtNum,
      executeAfter: requestedAtNum > 0 ? requestedAtNum + delayNum : 0,
    };
  }

  // ─── Session Keys ───

  async createSessionKey(config: import('./types').SessionKeyConfig): Promise<import('./types').SessionKeyCreateResult> {
    const contract = this._getOwnerContract();
    const tx = await contract.createSessionKey(
      config.key,
      config.validAfter ?? 0,
      config.validUntil,
      config.spendLimit.toString(),
      (config.maxTxValue ?? 0).toString(),
      config.cooldown ?? 0,
      config.allowAllTargets ?? true,
    );
    const receipt = await tx.wait();
    // Parse SessionKeyCreated event
    const event = receipt?.logs?.find((l: any) => {
      try { return contract.interface.parseLog(l)?.name === 'SessionKeyCreated'; } catch { return false; }
    });
    const parsed = event ? contract.interface.parseLog(event) : null;
    return {
      sessionId: parsed ? Number(parsed.args[0]) : 0,
      key: config.key,
      validAfter: config.validAfter ?? Math.floor(Date.now() / 1000),
      validUntil: config.validUntil,
      txHash: receipt?.hash ?? tx.hash,
    };
  }

  async revokeSessionKey(sessionId: number): Promise<string> {
    const contract = this._getOwnerContract();
    const tx = await contract.revokeSessionKey(sessionId);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async getSessionKey(sessionId: number): Promise<import('./types').SessionKeyInfo> {
    const contract = this._getAccountContract();
    const [key, validAfter, validUntil, spendLimit, spent, maxTxVal, cooldown, lastUsedAt, allowAllTargets, revoked] =
      await contract.getSessionKey(sessionId);
    const now = Math.floor(Date.now() / 1000);
    return {
      sessionId,
      key: key as string,
      validAfter: Number(validAfter),
      validUntil: Number(validUntil),
      spendLimit: spendLimit.toString(),
      spent: spent.toString(),
      maxTxValue: maxTxVal.toString(),
      cooldown: Number(cooldown),
      lastUsedAt: Number(lastUsedAt),
      allowAllTargets: allowAllTargets as boolean,
      revoked: revoked as boolean,
      isActive: !revoked && now >= Number(validAfter) && now <= Number(validUntil),
    };
  }

  async isValidSessionKey(key: string): Promise<boolean> {
    const contract = this._getAccountContract();
    return contract.isValidSessionKey(key) as Promise<boolean>;
  }

  async addSessionTarget(sessionId: number, target: string): Promise<string> {
    const contract = this._getOwnerContract();
    const tx = await contract.addSessionTarget(sessionId, target);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async addSessionFunction(sessionId: number, selector: string): Promise<string> {
    const contract = this._getOwnerContract();
    const tx = await contract.addSessionFunction(sessionId, selector);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async removeSessionTarget(sessionId: number, target: string): Promise<string> {
    const contract = this._getOwnerContract();
    const tx = await contract.removeSessionTarget(sessionId, target);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async removeSessionFunction(sessionId: number, selector: string): Promise<string> {
    const contract = this._getOwnerContract();
    const tx = await contract.removeSessionFunction(sessionId, selector);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async getGuardianEpoch(): Promise<number> {
    const contract = this._getAccountContract();
    const epoch = await contract.guardianEpoch();
    return Number(epoch);
  }

  // ─── ERC-1271 ───

  async isValidSignature(hash: string, signature: string): Promise<boolean> {
    const contract = this._getAccountContract();
    const result = await contract.isValidSignature(hash, signature);
    return result === '0x1626ba7e';
  }

  // ─── ERC-165 ───

  async supportsInterface(interfaceId: string): Promise<boolean> {
    const contract = this._getAccountContract();
    return contract.supportsInterface(interfaceId) as Promise<boolean>;
  }

  // ─── Token Allowance Policies ───

  async setTokenPolicy(token: string, maxApproval: bigint | string, dailyTransferLimit: bigint | string): Promise<string> {
    const contract = this._getOwnerContract();
    const tx = await contract.setTokenPolicy(token, maxApproval.toString(), dailyTransferLimit.toString());
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async removeTokenPolicy(token: string): Promise<string> {
    const contract = this._getOwnerContract();
    const tx = await contract.removeTokenPolicy(token);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  async getTokenPolicy(token: string): Promise<import('./types').TokenPolicyInfo> {
    const contract = this._getAccountContract();
    const [maxApproval, dailyLimit, transferred, exists] = await contract.getTokenPolicy(token);
    return {
      token,
      maxApproval: maxApproval.toString(),
      dailyTransferLimit: dailyLimit.toString(),
      dailyTransferred: transferred.toString(),
      exists: exists as boolean,
    };
  }

  // ─── Multicall ───

  async multicall(calls: string[]): Promise<string> {
    const contract = this._getOwnerContract();
    const tx = await contract.multicall(calls);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  }

  // ─── Strategy Templates ───

  static readonly STRATEGY_TEMPLATES: Record<string, import('./types').StrategyTemplate> = {
    'defi-conservative': {
      name: 'DeFi Conservative',
      description: 'Low-risk DeFi operations. Small swaps, staking, lending with tight limits.',
      maxTxValue: '100000000000000000',        // 0.1 ETH
      dailyLimit: '500000000000000000',         // 0.5 ETH
      guardianThreshold: '50000000000000000',   // 0.05 ETH
      ownerThreshold: '200000000000000000',     // 0.2 ETH
      suggestedSessionCooldown: 300,            // 5 min between txs
      suggestedSessionDuration: 14400,          // 4 hours
      suggestedSessionSpendLimit: '200000000000000000', // 0.2 ETH
    },
    'trading-aggressive': {
      name: 'Trading Aggressive',
      description: 'Active trading bot. Frequent swaps with higher limits for speed.',
      maxTxValue: '1000000000000000000',        // 1 ETH
      dailyLimit: '5000000000000000000',        // 5 ETH
      guardianThreshold: '500000000000000000',  // 0.5 ETH
      ownerThreshold: '2000000000000000000',    // 2 ETH
      suggestedSessionCooldown: 30,             // 30 sec between txs
      suggestedSessionDuration: 28800,          // 8 hours
      suggestedSessionSpendLimit: '2000000000000000000', // 2 ETH
    },
    'nft-collector': {
      name: 'NFT Collector',
      description: 'NFT minting and buying. Moderate values, lower frequency.',
      maxTxValue: '500000000000000000',         // 0.5 ETH
      dailyLimit: '2000000000000000000',        // 2 ETH
      guardianThreshold: '200000000000000000',  // 0.2 ETH
      ownerThreshold: '1000000000000000000',    // 1 ETH
      suggestedSessionCooldown: 60,             // 1 min between txs
      suggestedSessionDuration: 7200,           // 2 hours
      suggestedSessionSpendLimit: '1000000000000000000', // 1 ETH
    },
    'payment-processor': {
      name: 'Payment Processor',
      description: 'Recurring payments and payroll. Predictable, scheduled transactions.',
      maxTxValue: '200000000000000000',         // 0.2 ETH
      dailyLimit: '1000000000000000000',        // 1 ETH
      guardianThreshold: '100000000000000000',  // 0.1 ETH
      ownerThreshold: '500000000000000000',     // 0.5 ETH
      suggestedSessionCooldown: 600,            // 10 min between txs
      suggestedSessionDuration: 86400,          // 24 hours
      suggestedSessionSpendLimit: '500000000000000000', // 0.5 ETH
    },
    'view-only': {
      name: 'View Only',
      description: 'Read-only operations. No value transfers, only contract calls with zero value.',
      maxTxValue: '0',
      dailyLimit: '0',
      guardianThreshold: '0',
      ownerThreshold: '0',
      suggestedSessionCooldown: 0,
      suggestedSessionDuration: 86400,          // 24 hours
      suggestedSessionSpendLimit: '0',
    },
  };

  /**
   * Get a strategy template by name.
   */
  static getStrategyTemplate(name: string): import('./types').StrategyTemplate | undefined {
    return SigilSDK.STRATEGY_TEMPLATES[name];
  }

  /**
   * List all available strategy templates.
   */
  static listStrategyTemplates(): import('./types').StrategyTemplate[] {
    return Object.values(SigilSDK.STRATEGY_TEMPLATES);
  }

  // ─── Nonce Management ───

  private provider?: ethers.JsonRpcProvider;
  private entryPointAddress: string = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'; // v0.7

  /**
   * Set the RPC provider for on-chain nonce fetching.
   * Required for production use. Without it, nonce defaults to 0.
   */
  setProvider(rpcUrl: string, entryPointAddress?: string): void {
    // R17: Validate RPC URL scheme
    if (!rpcUrl.startsWith('http://') && !rpcUrl.startsWith('https://') && !rpcUrl.startsWith('ws://') && !rpcUrl.startsWith('wss://')) {
      throw new SigilError('RPC URL must use http(s) or ws(s) scheme');
    }
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    if (entryPointAddress) {
      if (!entryPointAddress.match(/^0x[0-9a-fA-F]{40}$/)) {
        throw new SigilError('Invalid EntryPoint address');
      }
      this.entryPointAddress = entryPointAddress;
    }
  }

  /**
   * Fetch the current nonce from the EntryPoint contract.
   * Throws if no provider configured (required for production).
   */
  private async getNonce(): Promise<string> {
    if (!this.provider) {
      throw new NetworkError(
        'RPC provider required for nonce fetching. Call setProvider(rpcUrl) first. ' +
        'Without it, UserOps will fail with nonce mismatch.'
      );
    }

    try {
      const entryPoint = new ethers.Contract(
        this.entryPointAddress,
        ['function getNonce(address sender, uint192 key) view returns (uint256)'],
        this.provider
      );
      const nonce: bigint = await entryPoint.getNonce(this.accountAddress, 0);
      return '0x' + nonce.toString(16);
    } catch (err: any) {
      throw new NetworkError(`Failed to fetch nonce from EntryPoint: ${err.message}`, err);
    }
  }

  /**
   * Set authentication token (e.g., from SIWE flow).
   * Supports automatic refresh when paired with refreshToken.
   */
  setAuth(accessToken: string, refreshToken?: string): void {
    this.apiKey = accessToken;
    if (refreshToken) {
      this._refreshToken = refreshToken;
    }
  }

  private _refreshToken?: string;
  private _refreshing?: Promise<void>;

  /**
   * Auto-refresh the access token using the refresh token.
   * Called internally when a 401 is received.
   */
  private async _autoRefresh(): Promise<boolean> {
    if (!this._refreshToken) return false;

    // Prevent concurrent refreshes — reuse in-flight promise
    if (this._refreshing) {
      try {
        await this._refreshing;
        return true;
      } catch {
        return false;
      }
    }

    const refreshPromise = (async () => {
      const res = await fetch(`${this.apiUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this._refreshToken }),
      });
      if (!res.ok) throw new AuthError('Refresh failed');
      const data = await res.json() as any;
      this.apiKey = data.accessToken;
      if (data.refreshToken) this._refreshToken = data.refreshToken;
    })();

    this._refreshing = refreshPromise;

    try {
      await refreshPromise;
      return true;
    } catch {
      this._refreshToken = undefined;
      return false;
    } finally {
      this._refreshing = undefined;
    }
  }

  // ─── UserOp Builder ───

  async buildUserOp(tx: TransactionParams): Promise<UserOperation> {
    // R11: Validate target address
    if (!tx.target || !tx.target.match(/^0x[0-9a-fA-F]{40}$/)) {
      throw new SigilError('Invalid target address');
    }

    const iface = new ethers.Interface([
      'function execute(address target, uint256 value, bytes data)',
    ]);

    const callData = iface.encodeFunctionData('execute', [
      tx.target,
      BigInt(tx.value),
      tx.data ?? '0x',
    ]);

    const nonce = await this.getNonce();

    const userOp: UserOperation = {
      sender: this.accountAddress,
      nonce,
      callData,
      callGasLimit: tx.callGasLimit ?? '0x186A0',
      verificationGasLimit: tx.verificationGasLimit ?? '0x186A0',
      preVerificationGas: tx.preVerificationGas ?? '0x5208',
      maxFeePerGas: tx.maxFeePerGas ?? '0x6FC23AC00',
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? '0x3B9ACA00',
      signature: '0x',
    };

    if (this.agentWallet) {
      const hash = this.hashUserOp(userOp);
      userOp.signature = await this.agentWallet.signMessage(ethers.getBytes(hash));
    }

    return userOp;
  }

  /**
   * Hash a UserOperation per ERC-4337 standard.
   * H1 fix: includes entryPoint + chainId in outer hash.
   */
  private hashUserOp(userOp: UserOperation): string {
    // Step 1: Inner pack hash
    const packed = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes32'],
      [
        userOp.sender,
        userOp.nonce,
        ethers.keccak256(userOp.callData),
        ethers.keccak256((userOp as any).initCode ?? '0x'), // H3 fix: hash actual initCode
        userOp.callGasLimit,
        userOp.verificationGasLimit,
        userOp.preVerificationGas,
        userOp.maxFeePerGas,
        userOp.maxPriorityFeePerGas,
        ethers.keccak256((userOp as any).paymasterAndData ?? '0x'), // H4 fix: include paymasterAndData
      ]
    );
    const packHash = ethers.keccak256(packed);

    // Step 2: Wrap with entryPoint + chainId (ERC-4337 standard)
    const chainId = this.chainId ?? 1;
    const outerEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'uint256'],
      [packHash, this.entryPointAddress, chainId]
    );

    return ethers.keccak256(outerEncoded);
  }

  // ─── HTTP Client with Retry ───

  private async request<T>(path: string, options?: {
    method?: string;
    body?: any;
  }): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this._doRequest<T>(path, options);
      } catch (err: any) {
        lastError = err;

        // Don't retry client errors (4xx) except 429 and 401 (refresh)
        if (err instanceof SigilAPIError) {
          if (err.statusCode === 401 && attempt === 0) {
            // Try auto-refresh on first 401
            const refreshed = await this._autoRefresh();
            if (refreshed) continue; // retry with new token
            throw new AuthError(err.message);
          }
          if (err.statusCode === 401 || err.statusCode === 403) {
            throw new AuthError(err.message);
          }
          if (err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 429) {
            throw err;
          }
        }

        // Don't retry on last attempt
        if (attempt === this.maxRetries) break;

        // R13: Respect Retry-After header on 429, otherwise exponential backoff
        let delay = this.retryBaseDelay * Math.pow(2, attempt) + Math.random() * 100;
        if (err instanceof SigilAPIError && err.statusCode === 429 && (err as any).retryAfter) {
          delay = Math.max(delay, (err as any).retryAfter * 1000);
        }
        await new Promise(r => setTimeout(r, delay));
      }
    }

    throw lastError ?? new NetworkError('Request failed after retries');
  }

  private async _doRequest<T>(path: string, options?: {
    method?: string;
    body?: any;
  }): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let response: Response;
    try {
      // R16: Add 30s timeout to prevent hanging on unresponsive API
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      response = await fetch(`${this.apiUrl}${path}`, {
        method: options?.method ?? 'GET',
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (err: any) {
      throw new NetworkError(err.name === 'AbortError' ? 'Request timed out' : err.message, err);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new SigilAPIError(
        (error as any).error ?? 'API request failed',
        response.status,
        path
      );
    }

    return response.json() as Promise<T>;
  }
}

export default SigilSDK;
