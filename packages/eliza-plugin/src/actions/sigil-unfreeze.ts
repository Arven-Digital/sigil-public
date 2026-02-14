import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { friendlyError } from '../utils';

export function sigilUnfreezeAction(sdk: SigilSDK): ElizaAction {
  return {
    name: 'SIGIL_UNFREEZE',
    description: 'Unfreeze a frozen Sigil wallet. Requires owner authorization.',
    similes: ['UNFREEZE_WALLET', 'UNLOCK_WALLET', 'THAW_WALLET', 'REACTIVATE_WALLET'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Unfreeze my wallet, the threat has been resolved' } },
        { user: '{{agent}}', content: { text: 'Unfreezing your Sigil wallet now.', action: 'SIGIL_UNFREEZE' } },
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
        // SDK doesn't have unfreeze yet — call API directly via internal method
        // We access the SDK's request method pattern
        const account = await sdk.getAccount();
        if (!account.is_frozen) {
          callback?.({ text: '✅ Wallet is already active — no need to unfreeze.' });
          return true;
        }

        // Use the SDK's built-in HTTP client pattern
        const response = await fetch(`${(sdk as any).apiUrl}/v1/accounts/${account.address}/unfreeze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...((sdk as any).apiKey ? { 'Authorization': `Bearer ${(sdk as any).apiKey}` } : {}),
          },
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Failed to unfreeze' }));
          throw new Error((err as any).error ?? 'Failed to unfreeze account');
        }

        callback?.({
          text: '🔓 Wallet unfrozen successfully! Your account is now active and transactions are enabled.',
          frozen: false,
        });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}
