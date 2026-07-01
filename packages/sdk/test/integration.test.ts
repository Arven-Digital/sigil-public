import { describe, expect, it, vi } from 'vitest';
import { ethers } from 'ethers';
import { SigilSDK } from '../src/client.js';
import { getUserOpHash } from '../src/userOp.js';
import type { SignerFunction, UserOp } from '../src/types.js';

const ACCOUNT_ADDRESS = '0x' + 'a'.repeat(40);
const CHAIN_ID = 137;
const PACKED_ONE_ONE = '0x' + '0'.repeat(31) + '1' + '0'.repeat(31) + '1';

function sampleUserOp(): UserOp {
  return {
    sender: ACCOUNT_ADDRESS,
    nonce: '0x0',
    callData: '0x',
    accountGasLimits: PACKED_ONE_ONE,
    preVerificationGas: '0x1',
    gasFees: PACKED_ONE_ONE,
    signature: '0x',
    initCode: '0x',
    paymasterAndData: '0x',
  };
}

describe('SigilSDK signing', () => {
  it('preserves EIP-191 signing semantics for raw private keys', async () => {
    const wallet = ethers.Wallet.createRandom();
    const userOp = sampleUserOp();
    const sdk = new SigilSDK({
      apiKey: 'test-api-key',
      accountAddress: ACCOUNT_ADDRESS,
      agentPrivateKey: wallet.privateKey,
      chainId: CHAIN_ID,
    });

    const signature = await sdk.signUserOp(userOp);
    const userOpHash = getUserOpHash(userOp, CHAIN_ID);
    const recovered = ethers.verifyMessage(ethers.getBytes(userOpHash), signature);

    expect(recovered).toBe(wallet.address);
  });

  it('delegates signing to a custom signer function for HSM/KMS integrations', async () => {
    const userOp = sampleUserOp();
    const expectedHash = getUserOpHash(userOp, CHAIN_ID);
    const expectedSignature = '0x' + '11'.repeat(65);
    const signer: SignerFunction = vi.fn(async () => expectedSignature);
    const sdk = new SigilSDK({
      apiKey: 'test-api-key',
      accountAddress: ACCOUNT_ADDRESS,
      agentPrivateKey: signer,
      chainId: CHAIN_ID,
    });

    await expect(sdk.signUserOp(userOp)).resolves.toBe(expectedSignature);
    expect(signer).toHaveBeenCalledTimes(1);
    expect(signer).toHaveBeenCalledWith(expectedHash);
  });
});
