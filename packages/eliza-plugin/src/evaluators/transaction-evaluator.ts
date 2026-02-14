import type { ElizaEvaluator, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { hasTransactionIntent } from '../utils';

/**
 * Evaluator that detects transaction intent in messages.
 * When triggered, it flags the message so actions like SIGIL_SEND
 * or SIGIL_TRANSFER_TOKEN can pick it up.
 */
export function sigilTransactionEvaluator(): ElizaEvaluator {
  return {
    name: 'SIGIL_TRANSACTION_INTENT',
    description: 'Detects if a message contains intent to perform a blockchain transaction.',
    similes: ['TX_INTENT', 'TRANSACTION_DETECTOR'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Send 0.5 ETH to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28' } },
      ],
      [
        { user: '{{user1}}', content: { text: 'Transfer 100 USDC to my friend' } },
      ],
    ],
    validate: async (_runtime: ElizaRuntime, message: ElizaMessage) => {
      return hasTransactionIntent(message.content.text);
    },
    handler: async (
      _runtime: ElizaRuntime,
      message: ElizaMessage,
      state?: ElizaState,
      _options?: Record<string, any>,
      callback?: (response: { text: string; [key: string]: any }) => void
    ) => {
      const text = message.content.text;
      const hasIntent = hasTransactionIntent(text);

      if (hasIntent && state) {
        state.sigilTransactionIntent = true;
        state.sigilRawMessage = text;
      }

      return hasIntent;
    },
  };
}
