import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { SigilSDK, SigilRejectionError, AuthError, SigilAPIError } from '../src/index';
import { ethers } from 'ethers';

// ─── Mock API Server ───

const MOCK_PORT = 19876;
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;
const TEST_ACCOUNT = '0x' + 'a'.repeat(40);
const TEST_AGENT_KEY = ethers.Wallet.createRandom().privateKey;

const mockPolicy = {
  max_tx_value: '1000000000000000000',
  daily_limit: '5000000000000000000',
  weekly_limit: '20000000000000000000',
  allowed_targets: [],
  allowed_functions: [],
  blocked_addresses: ['0x' + 'dead'.repeat(10)],
  version: 1,
};

const mockAccount = {
  address: TEST_ACCOUNT,
  owner: '0x' + 'b'.repeat(40),
  agent_key: '0x' + 'c'.repeat(40),
  guardian_key: '0x' + 'd'.repeat(40),
  chain_id: 11155111,
  is_frozen: false,
  is_degraded: false,
  tier: 'standard',
  policy: mockPolicy,
  stats: { totalTransactions: 42, blockedTransactions: 3 },
};

let server: http.Server;

function createMockServer(): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method;

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');

      // Mock JSON-RPC endpoint for EntryPoint nonce
      if (method === 'POST' && path === '/rpc') {
        let rpcBodies: any[];
        try {
          const parsed = JSON.parse(body);
          rpcBodies = Array.isArray(parsed) ? parsed : [parsed];
        } catch { rpcBodies = []; }

        const results = rpcBodies.map((rpcBody: any) => {
          if (rpcBody.method === 'eth_chainId') {
            return { jsonrpc: '2.0', id: rpcBody.id, result: '0xaa36a7' };
          }
          if (rpcBody.method === 'eth_call') {
            // Return ABI-encoded uint256(0) for getNonce
            return { jsonrpc: '2.0', id: rpcBody.id, result: '0x0000000000000000000000000000000000000000000000000000000000000000' };
          }
          return { jsonrpc: '2.0', id: rpcBody.id, result: '0x0000000000000000000000000000000000000000000000000000000000000000' };
        });

        res.writeHead(200);
        res.end(JSON.stringify(results.length === 1 ? results[0] : results));
        return;
      }

      // Auth check
      const auth = req.headers['authorization'];
      if (path !== '/v1/health' && auth !== 'Bearer test-api-key') {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      // Route: GET /v1/accounts/:address
      if (method === 'GET' && path === `/v1/accounts/${TEST_ACCOUNT}`) {
        res.writeHead(200);
        res.end(JSON.stringify(mockAccount));
        return;
      }

      // Route: POST /v1/evaluate
      if (method === 'POST' && path === '/v1/evaluate') {
        const parsed = JSON.parse(body);
        const userOp = parsed.userOp;

        // Simulate guardian evaluation
        const isBigTx = false; // simplified
        const isBlockedTarget = mockPolicy.blocked_addresses.some(
          (addr: string) => body.includes(addr.toLowerCase())
        );

        if (isBlockedTarget) {
          res.writeHead(200);
          res.end(JSON.stringify({
            verdict: 'REJECTED',
            riskScore: 95,
            rejectionReason: 'Target address is blocked',
            layers: {
              layer1: { result: 'FAIL', checks: [{ name: 'blocklist', passed: false }] },
            },
            evaluationMs: 12,
          }));
          return;
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          verdict: 'APPROVED',
          riskScore: 15,
          guardianSignature: '0x' + 'ff'.repeat(65),
          layers: {
            layer1: { result: 'PASS', checks: [{ name: 'blocklist', passed: true }] },
            layer2: { result: 'PASS', reason: 'Within limits' },
            layer3: { result: 'PASS', score: 0.15, reasoning: 'Low risk transfer' },
          },
          evaluationMs: 45,
        }));
        return;
      }

      // Route: PUT /v1/accounts/:address/policy
      if (method === 'PUT' && path === `/v1/accounts/${TEST_ACCOUNT}/policy`) {
        const parsed = JSON.parse(body);
        res.writeHead(200);
        res.end(JSON.stringify({
          ...mockPolicy,
          ...parsed,
          version: mockPolicy.version + 1,
        }));
        return;
      }

      // Route: GET /v1/transactions
      if (method === 'GET' && path === '/v1/transactions') {
        res.writeHead(200);
        res.end(JSON.stringify({
          transactions: [
            { id: '1', verdict: 'APPROVED', riskScore: 10 },
            { id: '2', verdict: 'REJECTED', riskScore: 85 },
          ],
          count: 2,
        }));
        return;
      }

      // Route: POST /v1/accounts/:address/freeze
      if (method === 'POST' && path === `/v1/accounts/${TEST_ACCOUNT}/freeze`) {
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, frozenAt: new Date().toISOString() }));
        return;
      }

      // Route: POST /v1/accounts/:address/rotate-key
      if (method === 'POST' && path === `/v1/accounts/${TEST_ACCOUNT}/rotate-key`) {
        const parsed = JSON.parse(body);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, newAgentKey: parsed.newAgentKey }));
        return;
      }

      // Route: GET /v1/audit
      if (method === 'GET' && path === '/v1/audit') {
        res.writeHead(200);
        res.end(JSON.stringify({ events: [{ type: 'EVALUATION', ts: Date.now() }] }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  });
}

