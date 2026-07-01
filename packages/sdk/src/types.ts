/**
 * Custom signer function — accepts the ERC-4337 UserOp hash and returns a
 * contract-compatible signature.
 *
 * Sigil accounts recover signatures with `userOpHash.toEthSignedMessageHash()`;
 * custom signers must preserve that EIP-191/personal-sign convention unless the
 * deployed account implementation changes.
 */
export type SignerFunction = (userOpHash: string) => Promise<string>;

export interface SigilConfig {
  apiKey: string;
  accountAddress: string;
  /**
   * Agent private key (hex string) OR a custom signing function.
   *
   * Prefer SignerFunction for HSM/KMS/external signer integrations so SDK users
   * do not have to pass raw private keys into the JavaScript heap.
   */
  agentPrivateKey: string | SignerFunction;
  chainId: number;
  apiUrl?: string;
}

// ERC-4337 v0.7 packed format (preferred)
export interface UserOpV7 {
  sender: string;
  nonce: string;
  callData: string;
  accountGasLimits: string; // packed: verificationGasLimit (16 bytes) || callGasLimit (16 bytes)
  preVerificationGas: string;
  gasFees: string; // packed: maxPriorityFeePerGas (16 bytes) || maxFeePerGas (16 bytes)
  signature: string;
  initCode?: string;
  paymasterAndData?: string;
}

// ERC-4337 v0.6 individual format (legacy compatibility)
export interface UserOpV6 {
  sender: string;
  nonce: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  signature: string;
  initCode?: string;
  paymasterAndData?: string;
}

// Accept either format
export type UserOp = UserOpV7 | UserOpV6;

export interface TxResult {
  txHash: string;
  verdict: string;
  riskScore: number;
  evaluationMs: number;
}

export interface TransactionParams {
  target: string;
  value?: string | bigint;
  data?: string;
}

export interface EvaluationResult {
  verdict: string;
  riskScore: number;
  rejectionReason?: string;
  guidance?: string;
  guardianSignature?: string;
  evaluationMs: number;
  layers: {
    layer1: { result: string; checks?: unknown[] };
    layer2?: { result: string; reason?: string };
    layer3?: { result: string; reasoning?: string; confidence?: number; score?: number };
  };
}

export type EvalResult = EvaluationResult;

export interface TransactionsResult {
  transactions: unknown[];
  count: number;
}

export interface FreezeResult {
  status?: string;
  frozenAt?: string;
  address?: string;
}

export interface RotateKeyResult {
  status?: string;
  address?: string;
  newAgentKey: string;
}

export interface SessionKeyCreateParams {
  key: string;
  validUntil?: number;
  validForHours?: number;
  spendLimit?: string;
  maxTxValue?: string;
  cooldown?: number;
  cooldownSeconds?: number;
  allowAllTargets?: boolean;
  targets?: string[];
  functions?: string[];
}

export interface SessionKeyCreateResult {
  sessionId?: number | string;
  key: string;
  validUntil: number;
  txHash?: string;
  contractCall?: unknown;
  additionalCalls?: unknown[];
  message?: string;
}

export interface SessionKeyInfo {
  sessionId: number | string;
  key: string;
  validAfter: number;
  validUntil: number;
  spendLimit: string;
  maxTxValue: string;
  spent: string;
  allowAllTargets: boolean;
  revoked: boolean;
  isActive: boolean;
}

export interface AccountStats {
  totalTransactions: number;
  blockedTransactions: number;
}

export interface AccountInfo {
  address: string;
  chain_id: number;
  owner: string;
  agent_key: string;
  guardian_key?: string;
  is_frozen: boolean;
  is_degraded: boolean;
  tier: string;
  created_at: string;
  policy: PolicyInfo;
  stats: AccountStats;
}

export interface PolicyInfo {
  max_tx_value: string;
  daily_limit: string;
  weekly_limit: string;
  guardian_threshold: string;
  owner_threshold: string;
  allowed_targets: string[];
  allowed_functions: string[];
  blocked_addresses: string[];
  timelock_duration: number;
  version: number;
}

export interface AuthResponse {
  token: string;
}
