import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { parseAddress, parseEthAmount, ethToWei, friendlyError } from '../utils';

export function sigilEvaluateAction(sdk: SigilSDK): ElizaAction {
  return {
    name: 'SIGIL_EVALUATE',
    description: 'Evaluate a transaction through Guardian without executing. Returns risk score and verdict.',
    similes: ['CHECK_TRANSACTION', 'EVALUATE_TX', 'RISK_CHECK', 'SIGIL_CHECK'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Check if sending 1 ETH to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28 is safe' } },
        { user: '{{agent}}', content: { text: 'I\'ll evaluate that transaction through Sigil Guardian.', action: 'SIGIL_EVALUATE' } },
      ],
    ],
    validate: async (_runtime: ElizaRuntime, message: ElizaMessage) => {
      const text = message.content.text;
      return !!parseAddress(text);
    },
    handler: async (
      _runtime: ElizaRuntime,
      message: ElizaMessage,
      _state?: ElizaState,
      _options?: Record<string, any>,
      callback?: (response: { text: string; [key: string]: any }) => void
    ) => {
      const text = message.content.text;
      const target = parseAddress(text);
      const amount = parseEthAmount(text) ?? '0';

      if (!target) {
        callback?.({ text: '❌ Please provide a target address to evaluate.' });
        return false;
      }

      try {
        const result = await sdk.evaluate({
          target,
          value: ethToWei(amount),
          data: message.content.data ?? '0x',
        });

        const layers = [
          `  Layer 1 (Rules): ${result.layers.layer1.result}`,
          `  Layer 2 (Simulation): ${result.layers.layer2?.result ?? 'SKIPPED'}`,
          `  Layer 3 (Risk): ${result.layers.layer3?.result ?? 'SKIPPED'}`,
        ].join('\n');

        callback?.({
          text: `📊 Evaluation Result\nVerdict: ${result.verdict === 'APPROVED' ? '✅' : '🚫'} ${result.verdict}\nRisk Score: ${result.riskScore}/100\nTime: ${result.evaluationMs}ms\n\nLayers:\n${layers}`,
          verdict: result.verdict,
          riskScore: result.riskScore,
          evaluationMs: result.evaluationMs,
        });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}
