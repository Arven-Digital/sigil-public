import { ethers } from 'ethers';
import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { friendlyError } from '../utils';

export function sigilRotateKeyAction(sdk: SigilSDK): ElizaAction {
  return {
    name: 'SIGIL_ROTATE_KEY',
    description: 'Rotate the agent key for the Sigil wallet. Generates a new key pair and updates the account.',
    similes: ['ROTATE_KEY', 'NEW_KEY', 'CHANGE_KEY', 'REFRESH_KEY', 'KEY_ROTATION'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Rotate my agent key' } },
        { user: '{{agent}}', content: { text: 'Generating a new agent key and rotating.', action: 'SIGIL_ROTATE_KEY' } },
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
        // Accept explicit new key or generate one
        const newKeyParam = message.content.newKey as string | undefined;
        let newPublicKey: string;

        if (newKeyParam) {
          // Validate it's a valid address/public key
          if (!newKeyParam.match(/^0x[0-9a-fA-F]{40}$/)) {
            callback?.({ text: '❌ Invalid key format. Provide a valid Ethereum address.' });
            return false;
          }
          newPublicKey = newKeyParam;
        } else {
          // Generate new wallet
          const newWallet = ethers.Wallet.createRandom();
          newPublicKey = newWallet.address;
          // Note: In production, the new private key should be securely stored
          // We only send the public key (address) to the API
        }

        const result = await sdk.rotateKey(newPublicKey);

        callback?.({
          text: `🔑 Agent key rotated successfully!\nNew key: ${result.newAgentKey}\n\n⚠️ Update your agent configuration with the new key.`,
          newAgentKey: result.newAgentKey,
        });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}
