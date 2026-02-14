import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SigilSDK, RecoveryError, UpgradeError, NetworkError } from '../src/index';
import { ethers } from 'ethers';
import http from 'node:http';

const TEST_ACCOUNT = '0x' + 'a'.repeat(40);
const TEST_GUARDIAN = '0x' + 'b'.repeat(40);
const TEST_NEW_OWNER = '0x' + 'c'.repeat(40);
const TEST_IMPL = '0x' + 'd'.repeat(40);
const TEST_RECOVERY_ID = '0x' + 'f'.repeat(64);
const TEST_AGENT_KEY = ethers.Wallet.createRandom().privateKey;

let rpcServer: http.Server | null = null;
let rpcPort = 0;

function startRpcServer(ethCallHandler?: (data: string) => string): Promise<number> {
  return new Promise((resolve) => {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: string) => (body += chunk));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        const parsed = JSON.parse(body);

        // Handle batch requests
        if (Array.isArray(parsed)) {
          const results = parsed.map((p: any) => handleRequest(p));
          res.end(JSON.stringify(results));
          return;
        }
        res.end(JSON.stringify(handleRequest(parsed)));
      });
    });

    function handleRequest(parsed: any): any {
      const method = parsed.method;
      if (method === 'eth_chainId') {
        return { jsonrpc: '2.0', id: parsed.id, result: '0x1' };
      }
      if (method === 'net_version') {
        return { jsonrpc: '2.0', id: parsed.id, result: '1' };
      }
      if (method === 'eth_blockNumber') {
        return { jsonrpc: '2.0', id: parsed.id, result: '0x100' };
      }
      if (method === 'eth_call') {
        const data = parsed.params?.[0]?.data as string;
        if (ethCallHandler) {
          try {
            const result = ethCallHandler(data);
            return { jsonrpc: '2.0', id: parsed.id, result };
          } catch {
            // fall through to default
          }
        }
        // Default: return a padded zero (valid uint256)
        return { jsonrpc: '2.0', id: parsed.id, result: '0x' + '0'.repeat(64) };
      }
      return { jsonrpc: '2.0', id: parsed.id, result: '0x' + '0'.repeat(64) };
    }

    rpcServer = server;
    server.listen(0, () => {
      const addr = server.address() as any;
      rpcPort = addr.port;
      resolve(addr.port);
    });
  });
}

function stopRpcServer(): Promise<void> {
  return new Promise((resolve) => {
    if (rpcServer) {
      rpcServer.close(() => resolve());
      rpcServer = null;
    } else {
      resolve();
    }
  });
}

