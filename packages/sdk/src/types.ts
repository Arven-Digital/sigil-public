/**
 * Core types for Sigil SDK
 */

export interface SigilConfig {
  apiUrl: string;
  apiKey?: string;
  agentKey?: string;
  /** Owner private key — required for admin operations (recovery, upgrades, policy changes).
   *  These call the contract directly (not via UserOps) since the policy engine blocks self-calls. */
  ownerKey?: string;
  accountAddress: string;
  /** Chain ID for UserOp hash computation (default: 1) */
  chainId?: number;
  /** Max retries for API calls (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  retryBaseDelay?: number;
}

export interface TransactionParams {
  target: string;
  value: bigint | string;
  data?: string;
  /** Optional gas overrides (L6 fix) */
  callGasLimit?: string;
  verificationGasLimit?: string;
  preVerificationGas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface UserOperation {
  sender: string;
  nonce: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  signature: string;
}

export interface EvaluationResult {
  verdict: 'APPROVED' | 'REJECTED';
  riskScore: number;
  guardianSignature?: string;
  rejectionReason?: string;
  layers: {
    layer1: { result: string; checks?: any[] };
    layer2?: { result: string; reason?: string };
    layer3?: { result: string; score?: number; reasoning?: string };
  };
  evaluationMs: number;
}

export interface AccountInfo {
  address: string;
  owner: string;
  agent_key: string;
  guardian_key: string;
  chain_id: number;
  is_frozen: boolean;
  is_degraded: boolean;
  tier: string;
  policy: PolicyInfo;
  stats: { totalTransactions: number; blockedTransactions: number };
}

export interface PolicyInfo {
  max_tx_value: string;
  daily_limit: string;
  weekly_limit: string;
  allowed_targets: string[];
  allowed_functions: string[];
  blocked_addresses: string[];
  version: number;
}

export interface UpdatePolicyParams {
  maxTxValue?: string;
  dailyLimit?: string;
  weeklyLimit?: string;
  allowedTargets?: string[];
  allowedFunctions?: string[];
  blockedAddresses?: string[];
  updatedBy: string;
}

export interface TransactionListParams {
  limit?: number;
  offset?: number;
  verdict?: 'APPROVED' | 'REJECTED' | 'PENDING';
}

export interface TransactionListResult {
  transactions: any[];
  count: number;
}

export interface FreezeResult {
  success: boolean;
  frozenAt: string;
}

export interface RotateKeyResult {
  success: boolean;
  newAgentKey: string;
}

// ─── Social Recovery Types ───

export interface RecoveryConfig {
  threshold: number;
  guardianCount: number;
  delay: number;
  guardians: string[];
}

export interface RecoveryRequest {
  newOwner: string;
  supportCount: number;
  executeAfter: number;
  executed: boolean;
  cancelled: boolean;
  epoch: number;
}

export type RecoveryStatus = 'pending' | 'ready' | 'executed' | 'cancelled';

// ─── Upgrade Types ───

export interface UpgradeStatus {
  pendingImplementation: string;
  requestedAt: number;
  executeAfter: number;
}

// ─── Session Key Types ───

export interface SessionKeyConfig {
  key: string;
  validAfter?: number;         // Unix timestamp (0 = now)
  validUntil: number;          // Unix timestamp
  spendLimit: bigint | string; // Total spend limit
  maxTxValue?: bigint | string; // Per-tx limit (0 = use account default)
  cooldown?: number;           // Min seconds between txs (0 = no limit)
  allowAllTargets?: boolean;   // Use account whitelist vs session-specific
}

export interface SessionKeyInfo {
  sessionId: number;
  key: string;
  validAfter: number;
  validUntil: number;
  spendLimit: string;
  spent: string;
  maxTxValue: string;
  cooldown: number;
  lastUsedAt: number;
  allowAllTargets: boolean;
  revoked: boolean;
  isActive: boolean;
}

// ─── Token Allowance Policy Types ───

export interface TokenPolicyConfig {
  token: string;           // ERC-20 token address
  maxApproval: bigint | string;       // Max approve amount per call
  dailyTransferLimit: bigint | string; // Max daily transfer total (0 = unlimited)
}

export interface TokenPolicyInfo {
  token: string;
  maxApproval: string;
  dailyTransferLimit: string;
  dailyTransferred: string;
  exists: boolean;
}

// ─── Strategy Templates ───

export interface StrategyTemplate {
  name: string;
  description: string;
  maxTxValue: string;          // In wei
  dailyLimit: string;          // In wei
  guardianThreshold: string;   // In wei
  ownerThreshold: string;      // In wei (type(uint256).max = disabled)
  suggestedSessionCooldown: number;  // Seconds
  suggestedSessionDuration: number;  // Seconds
  suggestedSessionSpendLimit: string; // In wei
}

export interface SessionKeyCreateResult {
  sessionId: number;
  key: string;
  validAfter: number;
  validUntil: number;
  txHash: string;
}
