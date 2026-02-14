import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { friendlyError } from '../utils';

export function sigilFreezeAction(sdk: SigilSDK): ElizaAction {
  return {
    name: 'SIGIL_FREEZE',
    description: 'Emergency freeze the wallet. Blocks all transactions until unfrozen by owner.',
    similes: ['FREEZE_WALLET', 'EMERGENCY_FREEZE', 'LOCK_WALLET', 'SIGIL_LOCK'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Freeze my wallet immediately, I think it\'s compromised' } },
        { user: '{{agent}}', content: { text: '🚨 Freezing your Sigil wallet now.', action: 'SIGIL_FREEZE' } },
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
        const result = await sdk.freeze();
        const reason = message.content.reason ?? message.content.text;
        callback?.({
          text: `🧊 Wallet frozen successfully.\nFrozen at: ${result.frozenAt}\nReason: ${reason}\n\nUse SIGIL_UNFREEZE to reactivate when safe.`,
          frozen: true,
          frozenAt: result.frozenAt,
        });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}
