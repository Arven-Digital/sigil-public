import { describe, it, expect } from 'vitest';
import { sigilTransactionEvaluator } from '../src/evaluators/transaction-evaluator';
import type { ElizaRuntime, ElizaMessage } from '../src/types';

const runtime: ElizaRuntime = { getSetting: () => undefined, composeState: async () => ({}) };
const msg = (text: string): ElizaMessage => ({ content: { text } });

describe('sigilTransactionEvaluator', () => {
  const evaluator = sigilTransactionEvaluator();

  it('validates transaction intent', async () => {
    expect(await evaluator.validate(runtime, msg('Send 1 ETH to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28'))).toBe(true);
  });

  it('rejects non-transaction messages', async () => {
    expect(await evaluator.validate(runtime, msg('What is Sigil?'))).toBe(false);
  });

  it('sets state flag on handler', async () => {
    const state: any = {};
    await evaluator.handler(runtime, msg('Send 1 ETH to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28'), state);
    expect(state.sigilTransactionIntent).toBe(true);
  });
});
