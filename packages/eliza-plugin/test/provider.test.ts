import { describe, it, expect, vi } from 'vitest';
import { sigilWalletProvider } from '../src/providers/wallet-provider';
import type { ElizaRuntime, ElizaMessage } from '../src/types';

const runtime: ElizaRuntime = { getSetting: () => undefined, composeState: async () => ({}) };
const msg: ElizaMessage = { content: { text: '' } };

describe('sigilWalletProvider', () => {
  it('returns wallet context string', async () => {
    const sdk = {
      getAccount: vi.fn().mockResolvedValue({
        address: '0x1234567890123456789012345678901234567890',
        chain_id: 1,
        tier: 'standard',
        is_frozen: false,
        is_degraded: false,
        policy: {
          max_tx_value: '1000000000000000000',
          daily_limit: '5000000000000000000',
          weekly_limit: '20000000000000000000',
        },
        stats: { totalTransactions: 10, blockedTransactions: 1 },
      }),
    } as any;

    const provider = sigilWalletProvider(sdk);
    const result = await provider.get(runtime, msg);

    expect(result).toContain('Sigil Wallet Context');
    expect(result).toContain('ACTIVE');
    expect(result).toContain('0x1234');
  });

  it('handles API errors gracefully', async () => {
    const sdk = { getAccount: vi.fn().mockRejectedValue(new Error('network')) } as any;
    const provider = sigilWalletProvider(sdk);
    const result = await provider.get(runtime, msg);
    expect(result).toContain('Unable to fetch');
  });
});
