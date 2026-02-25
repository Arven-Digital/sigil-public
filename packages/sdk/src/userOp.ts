import { ethers } from 'ethers';
import type { UserOp, UserOpV7, UserOpV6 } from './types.js';

const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

const executeFn = new ethers.Interface([
  'function execute(address target, uint256 value, bytes data)',
]);

/**
 * Encode callData for SigilAccount.execute()
 */
export function encodeExecute(target: string, value: bigint, innerData: string): string {
  return executeFn.encodeFunctionData('execute', [target, value, innerData]);
}

/** Type guard: is this a v0.7 packed UserOp? */
function isV7(op: UserOp): op is UserOpV7 {
  return 'accountGasLimits' in op;
}

/**
 * Pack a UserOp for hashing (ERC-4337 v0.7).
 * Accepts native v0.7 packed fields directly.
 * Legacy v0.6 fields are converted at the boundary.
 */
function packUserOp(op: UserOp): string {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  let accountGasLimits: string;
  let gasFees: string;
  let initCode: string;
  let paymasterAndData: string;

  if (isV7(op)) {
    // Native v0.7 — use packed fields directly
    accountGasLimits = op.accountGasLimits;
    gasFees = op.gasFees;
    initCode = op.initCode ?? '0x';
    paymasterAndData = op.paymasterAndData ?? '0x';
  } else {
    // Legacy v0.6 — pack fields
    accountGasLimits = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(BigInt(op.verificationGasLimit)), 16),
      ethers.zeroPadValue(ethers.toBeHex(BigInt(op.callGasLimit)), 16),
    ]);
    gasFees = ethers.concat([
      ethers.zeroPadValue(ethers.toBeHex(BigInt(op.maxPriorityFeePerGas)), 16),
      ethers.zeroPadValue(ethers.toBeHex(BigInt(op.maxFeePerGas)), 16),
    ]);
    initCode = op.initCode ?? '0x';
    paymasterAndData = op.paymasterAndData ?? '0x';
  }

  return abiCoder.encode(
    ['address', 'uint256', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'bytes32', 'bytes32'],
    [
      op.sender,
      BigInt(op.nonce),
      ethers.keccak256(initCode),
      ethers.keccak256(op.callData),
      accountGasLimits,
      BigInt(op.preVerificationGas),
      gasFees,
      ethers.keccak256(paymasterAndData),
    ],
  );
}

/**
 * Compute the ERC-4337 v0.7 UserOp hash.
 */
export function getUserOpHash(op: UserOp, chainId: number): string {
  const packed = packUserOp(op);
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    abiCoder.encode(
      ['bytes32', 'address', 'uint256'],
      [ethers.keccak256(packed), ENTRY_POINT, chainId],
    ),
  );
}

/**
 * Sign a UserOp hash with an agent's private key.
 * Uses EIP-191 personal sign (signMessage).
 */
export async function signUserOpHash(
  userOpHash: string,
  privateKey: string,
): Promise<string> {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.signMessage(ethers.getBytes(userOpHash));
}

export { ENTRY_POINT };
