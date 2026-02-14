import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { weiToEth, ethToWei, friendlyError } from '../utils';

export function sigilPolicyAction(sdk: SigilSDK): ElizaAction {
  return {
    name: 'SIGIL_POLICY',
    description: 'View or update policy limits for the Sigil wallet (max transaction value, daily/weekly limits).',
    similes: ['VIEW_POLICY', 'UPDATE_POLICY', 'SET_LIMITS', 'POLICY_LIMITS', 'SPENDING_LIMITS'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Show me my policy limits' } },
        { user: '{{agent}}', content: { text: 'Here are your current Sigil policy limits.', action: 'SIGIL_POLICY' } },
      ],
      [
        { user: '{{user1}}', content: { text: 'Set my daily limit to 5 ETH' } },
        { user: '{{agent}}', content: { text: 'Updating your daily limit to 5 ETH.', action: 'SIGIL_POLICY' } },
      ],
    ],
    validate: async () => true,
    handler: async (
      _runtime: ElizaRuntime,
      message: ElizaMessage,
      _state?: ElizaState,
      _options?: Record<string, any>,
      callback?: (response: { text: string; [key: string]: any }) => void
    ) => {
      try {
        const text = message.content.text.toLowerCase();
        const isUpdate = /set|update|change|increase|decrease|limit.*to/i.test(text);

        if (isUpdate) {
          // Parse update parameters
          const params: any = { updatedBy: 'agent' };

          const dailyMatch = text.match(/daily\s*(?:limit)?\s*(?:to)?\s*(\d+\.?\d*)\s*eth/i);
          const weeklyMatch = text.match(/weekly\s*(?:limit)?\s*(?:to)?\s*(\d+\.?\d*)\s*eth/i);
          const maxTxMatch = text.match(/(?:max|maximum)\s*(?:tx|transaction)?\s*(?:value)?\s*(?:to)?\s*(\d+\.?\d*)\s*eth/i);

          if (dailyMatch) params.dailyLimit = ethToWei(dailyMatch[1]);
          if (weeklyMatch) params.weeklyLimit = ethToWei(weeklyMatch[1]);
          if (maxTxMatch) params.maxTxValue = ethToWei(maxTxMatch[1]);

          if (!dailyMatch && !weeklyMatch && !maxTxMatch) {
            callback?.({ text: '❌ Could not parse policy update. Try: "Set daily limit to 5 ETH" or "Set max transaction to 1 ETH"' });
            return false;
          }

          const policy = await sdk.updatePolicy(params);
          callback?.({
            text: `✅ Policy updated!\n  Max tx: ${weiToEth(policy.max_tx_value)} ETH\n  Daily: ${weiToEth(policy.daily_limit)} ETH\n  Weekly: ${weiToEth(policy.weekly_limit)} ETH`,
            policy,
          });
        } else {
          // View policy
          const policy = await sdk.getPolicy();
          callback?.({
            text: [
              '📋 Current Policy Limits',
              `  Max transaction: ${weiToEth(policy.max_tx_value)} ETH`,
              `  Daily limit: ${weiToEth(policy.daily_limit)} ETH`,
              `  Weekly limit: ${weiToEth(policy.weekly_limit)} ETH`,
              `  Allowed targets: ${policy.allowed_targets.length === 0 ? 'Any' : policy.allowed_targets.length + ' addresses'}`,
              `  Blocked addresses: ${policy.blocked_addresses.length}`,
              `  Version: ${policy.version}`,
            ].join('\n'),
            policy,
          });
        }
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}
