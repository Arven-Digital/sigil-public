import { describe, it, expect } from 'vitest';
import {
  parseAddress, parseEthAmount, hasTransactionIntent,
  ethToWei, weiToEth, friendlyError, sanitize,
} from '../src/utils';

describe('parseAddress', () => {
  it('extracts valid address', () => {
    expect(parseAddress('send to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28')).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28');
  });
  it('returns null for no address', () => {
    expect(parseAddress('hello world')).toBeNull();
  });
});

describe('parseEthAmount', () => {
  it('parses "0.5 ETH"', () => expect(parseEthAmount('0.5 ETH')).toBe('0.5'));
  it('parses "1.2"', () => expect(parseEthAmount('send 1.2')).toBe('1.2'));
  it('returns null for no amount', () => expect(parseEthAmount('hello')).toBeNull());
});

describe('hasTransactionIntent', () => {
  it('detects send + address', () => {
    expect(hasTransactionIntent('Send 1 ETH to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28')).toBe(true);
  });
  it('detects transfer + amount', () => {
    expect(hasTransactionIntent('transfer 100 usdc to someone')).toBe(true);
  });
  it('rejects unrelated text', () => {
    expect(hasTransactionIntent('what is the weather?')).toBe(false);
  });
});

describe('ethToWei / weiToEth', () => {
  it('converts 1 ETH to wei', () => expect(ethToWei('1')).toBe('1000000000000000000'));
  it('converts 0.5 ETH to wei', () => expect(ethToWei('0.5')).toBe('500000000000000000'));
  it('converts wei to ETH', () => expect(weiToEth('1000000000000000000')).toBe('1.000000'));
});

describe('friendlyError', () => {
  it('maps auth errors', () => expect(friendlyError(new Error('Authentication failed'))).toContain('🔐'));
  it('maps frozen errors', () => expect(friendlyError(new Error('frozen'))).toContain('🧊'));
  it('maps timeout errors', () => expect(friendlyError(new Error('timed out'))).toContain('⏱️'));
  it('maps nonce errors', () => expect(friendlyError(new Error('RPC provider required'))).toContain('⚙️'));
  it('passes through unknown', () => expect(friendlyError(new Error('something'))).toContain('something'));
});

describe('sanitize', () => {
  it('redacts sensitive keys', () => {
    const result = sanitize({ apiKey: 'secret', foo: 'bar' });
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.foo).toBe('bar');
  });
});
