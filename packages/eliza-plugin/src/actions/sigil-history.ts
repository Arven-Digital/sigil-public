import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { friendlyError } from '../utils';

export function sigilHistoryAction(sdk: SigilSDK): ElizaAction {
  return {
    name: 'SIGIL_HISTORY',
    description: 'Get recent transaction history with guardian verdicts.',
    similes: ['TX_HISTORY', 'TRANSACTION_HISTORY', 'RECENT_TRANSACTIONS', 'SIGIL_TRANSACTIONS'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Show me my recent transactions' } },
        { user: '{{agent}}', content: { text: 'Here\'s your recent Sigil transaction history.', action: 'SIGIL_HISTORY' } },
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
        const limitMatch = message.content.text.match(/(\d+)\s*(?:transactions?|tx)/i);
        const limit = limitMatch ? Math.min(parseInt(limitMatch[1]), 50) : 10;

        const result = await sdk.getTransactions({ limit });

        if (result.transactions.length === 0) {
          callback?.({ text: '📭 No transactions found.' });
          return true;
        }

        const lines = result.transactions.map((tx: any, i: number) => {
          const icon = tx.verdict === 'APPROVED' ? '✅' : '🚫';
          return `${i + 1}. ${icon} ${tx.target?.slice(0, 10)}... | ${tx.verdict} | Risk: ${tx.risk_score ?? '?'} | ${tx.submitted_at ?? ''}`;
        });

        callback?.({
          text: `📜 Transaction History (${result.transactions.length}/${result.count})\n\n${lines.join('\n')}`,
          transactions: result.transactions,
          total: result.count,
        });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}
