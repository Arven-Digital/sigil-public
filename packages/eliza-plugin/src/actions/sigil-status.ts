import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { friendlyError, weiToEth } from '../utils';

export function sigilStatusAction(sdk: SigilSDK): ElizaAction {
  return {
    name: 'SIGIL_STATUS',
    description: 'Get the current status of the Sigil-secured wallet including policy limits and guardian health.',
    similes: ['WALLET_STATUS', 'ACCOUNT_STATUS', 'SIGIL_INFO', 'CHECK_WALLET'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'What\'s the status of my Sigil wallet?' } },
        { user: '{{agent}}', content: { text: 'Let me check your Sigil wallet status.', action: 'SIGIL_STATUS' } },
      ],
    ],
    validate: async () => true,
    handler: async (
      _runtime: ElizaRuntime,
      _message: ElizaMessage,
      _state?: ElizaState,
      _options?: Record<string, any>,
      callback?: (response: { text: string; [key: string]: any }) => void
    ) => {
      try {
        const account = await sdk.getAccount();
        const status = account.is_frozen ? '🧊 FROZEN' : account.is_degraded ? '⚠️ DEGRADED' : '✅ ACTIVE';

        callback?.({
          text: [
            `🛡️ Sigil Wallet Status`,
            `Address: ${account.address}`,
            `Status: ${status}`,
            `Tier: ${account.tier}`,
            `Chain: ${account.chain_id}`,
            ``,
            `📋 Policy Limits:`,
            `  Max tx: ${weiToEth(account.policy.max_tx_value)} ETH`,
            `  Daily: ${weiToEth(account.policy.daily_limit)} ETH`,
            `  Weekly: ${weiToEth(account.policy.weekly_limit)} ETH`,
            ``,
            `📊 Stats:`,
            `  Total transactions: ${account.stats.totalTransactions}`,
            `  Blocked: ${account.stats.blockedTransactions}`,
          ].join('\n'),
          account,
        });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}
