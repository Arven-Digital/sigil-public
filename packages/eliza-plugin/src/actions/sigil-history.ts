import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { friendlyError } from '../utils';

function parseTransactionLimit(text: string): number {
  const input = text.slice(0, 4096).toLowerCase();
  for (const marker of ['transactions', 'transaction', 'tx']) {
    const markerIndex = input.indexOf(marker);
    if (markerIndex < 0) continue;

    let end = markerIndex;
    while (end > 0 && input[end - 1] === ' ') end -= 1;
    let start = end;
    while (start > 0 && end - start < 2) {
      const code = input.charCodeAt(start - 1);
      if (code < 48 || code > 57) break;
      start -= 1;
    }
    if (start < end) return Math.min(Number(input.slice(start, end)), 50);
  }
  return 10;
}

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
        const limit = parseTransactionLimit(message.content.text);

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
