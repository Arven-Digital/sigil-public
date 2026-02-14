import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sigilSendAction } from '../src/actions/sigil-send';
import { sigilEvaluateAction } from '../src/actions/sigil-evaluate';
import { sigilStatusAction } from '../src/actions/sigil-status';
import { sigilHistoryAction } from '../src/actions/sigil-history';
import { sigilFreezeAction } from '../src/actions/sigil-freeze';
import { sigilPolicyAction } from '../src/actions/sigil-policy';
import { sigilBalanceAction } from '../src/actions/sigil-balance';
import { sigilRotateKeyAction } from '../src/actions/sigil-rotate-key';
import { sigilTransferTokenAction } from '../src/actions/sigil-transfer-token';
import type { ElizaRuntime, ElizaMessage } from '../src/types';

// ─── Mock SDK ───

function createMockSdk(overrides: Record<string, any> = {}) {
  return {
    evaluate: vi.fn().mockResolvedValue({
      verdict: 'APPROVED',
      riskScore: 25,
      guardianSignature: '0xabc',
      rejectionReason: null,
      layers: {
        layer1: { result: 'PASS' },
        layer2: { result: 'PASS' },
        layer3: { result: 'PASS', score: 25 },
      },
      evaluationMs: 42,
    }),
    buildUserOp: vi.fn().mockResolvedValue({
      sender: '0x1234567890123456789012345678901234567890',
      nonce: '0x1',
      callData: '0x',
      callGasLimit: '0x186A0',
      verificationGasLimit: '0x186A0',
      preVerificationGas: '0x5208',
      maxFeePerGas: '0x6FC23AC00',
      maxPriorityFeePerGas: '0x3B9ACA00',
      signature: '0xsig',
    }),
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
        allowed_targets: [],
        allowed_functions: [],
        blocked_addresses: [],
        version: 1,
      },
      stats: { totalTransactions: 42, blockedTransactions: 3 },
    }),
    getTransactions: vi.fn().mockResolvedValue({
      transactions: [
        { target: '0xabcdef1234567890abcdef1234567890abcdef12', verdict: 'APPROVED', risk_score: 15, submitted_at: '2026-01-01' },
      ],
      count: 1,
    }),
    freeze: vi.fn().mockResolvedValue({ success: true, frozenAt: '2026-01-01T00:00:00Z' }),
    getPolicy: vi.fn().mockResolvedValue({
      max_tx_value: '1000000000000000000',
      daily_limit: '5000000000000000000',
      weekly_limit: '20000000000000000000',
      allowed_targets: [],
      allowed_functions: [],
      blocked_addresses: [],
      version: 1,
    }),
    updatePolicy: vi.fn().mockResolvedValue({
      max_tx_value: '1000000000000000000',
      daily_limit: '5000000000000000000',
      weekly_limit: '20000000000000000000',
      allowed_targets: [],
      allowed_functions: [],
      blocked_addresses: [],
      version: 2,
    }),
    rotateKey: vi.fn().mockResolvedValue({ success: true, newAgentKey: '0xnewkey' }),
    ...overrides,
  } as any;
}

const mockRuntime: ElizaRuntime = {
  getSetting: () => undefined,
  composeState: async (msg) => ({}),
};

function msg(text: string, extra: Record<string, any> = {}): ElizaMessage {
  return { content: { text, ...extra } };
}

// ─── Tests ───

describe('sigil_send', () => {
  it('should approve and build UserOp for valid send', async () => {
    const sdk = createMockSdk();
    const action = sigilSendAction(sdk, 60);
    const cb = vi.fn();

    const result = await action.handler(
      mockRuntime,
      msg('Send 0.1 ETH to 0x742d35CC6634c0532925a3B844bc9e7595F2Bd28'),
      {},
      {},
      cb
    );

    expect(result).toBe(true);
    expect(sdk.evaluate).toHaveBeenCalled();
    expect(sdk.buildUserOp).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      verdict: 'APPROVED',
    }));
  });

  it('should reject when risk too high', async () => {
    const sdk = createMockSdk({
      evaluate: vi.fn().mockResolvedValue({
        verdict: 'APPROVED',
        riskScore: 80,
        layers: { layer1: { result: 'PASS' } },
        evaluationMs: 10,
      }),
    });
    const action = sigilSendAction(sdk, 60);
    const cb = vi.fn();

    const result = await action.handler(
      mockRuntime,
      msg('Send 1 ETH to 0x742d35CC6634c0532925a3B844bc9e7595F2Bd28'),
      {},
      {},
      cb
    );

    expect(result).toBe(false);
    expect(cb.mock.calls[0][0].text).toContain('Risk score 80');
  });

  it('should reject when guardian rejects', async () => {
    const sdk = createMockSdk({
      evaluate: vi.fn().mockResolvedValue({
        verdict: 'REJECTED',
        riskScore: 90,
        rejectionReason: 'Blocked address',
        layers: { layer1: { result: 'FAIL' } },
        evaluationMs: 5,
      }),
    });
    const action = sigilSendAction(sdk, 60);
    const cb = vi.fn();

    const result = await action.handler(
      mockRuntime,
      msg('Send 1 ETH to 0x742d35CC6634c0532925a3B844bc9e7595F2Bd28'),
      {},
      {},
      cb
    );

    expect(result).toBe(false);
    expect(cb.mock.calls[0][0].text).toContain('rejected');
  });

  it('should fail validation without address', async () => {
    const sdk = createMockSdk();
    const action = sigilSendAction(sdk, 60);
    expect(await action.validate(mockRuntime, msg('Send some ETH'))).toBe(false);
  });

  it('should send 0 ETH when no amount specified', async () => {
    const sdk = createMockSdk();
    const action = sigilSendAction(sdk, 60);
    const cb = vi.fn();

    await action.handler(mockRuntime, msg('Send to 0x742d35CC6634c0532925a3B844bc9e7595F2Bd28'), {}, {}, cb);
    // parseEthAmount picks up "0" from the hex — sends 0 ETH which is valid
    expect(cb.mock.calls[0][0].text).toContain('0 ETH');
  });
});

