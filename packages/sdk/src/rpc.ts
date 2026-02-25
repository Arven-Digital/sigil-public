import { SigilError } from './errors.js';

const RPC_URLS: Record<number, string> = {
  137: 'https://polygon-bor-rpc.publicnode.com',
  43114: 'https://avalanche-c-chain-rpc.publicnode.com',
  8453: 'https://base-rpc.publicnode.com',
  42161: 'https://arbitrum-one-rpc.publicnode.com',
  16661: 'https://evmrpc-mainnet.0g.ai',
};

// Fallback RPCs for retry on failure
const FALLBACK_RPCS: Record<number, string> = {
  137: 'https://polygon.drpc.org',
  43114: 'https://api.avax.network/ext/bc/C/rpc',
  8453: 'https://mainnet.base.org',
  42161: 'https://arb1.arbitrum.io/rpc',
};

export function getRpcUrl(chainId: number): string {
  const url = RPC_URLS[chainId];
  if (!url) throw new SigilError(`No RPC URL for chainId ${chainId}`, { code: 'UNSUPPORTED_CHAIN' });
  return url;
}

let rpcId = 1;

export async function rpcCall(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string; code: number } };
  if (json.error) {
    throw new SigilError(`RPC error: ${json.error.message}`, { code: 'RPC_ERROR' });
  }
  return json.result;
}

export async function getGasPrice(rpcUrl: string): Promise<bigint> {
  const result = await rpcCall(rpcUrl, 'eth_gasPrice', []);
  return BigInt(result as string);
}

export async function getNonce(
  rpcUrl: string,
  entryPoint: string,
  account: string,
  key: number = 0,
): Promise<bigint> {
  // getNonce(address,uint192) selector = 0x35567e1a
  const keyHex = key.toString(16).padStart(48, '0');
  const data = '0x35567e1a' + account.slice(2).padStart(64, '0') + keyHex.padStart(64, '0');
  const result = await rpcCall(rpcUrl, 'eth_call', [
    { to: entryPoint, data },
    'latest',
  ]);
  return BigInt(result as string);
}
