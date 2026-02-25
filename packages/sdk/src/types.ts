export interface SigilConfig {
  apiKey: string;
  accountAddress: string;
  agentPrivateKey: string;
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

export interface EvalResult {
  verdict: string;
  riskScore: number;
  rejectionReason?: string;
  guidance?: string;
  guardianSignature?: string;
  layers?: {
    layer1?: { result: string; checks?: unknown[] };
    layer2?: { result: string; reason?: string };
    layer3?: { result: string; reasoning?: string; confidence?: number };
  };
}

export interface AccountInfo {
  address: string;
  chain_id: number;
  owner: string;
  agent_key: string;
  is_frozen: boolean;
  is_degraded: boolean;
  tier: string;
  created_at: string;
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
}

export interface AuthResponse {
  token: string;
}