describe('sigil_evaluate', () => {
  it('should return evaluation results', async () => {
    const sdk = createMockSdk();
    const action = sigilEvaluateAction(sdk);
    const cb = vi.fn();

    await action.handler(
      mockRuntime,
      msg('Check 0.5 ETH to 0x742d35CC6634c0532925a3B844bc9e7595F2Bd28'),
      {},
      {},
      cb
    );

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'APPROVED' }));
  });
});

describe('sigil_status', () => {
  it('should return account status', async () => {
    const sdk = createMockSdk();
    const action = sigilStatusAction(sdk);
    const cb = vi.fn();

    await action.handler(mockRuntime, msg('wallet status'), {}, {}, cb);
    expect(cb.mock.calls[0][0].text).toContain('Sigil Wallet Status');
    expect(cb.mock.calls[0][0].text).toContain('ACTIVE');
  });
});

describe('sigil_history', () => {
  it('should return transaction history', async () => {
    const sdk = createMockSdk();
    const action = sigilHistoryAction(sdk);
    const cb = vi.fn();

    await action.handler(mockRuntime, msg('show transactions'), {}, {}, cb);
    expect(cb.mock.calls[0][0].text).toContain('Transaction History');
  });

  it('should handle empty history', async () => {
    const sdk = createMockSdk({
      getTransactions: vi.fn().mockResolvedValue({ transactions: [], count: 0 }),
    });
    const action = sigilHistoryAction(sdk);
    const cb = vi.fn();

    await action.handler(mockRuntime, msg('show transactions'), {}, {}, cb);
    expect(cb.mock.calls[0][0].text).toContain('No transactions');
  });
});

describe('sigil_freeze', () => {
  it('should freeze the account', async () => {
    const sdk = createMockSdk();
    const action = sigilFreezeAction(sdk);
    const cb = vi.fn();

    await action.handler(mockRuntime, msg('freeze wallet'), {}, {}, cb);
    expect(sdk.freeze).toHaveBeenCalled();
    expect(cb.mock.calls[0][0].text).toContain('frozen successfully');
  });
});

describe('sigil_policy', () => {
  it('should view policy', async () => {
    const sdk = createMockSdk();
    const action = sigilPolicyAction(sdk);
    const cb = vi.fn();

    await action.handler(mockRuntime, msg('show policy limits'), {}, {}, cb);
    expect(cb.mock.calls[0][0].text).toContain('Policy Limits');
  });

  it('should update daily limit', async () => {
    const sdk = createMockSdk();
    const action = sigilPolicyAction(sdk);
    const cb = vi.fn();

    await action.handler(mockRuntime, msg('set daily limit to 5 ETH'), {}, {}, cb);
    expect(sdk.updatePolicy).toHaveBeenCalled();
    expect(cb.mock.calls[0][0].text).toContain('Policy updated');
  });
});

describe('sigil_rotate_key', () => {
  it('should rotate key', async () => {
    const sdk = createMockSdk();
    const action = sigilRotateKeyAction(sdk);
    const cb = vi.fn();

    await action.handler(mockRuntime, msg('rotate key'), {}, {}, cb);
    expect(sdk.rotateKey).toHaveBeenCalled();
    expect(cb.mock.calls[0][0].text).toContain('rotated successfully');
  });
});

describe('sigil_transfer_token', () => {
  it('should validate with address and amount', async () => {
    const sdk = createMockSdk();
    const action = sigilTransferTokenAction(sdk, 60);
    expect(await action.validate(mockRuntime, msg('Send 100 to 0x742d35CC6634c0532925a3B844bc9e7595F2Bd28'))).toBe(true);
    expect(await action.validate(mockRuntime, msg('hello world'))).toBe(false);
  });

  it('should build transfer calldata', async () => {
    const sdk = createMockSdk();
    const action = sigilTransferTokenAction(sdk, 60);
    const cb = vi.fn();

    await action.handler(
      mockRuntime,
      msg('Send 100 USDC', {
        tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        to: '0x742d35CC6634c0532925a3B844bc9e7595F2Bd28',
        amount: '100',
        decimals: 6,
      }),
      {},
      {},
      cb
    );

    // Verify callback was called and check its content
    expect(cb).toHaveBeenCalled();
    const callbackText = cb.mock.calls[0][0].text;
    expect(callbackText).toContain('approved');
  });
});

describe('error handling', () => {
  it('should show friendly auth error', async () => {
    const sdk = createMockSdk({
      getAccount: vi.fn().mockRejectedValue(new Error('Authentication failed')),
    });
    const action = sigilStatusAction(sdk);
    const cb = vi.fn();

    await action.handler(mockRuntime, msg('status'), {}, {}, cb);
    expect(cb.mock.calls[0][0].text).toContain('🔐');
  });

  it('should show friendly frozen error', async () => {
    const sdk = createMockSdk({
      evaluate: vi.fn().mockRejectedValue(new Error('Account is frozen')),
    });
    const action = sigilSendAction(sdk, 60);
    const cb = vi.fn();

    await action.handler(
      mockRuntime,
      msg('Send 0.1 ETH to 0x742d35CC6634c0532925a3B844bc9e7595F2Bd28'),
      {},
      {},
      cb
    );
    expect(cb.mock.calls[0][0].text).toContain('🧊');
  });
});
