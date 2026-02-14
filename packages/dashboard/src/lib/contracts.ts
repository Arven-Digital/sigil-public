// Contract ABIs and addresses for Sigil Protocol V10

export const FACTORY_ADDRESSES: Record<number, `0x${string}`> = {
  43114: "0x2f4dd6db7affcf1f34c4d70998983528d834b8f6", // Avalanche Mainnet (V10)
  43113: "0x86E85dE25473b432dabf1B9E8e8CE5145059b85b", // Avalanche Fuji (V9 — not redeployed)
  8453: "0x45b20a5F37b9740401a29BD70D636a77B18a510D",   // Base Mainnet (V10)
  42161: "0x20f926bd5f416c875a7ec538f499d21d62850f35",  // Arbitrum One (V10)
  16661: "0x20f926bd5f416c875a7ec538f499d21d62850f35",  // 0G Mainnet (V10)
};

export const MAINNET_CHAINS = new Set([43114, 8453, 42161, 16661]);
export const isMainnet = (chainId: number) => MAINNET_CHAINS.has(chainId);

export const GUARDIAN_ADDRESS = "0xD06fBe90c06703C4b705571113740AfB104e3C67" as const;

export const FACTORY_ABI = [
  {
    type: "function",
    name: "createAccount",
    inputs: [
      { name: "owner_", type: "address" },
      { name: "agentKey_", type: "address" },
      { name: "guardianKey_", type: "address" },
      { name: "maxTxValue_", type: "uint256" },
      { name: "dailyLimit_", type: "uint256" },
      { name: "guardianThreshold_", type: "uint256" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ name: "account", type: "address" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "deployFee",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAllFees",
    inputs: [],
    outputs: [
      { name: "deployFee_", type: "uint256" },
      { name: "sessionKeyFee_", type: "uint128" },
      { name: "recoveryFee_", type: "uint128" },
      { name: "treasury_", type: "address" },
      { name: "balance_", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAddress",
    inputs: [
      { name: "owner_", type: "address" },
      { name: "agentKey_", type: "address" },
      { name: "guardianKey_", type: "address" },
      { name: "maxTxValue_", type: "uint256" },
      { name: "dailyLimit_", type: "uint256" },
      { name: "guardianThreshold_", type: "uint256" },
      { name: "salt", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
] as const;

export const SIGIL_ACCOUNT_ABI = [
  {
    type: "function",
    name: "isFrozen",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "agentKey",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "guardianKey",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "maxTxValue",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "dailyLimit",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "guardianThreshold",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "dailySpent",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "freeze",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unfreeze",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rotateAgentKey",
    inputs: [{ name: "newAgentKey", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "updatePolicy",
    inputs: [
      { name: "maxTxValue_", type: "uint256" },
      { name: "dailyLimit_", type: "uint256" },
      { name: "guardianThreshold_", type: "uint256" },
      { name: "ownerThreshold_", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "emergencyWithdraw",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// Chain-aware native token symbol
export function getNativeToken(chainId: number): string {
  if (chainId === 43114 || chainId === 43113) return "AVAX";
  if (chainId === 8453) return "ETH";
  if (chainId === 16661) return "A0GI";
  return "ETH";
}

// Helper to get stored account address for a chain
export function getStoredAccount(chainId: number): string | null {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem(`sigil-account-${chainId}`);
  if (!val?.match(/^0x[0-9a-fA-F]{40}$/)) return null;
  return val;
}

export function setStoredAccount(chainId: number, address: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`sigil-account-${chainId}`, address);
}
