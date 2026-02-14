// Human-readable error messages for SigilAccount custom errors

const ERROR_MESSAGES: Record<string, string> = {
  // Batch operations
  EmptyBatch: "Cannot execute an empty batch of transactions.",
  BatchTooLarge: "Batch exceeds maximum of 20 transactions.",
  BatchSelfCall: "Batch transactions cannot target the wallet itself.",
  BatchCallFailed: "One of the batch transactions failed.",

  // Queue operations
  QueueSelfCall: "Cannot queue a transaction targeting the wallet itself.",
  QueuedTxFailed: "Queued transaction execution failed.",

  // Withdrawals
  NoBalance: "No native token balance to withdraw.",
  WithdrawFailed: "Native token withdrawal failed.",
  NoTokenBalance: "No token balance to withdraw.",

  // Whitelist
  CannotWhitelistSelf: "Cannot whitelist the wallet's own address.",

  // Upgrades
  ZeroImpl: "Implementation address cannot be zero.",
  NotContract: "New implementation must be a deployed contract.",
  NoPendingUpgrade: "No upgrade has been requested.",
  UpgradeDelayNotElapsed: "24-hour upgrade delay has not passed yet.",
  InvalidGuardianSig: "Guardian co-signature is invalid.",

  // Multicall
  EmptyMulticall: "Cannot execute an empty multicall.",
  MulticallTooLarge: "Multicall exceeds maximum of 20 operations.",
  MulticallEmptyCalldata: "Multicall operation has empty calldata.",
  MulticallBlockedSelector: "Multicall cannot include upgrade, recovery, or queued execution calls.",

  // Session keys
  SessionKeyNotFound: "Session key does not exist or has been revoked.",

  // Deposits
  ZeroDeposit: "Deposit amount must be greater than zero.",

  // General
  InvalidCallData: "Unknown function called on wallet.",

  // Policy
  TokenApprovalExceedsLimit: "Token approval exceeds the configured limit.",
  TokenTransferExceedsDailyLimit: "Token transfer exceeds the daily spending limit.",

  // Existing errors
  Frozen: "Wallet is frozen. Use emergency recovery.",
  NotOwner: "Only the wallet owner can perform this action.",
  Unauthorized: "You are not authorized to perform this action.",
};

export function decodeErrorMessage(error: string | undefined): string {
  if (!error) return "Unknown error";

  // Check for custom error names in the error message
  for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
    if (error.includes(key)) return message;
  }

  // Common wagmi/viem error patterns
  if (error.includes("User rejected")) return "Transaction was rejected in your wallet.";
  if (error.includes("insufficient funds")) return "Insufficient funds for gas + value.";
  if (error.includes("nonce")) return "Transaction nonce conflict. Try again.";

  // Truncate long error messages
  if (error.length > 200) return error.slice(0, 200) + "...";

  return error;
}
