/**
 * Shared utilities for Sigil plugin actions
 */

import { SigilSDK } from '@sigil-protocol/sdk';
import type { SigilPluginConfig } from './types';

/** Sanitize data for logging — redact secrets */
export function sanitize(data: any): any {
  if (!data) return '';
  return JSON.parse(JSON.stringify(data, (k, v) =>
    ['apiKey', 'agentKey', 'signature', 'guardianSignature', 'privateKey'].includes(k) ? '[REDACTED]' : v
  ));
}

/** Create a configured SDK instance */
export function createSdk(config: SigilPluginConfig): SigilSDK {
  const sdk = new SigilSDK(config);
  if (config.rpcUrl) {
    sdk.setProvider(config.rpcUrl, config.entryPointAddress);
  }
  return sdk;
}

/** Parse an ETH address from text */
export function parseAddress(text: string): string | null {
  const match = text.match(/0x[0-9a-fA-F]{40}/);
  return match ? match[0] : null;
}

/** Parse an ETH amount from text (e.g. "0.5 ETH", "1.2") */
export function parseEthAmount(text: string): string | null {
  const match = text.match(/(\d+\.?\d*)\s*(?:ETH|eth|Eth)?/);
  return match ? match[1] : null;
}

/** Check if text contains transaction intent */
export function hasTransactionIntent(text: string): boolean {
  const lower = text.toLowerCase();
  const keywords = [
    'send', 'transfer', 'pay', 'swap', 'deposit',
    'withdraw', 'approve', 'bridge', 'stake',
  ];
  const hasKeyword = keywords.some(k => lower.includes(k));
  const hasAddress = /0x[0-9a-fA-F]{40}/.test(text);
  const hasAmount = /\d+\.?\d*\s*(?:eth|token|usdc|usdt|dai)/i.test(text);
  return hasKeyword && (hasAddress || hasAmount);
}

/** Format wei to ETH string */
export function weiToEth(wei: string | bigint): string {
  const val = BigInt(wei);
  const eth = Number(val) / 1e18;
  return eth.toFixed(6);
}

/** Parse ETH string to wei */
export function ethToWei(eth: string): string {
  const parts = eth.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(18, '0').slice(0, 18);
  return BigInt(whole + frac).toString();
}

/** User-friendly error message from SDK errors */
export function friendlyError(err: any): string {
  const msg = err?.message || String(err);
  if (msg.includes('Authentication failed') || msg.includes('401')) {
    return '🔐 Authentication failed. Please check your API key or agent key configuration.';
  }
  if (msg.includes('frozen')) {
    return '🧊 Account is frozen. Use sigil_unfreeze to reactivate it first.';
  }
  if (msg.includes('timed out')) {
    return '⏱️ Request timed out. The Sigil API may be temporarily unavailable.';
  }
  if (msg.includes('nonce') || msg.includes('RPC provider required')) {
    return '⚙️ RPC provider not configured. Set rpcUrl in plugin config for on-chain operations.';
  }
  if (msg.includes('Invalid target address')) {
    return '❌ Invalid Ethereum address. Please provide a valid 0x address.';
  }
  return `❌ ${msg}`;
}