describe('Recovery Methods', () => {
  let sdk: SigilSDK;

  beforeEach(() => {
    sdk = new SigilSDK({
      apiUrl: 'http://localhost:9999',
      agentKey: TEST_AGENT_KEY,
      accountAddress: TEST_ACCOUNT,
      chainId: 1,
    });
  });

  afterEach(async () => {
    await stopRpcServer();
  });

  describe('without provider', () => {
    it('addRecoveryGuardian throws without provider', async () => {
      await expect(sdk.addRecoveryGuardian(TEST_GUARDIAN)).rejects.toThrow(NetworkError);
    });

    it('getRecoveryConfig throws without provider', async () => {
      await expect(sdk.getRecoveryConfig()).rejects.toThrow(NetworkError);
    });

    it('getRecoveryStatus throws without provider', async () => {
      await expect(sdk.getRecoveryStatus(TEST_RECOVERY_ID)).rejects.toThrow(NetworkError);
    });

    it('getUpgradeStatus throws without provider', async () => {
      await expect(sdk.getUpgradeStatus()).rejects.toThrow(NetworkError);
    });
  });

  describe('input validation', () => {
    it('addRecoveryGuardian rejects invalid address', async () => {
      await expect(sdk.addRecoveryGuardian('not-an-address')).rejects.toThrow(RecoveryError);
    });

    it('removeRecoveryGuardian rejects invalid address', async () => {
      await expect(sdk.removeRecoveryGuardian('bad')).rejects.toThrow(RecoveryError);
    });

    it('setRecoveryThreshold rejects zero', async () => {
      await expect(sdk.setRecoveryThreshold(0)).rejects.toThrow(RecoveryError);
    });

    it('setRecoveryDelay rejects less than 48h', async () => {
      await expect(sdk.setRecoveryDelay(3600)).rejects.toThrow(RecoveryError);
    });

    it('initiateRecovery rejects invalid address', async () => {
      await expect(sdk.initiateRecovery('bad')).rejects.toThrow(RecoveryError);
    });

    it('supportRecovery rejects invalid recovery ID', async () => {
      await expect(sdk.supportRecovery('0x123')).rejects.toThrow(RecoveryError);
    });

    it('executeRecovery rejects invalid recovery ID', async () => {
      await expect(sdk.executeRecovery('bad')).rejects.toThrow(RecoveryError);
    });

    it('cancelRecovery rejects invalid recovery ID', async () => {
      await expect(sdk.cancelRecovery('0xshort')).rejects.toThrow(RecoveryError);
    });
  });

  describe('with provider (UserOp building)', () => {
    beforeEach(async () => {
      const port = await startRpcServer();
      sdk.setProvider(`http://127.0.0.1:${port}`);
    });

    it('addRecoveryGuardian builds a UserOperation', async () => {
      const userOp = await sdk.addRecoveryGuardian(TEST_GUARDIAN);
      expect(userOp.sender).toBe(TEST_ACCOUNT);
      expect(userOp.callData).toContain('b61d27f6'); // execute selector
      expect(userOp.signature).not.toBe('0x');
    });

    it('removeRecoveryGuardian builds a UserOperation', async () => {
      const userOp = await sdk.removeRecoveryGuardian(TEST_GUARDIAN);
      expect(userOp.sender).toBe(TEST_ACCOUNT);
      expect(userOp.signature).not.toBe('0x');
    });

    it('setRecoveryThreshold builds a UserOperation', async () => {
      const userOp = await sdk.setRecoveryThreshold(3);
      expect(userOp.sender).toBe(TEST_ACCOUNT);
    });

    it('setRecoveryDelay builds a UserOperation with valid delay', async () => {
      const userOp = await sdk.setRecoveryDelay(172800);
      expect(userOp.sender).toBe(TEST_ACCOUNT);
    });

    it('initiateRecovery builds a UserOperation', async () => {
      const userOp = await sdk.initiateRecovery(TEST_NEW_OWNER);
      expect(userOp.sender).toBe(TEST_ACCOUNT);
    });

    it('supportRecovery builds a UserOperation', async () => {
      const userOp = await sdk.supportRecovery(TEST_RECOVERY_ID);
      expect(userOp.sender).toBe(TEST_ACCOUNT);
    });

    it('executeRecovery builds a UserOperation', async () => {
      const userOp = await sdk.executeRecovery(TEST_RECOVERY_ID);
      expect(userOp.sender).toBe(TEST_ACCOUNT);
    });

    it('cancelRecovery builds a UserOperation', async () => {
      const userOp = await sdk.cancelRecovery(TEST_RECOVERY_ID);
      expect(userOp.sender).toBe(TEST_ACCOUNT);
    });

    it('requestUpgrade builds a UserOperation', async () => {
      const userOp = await sdk.requestUpgrade(TEST_IMPL);
      expect(userOp.sender).toBe(TEST_ACCOUNT);
      expect(userOp.signature).not.toBe('0x');
    });

    it('cancelUpgrade builds a UserOperation', async () => {
      const userOp = await sdk.cancelUpgrade();
      expect(userOp.sender).toBe(TEST_ACCOUNT);
    });
  });

  describe('getRecoveryConfig', () => {
    it('parses contract response correctly', async () => {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const port = await startRpcServer((data: string) => {
        // getRecoveryConfig selector: 0x79294cb2
        if (data.startsWith('0x79294cb2')) {
          return abiCoder.encode(['uint256', 'uint256', 'uint256'], [2, 3, 172800]);
        }
        // getRecoveryGuardians selector: 0xcb45567e
        if (data.startsWith('0xcb45567e')) {
          return abiCoder.encode(['address[]'], [[TEST_GUARDIAN, TEST_NEW_OWNER, TEST_IMPL]]);
        }
        throw new Error('unhandled');
      });
      sdk.setProvider(`http://127.0.0.1:${port}`);

      const config = await sdk.getRecoveryConfig();
      expect(config.threshold).toBe(2);
      expect(config.guardianCount).toBe(3);
      expect(config.delay).toBe(172800);
      expect(config.guardians).toHaveLength(3);
      expect(config.guardians[0].toLowerCase()).toBe(TEST_GUARDIAN.toLowerCase());
    });
  });

  describe('getRecoveryStatus', () => {
    it('returns pending status', async () => {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const port = await startRpcServer(() => {
        return abiCoder.encode(
          ['address', 'uint256', 'uint256', 'bool', 'bool'],
          [TEST_NEW_OWNER, 1, 0, false, false]
        );
      });
      sdk.setProvider(`http://127.0.0.1:${port}`);

      const result = await sdk.getRecoveryStatus(TEST_RECOVERY_ID);
      expect(result.status).toBe('pending');
      expect(result.newOwner.toLowerCase()).toBe(TEST_NEW_OWNER.toLowerCase());
    });

    it('returns cancelled status', async () => {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      await stopRpcServer();
      const port = await startRpcServer(() => {
        return abiCoder.encode(
          ['address', 'uint256', 'uint256', 'bool', 'bool'],
          [TEST_NEW_OWNER, 1, 0, false, true]
        );
      });
      sdk.setProvider(`http://127.0.0.1:${port}`);

      const result = await sdk.getRecoveryStatus(TEST_RECOVERY_ID);
      expect(result.status).toBe('cancelled');
    });

    it('returns executed status', async () => {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      await stopRpcServer();
      const port = await startRpcServer(() => {
        return abiCoder.encode(
          ['address', 'uint256', 'uint256', 'bool', 'bool'],
          [TEST_NEW_OWNER, 2, 1000, true, false]
        );
      });
      sdk.setProvider(`http://127.0.0.1:${port}`);

      const result = await sdk.getRecoveryStatus(TEST_RECOVERY_ID);
      expect(result.status).toBe('executed');
    });

    it('returns ready status when delay elapsed', async () => {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const pastTime = Math.floor(Date.now() / 1000) - 3600;
      await stopRpcServer();
      const port = await startRpcServer(() => {
        return abiCoder.encode(
          ['address', 'uint256', 'uint256', 'bool', 'bool'],
          [TEST_NEW_OWNER, 2, pastTime, false, false]
        );
      });
      sdk.setProvider(`http://127.0.0.1:${port}`);

      const result = await sdk.getRecoveryStatus(TEST_RECOVERY_ID);
      expect(result.status).toBe('ready');
    });
  });
});

