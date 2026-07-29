import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { weiToEth, ethToWei, friendlyError, parseEthAmount } from '../utils';

function amountAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const index = text.indexOf(label);
    if (index >= 0) {
      const value = parseEthAmount(text.slice(index + label.length, index + label.length + 96));
      if (value) return value;
    }
  }
  return null;
}

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
        const text = message.content.text.slice(0, 4096).toLowerCase();
        const isUpdate = ['set', 'update', 'change', 'increase', 'decrease'].some(word => text.includes(word))
          || (text.includes('limit') && text.includes('to'));

        if (isUpdate) {
          // Parse update parameters
          const params: any = { updatedBy: 'agent' };

          const dailyMatch = amountAfterLabel(text, ['daily']);
          const weeklyMatch = amountAfterLabel(text, ['weekly']);
          const maxTxMatch = amountAfterLabel(text, ['maximum', 'max']);

          if (dailyMatch) params.dailyLimit = ethToWei(dailyMatch);
          if (weeklyMatch) params.weeklyLimit = ethToWei(weeklyMatch);
          if (maxTxMatch) params.maxTxValue = ethToWei(maxTxMatch);

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
