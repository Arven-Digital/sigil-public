import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaProvider, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { weiToEth } from '../utils';

/**
 * Provider that injects Sigil wallet context into the agent's memory.
 * This gives the agent awareness of its wallet state, balances, and limits.
 */
export function sigilWalletProvider(sdk: SigilSDK): ElizaProvider {
  let cachedContext: string | null = null;
  let cacheTime = 0;
  const CACHE_TTL = 30_000; // 30 seconds

  return {
    name: 'SIGIL_WALLET',
    description: 'Provides Sigil wallet context including address, balance, policy, and status.',
    get: async (_runtime: ElizaRuntime, _message: ElizaMessage, _state?: ElizaState) => {
      const now = Date.now();
      if (cachedContext && now - cacheTime < CACHE_TTL) {
        return cachedContext;
      }

      try {
        const account = await sdk.getAccount();
        const status = account.is_frozen ? 'FROZEN' : account.is_degraded ? 'DEGRADED' : 'ACTIVE';

        cachedContext = [
          `[Sigil Wallet Context]`,
          `Address: ${account.address}`,
          `Chain: ${account.chain_id}`,
          `Status: ${status}`,
          `Tier: ${account.tier}`,
          `Policy: max_tx=${weiToEth(account.policy.max_tx_value)} ETH, daily=${weiToEth(account.policy.daily_limit)} ETH, weekly=${weiToEth(account.policy.weekly_limit)} ETH`,
          `Stats: ${account.stats.totalTransactions} total tx, ${account.stats.blockedTransactions} blocked`,
          account.is_frozen ? '⚠️ WALLET IS FROZEN — all transactions blocked until unfrozen' : '',
        ].filter(Boolean).join('\n');

        cacheTime = now;
        return cachedContext;
      } catch {
        return '[Sigil Wallet Context] Unable to fetch wallet status — API may be unavailable.';
      }
    },
  };
}