describe('Upgrade Methods', () => {
  let sdk: SigilSDK;

  beforeEach(() => {
    sdk = new SigilSDK({
      apiUrl: 'http://localhost:9999',
      agentKey: TEST_AGENT_KEY,
      accountAddress: TEST_ACCOUNT,
      chainId: 1,
    });
  });

  afterEach(async () => {
    await stopRpcServer();
  });

  it('requestUpgrade rejects invalid address', async () => {
    await expect(sdk.requestUpgrade('bad')).rejects.toThrow(UpgradeError);
  });

  describe('getUpgradeStatus', () => {
    it('parses contract response correctly', async () => {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const requestedAt = Math.floor(Date.now() / 1000) - 3600;
      const upgradeDelay = 86400;

      const port = await startRpcServer((data: string) => {
        // pendingImplementation() = 0x396c00b1 — but let's check actual selector
        // We'll match by selector prefix
        const sel = data.slice(0, 10);
        // These selectors come from the ABI
        if (sel === '0x396f7b23') { // pendingImplementation
          return abiCoder.encode(['address'], [TEST_IMPL]);
        }
        if (sel === '0x81c2461b') { // upgradeRequestedAt
          return abiCoder.encode(['uint256'], [requestedAt]);
        }
        if (sel === '0x47fe8b1d') { // UPGRADE_DELAY
          return abiCoder.encode(['uint256'], [upgradeDelay]);
        }
        throw new Error('unhandled');
      });
      sdk.setProvider(`http://127.0.0.1:${port}`);

      const status = await sdk.getUpgradeStatus();
      expect(status.pendingImplementation.toLowerCase()).toBe(TEST_IMPL.toLowerCase());
      expect(status.requestedAt).toBe(requestedAt);
      expect(status.executeAfter).toBe(requestedAt + upgradeDelay);
    });

    it('returns zero executeAfter when no upgrade pending', async () => {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const port = await startRpcServer((data: string) => {
        const sel = data.slice(0, 10);
        if (sel === '0x396f7b23') {
          return abiCoder.encode(['address'], [ethers.ZeroAddress]);
        }
        if (sel === '0x81c2461b') {
          return abiCoder.encode(['uint256'], [0]);
        }
        if (sel === '0x47fe8b1d') {
          return abiCoder.encode(['uint256'], [86400]);
        }
        throw new Error('unhandled');
      });
      sdk.setProvider(`http://127.0.0.1:${port}`);

      const status = await sdk.getUpgradeStatus();
      expect(status.pendingImplementation).toBe(ethers.ZeroAddress);
      expect(status.requestedAt).toBe(0);
      expect(status.executeAfter).toBe(0);
    });
  });
});
