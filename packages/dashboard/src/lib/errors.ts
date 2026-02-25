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
  // Use word-boundary-aware matching to avoid false positives
  // (e.g. OZ's "OwnableUnauthorizedAccount" should NOT match our "Unauthorized")
  for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
    // Match exact error name: preceded by non-alphanumeric or start, followed by non-alphanumeric or end/paren
    const regex = new RegExp(`(?:^|[^a-zA-Z])${key}(?:[^a-zA-Z]|$)`);
    if (regex.test(error)) return message;
  }

  // Common wagmi/viem error patterns
  if (error.includes("User rejected") || error.includes("user rejected")) return "Transaction was rejected in your wallet.";
  if (error.includes("insufficient funds") || error.includes("InsufficientFee")) return "Insufficient funds for gas + deploy fee.";
  if (error.includes("nonce")) return "Transaction nonce conflict. Try again.";
  if (error.includes("OwnableUnauthorizedAccount")) return "Contract ownership error — the factory may not be initialized correctly on this chain.";
  if (error.includes("execution reverted")) {
    // Try to extract the revert reason
    const match = error.match(/execution reverted:?\s*"?([^"]+)"?/i);
    if (match) return `Transaction reverted: ${match[1]}`;
    return "Transaction reverted by the contract. Check your wallet has enough funds for the deploy fee + gas.";
  }

  // Truncate long error messages but show enough to debug
  if (error.length > 300) return error.slice(0, 300) + "...";

  return error;
}
