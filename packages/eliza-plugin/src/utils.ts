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
  const input = text.slice(0, 4096);

  for (let start = 0; start < input.length; start++) {
    const code = input.charCodeAt(start);
    if (code < 48 || code > 57) continue;

    // Do not interpret the 0 in an Ethereum address prefix as an amount.
    if (input[start] === '0' && (input[start + 1] === 'x' || input[start + 1] === 'X')) {
      start += 1;
      while (start + 1 < input.length) {
        const next = input.charCodeAt(start + 1);
        const isHex = (next >= 48 && next <= 57) || (next >= 65 && next <= 70) || (next >= 97 && next <= 102);
        if (!isHex) break;
        start += 1;
      }
      continue;
    }

    let end = start;
    while (end < input.length && end - start < 78) {
      const digit = input.charCodeAt(end);
      if (digit < 48 || digit > 57) break;
      end += 1;
    }

    const nextWhole = input.charCodeAt(end);
    if (nextWhole >= 48 && nextWhole <= 57) {
      while (end < input.length) {
        const digit = input.charCodeAt(end);
        if (digit < 48 || digit > 57) break;
        end += 1;
      }
      start = end - 1;
      continue;
    }

    if (input[end] === '.') {
      let fractionEnd = end + 1;
      while (fractionEnd < input.length && fractionEnd - end <= 18) {
        const digit = input.charCodeAt(fractionEnd);
        if (digit < 48 || digit > 57) break;
        fractionEnd += 1;
      }
      const nextFraction = input.charCodeAt(fractionEnd);
      if (nextFraction >= 48 && nextFraction <= 57) {
        while (fractionEnd < input.length) {
          const digit = input.charCodeAt(fractionEnd);
          if (digit < 48 || digit > 57) break;
          fractionEnd += 1;
        }
        start = fractionEnd - 1;
        continue;
      }
      if (fractionEnd > end + 1) end = fractionEnd;
    }

    return input.slice(start, end);
  }

  return null;
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
