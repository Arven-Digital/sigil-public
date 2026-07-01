import { afterEach, describe, expect, it, vi } from 'vitest';
import { SigilSDK } from '../src/client.js';

const ACCOUNT_ADDRESS = '0x' + 'a'.repeat(40);
const AGENT_PRIVATE_KEY = '0x' + '1'.repeat(64);
const API_URL = 'https://api.example.test';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createSdk() {
  return new SigilSDK({
    apiKey: 'test-api-key',
    accountAddress: ACCOUNT_ADDRESS,
    agentPrivateKey: AGENT_PRIVATE_KEY,
    chainId: 137,
    apiUrl: API_URL,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SigilSDK API compatibility helpers', () => {
  it('authenticates and calls account action endpoints expected by integrations', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'not-a-jwt' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'frozen', frozenAt: '2026-01-01T00:00:00Z' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createSdk().freeze();

    expect(result).toEqual({ status: 'frozen', frozenAt: '2026-01-01T00:00:00Z' });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_URL}/v1/agent/auth/api-key`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ apiKey: 'test-api-key' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_URL}/v1/accounts/${ACCOUNT_ADDRESS}/freeze`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer not-a-jwt' }),
      }),
    );
  });

  it('normalizes session key helper input for agent setup API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'not-a-jwt' }))
      .mockResolvedValueOnce(jsonResponse({
        message: 'Session key configuration ready.',
        contractCall: { method: 'createSessionKey(address,uint256,uint256,uint256,uint256,uint256,bool)' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createSdk().createSessionKey({
      key: '0x' + 'b'.repeat(40),
      validForHours: 6,
      spendLimit: '100000000000000000',
      maxTxValue: '10000000000000000',
      cooldown: 30,
      targets: ['0x' + 'c'.repeat(40)],
      functions: ['0xa9059cbb'],
    });

    expect(result.key).toBe('0x' + 'b'.repeat(40));
    expect(result.validUntil).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_URL}/v1/agent/wallets/${ACCOUNT_ADDRESS}/session-keys`);
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body as string)).toMatchObject({
      key: '0x' + 'b'.repeat(40),
      validForHours: 6,
      spendLimit: '100000000000000000',
      maxTxValue: '10000000000000000',
      cooldownSeconds: 30,
      allowAllTargets: true,
      targets: ['0x' + 'c'.repeat(40)],
      functions: ['0xa9059cbb'],
    });
  });
});