// ─── Tests ───

describe('SigilSDK E2E Integration', () => {
  let sdk: SigilSDK;

  beforeAll(async () => {
    server = createMockServer();
    await new Promise<void>((resolve) => server.listen(MOCK_PORT, resolve));

    sdk = new SigilSDK({
      apiUrl: MOCK_URL,
      apiKey: 'test-api-key',
      agentKey: TEST_AGENT_KEY,
      accountAddress: TEST_ACCOUNT,
      chainId: 11155111,
      maxRetries: 0, // no retries in tests for speed
    });
    // Set mock RPC provider for nonce fetching
    sdk.setProvider(`${MOCK_URL}/rpc`);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ─── Account ───

  it('getAccount returns account info', async () => {
    const account = await sdk.getAccount();
    expect(account.address).toBe(TEST_ACCOUNT);
    expect(account.chain_id).toBe(11155111);
    expect(account.is_frozen).toBe(false);
    expect(account.stats.totalTransactions).toBe(42);
  });

  // ─── Policy ───

  it('getPolicy returns current policy', async () => {
    const policy = await sdk.getPolicy();
    expect(policy.version).toBe(1);
    expect(policy.blocked_addresses).toHaveLength(1);
  });

  it('updatePolicy updates and returns new policy', async () => {
    const updated = await sdk.updatePolicy({
      dailyLimit: '10000000000000000000',
      updatedBy: '0x' + 'b'.repeat(40),
    });
    expect(updated.version).toBe(2);
  });

  // ─── Transaction Evaluation (full round-trip) ───

  it('evaluateTransaction: approved tx', async () => {
    const result = await sdk.evaluateTransaction({
      target: '0x' + '1'.repeat(40),
      value: '1000000000000000', // 0.001 ETH
    });

    expect(result.verdict).toBe('APPROVED');
    expect(result.riskScore).toBeLessThan(50);
    expect(result.guardianSignature).toBeDefined();
    expect(result.layers.layer1.result).toBe('PASS');
    expect(result.evaluationMs).toBeGreaterThan(0);
  });

  it('signAndEvaluate: approved tx returns result', async () => {
    const result = await sdk.signAndEvaluate({
      target: '0x' + '1'.repeat(40),
      value: '500000000000000',
    });

    expect(result.verdict).toBe('APPROVED');
  });

  // ─── Transactions ───

  it('getTransactions returns list', async () => {
    const result = await sdk.getTransactions({ limit: 10 });
    expect(result.transactions).toHaveLength(2);
    expect(result.count).toBe(2);
  });

  // ─── Emergency Controls ───

  it('freeze returns success', async () => {
    const result = await sdk.freeze();
    expect(result.success).toBe(true);
    expect(result.frozenAt).toBeDefined();
  });

  // ─── Key Rotation ───

  it('rotateKey returns success', async () => {
    const newKey = '0x' + 'e'.repeat(40);
    const result = await sdk.rotateKey(newKey);
    expect(result.success).toBe(true);
    expect(result.newAgentKey).toBe(newKey);
  });

  // ─── UserOp Builder ───

  it('buildUserOp constructs valid UserOperation', async () => {
    const userOp = await sdk.buildUserOp({
      target: '0x' + '1'.repeat(40),
      value: '1000000000000000',
    });

    expect(userOp.sender).toBe(TEST_ACCOUNT);
    expect(userOp.callData).toContain('0x');
    expect(userOp.signature).not.toBe('0x'); // signed with agent key
    expect(userOp.callGasLimit).toBe('0x186A0');
  });

  // ─── Error Handling ───

  it('throws AuthError on 401', async () => {
    const noAuthSdk = new SigilSDK({
      apiUrl: MOCK_URL,
      accountAddress: TEST_ACCOUNT,
      apiKey: 'wrong-key',
      maxRetries: 0,
    });

    await expect(noAuthSdk.getAccount()).rejects.toThrow(AuthError);
  });

  it('signAndEvaluate without agentKey throws AuthError', async () => {
    const noKeySdk = new SigilSDK({
      apiUrl: MOCK_URL,
      apiKey: 'test-api-key',
      accountAddress: TEST_ACCOUNT,
      maxRetries: 0,
    });

    await expect(
      noKeySdk.signAndEvaluate({ target: '0x' + '1'.repeat(40), value: '1000' })
    ).rejects.toThrow(AuthError);
  });

  // ─── Audit Log ───

  it('getAuditLog returns events', async () => {
    const result = await sdk.getAuditLog(10);
    expect(result.events).toHaveLength(1);
  });
});
