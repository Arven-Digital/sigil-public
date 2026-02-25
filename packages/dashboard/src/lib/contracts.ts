// Contract ABIs and addresses for Sigil Protocol V12

// ─── ERC-20 Token Lists (per chain) ───
export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  icon?: string; // emoji fallback
}

export const CHAIN_TOKENS: Record<number, TokenInfo[]> = {
  137: [ // Polygon
    { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC", decimals: 6, name: "USD Coin", icon: "💵" },
    { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", symbol: "USDC.e", decimals: 6, name: "Bridged USDC", icon: "💵" },
    { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", symbol: "USDT", decimals: 6, name: "Tether USD", icon: "💲" },
    { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", symbol: "WETH", decimals: 18, name: "Wrapped Ether", icon: "⟠" },
    { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", symbol: "WMATIC", decimals: 18, name: "Wrapped MATIC", icon: "🟣" },
    { address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", symbol: "WBTC", decimals: 8, name: "Wrapped BTC", icon: "₿" },
    { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", symbol: "DAI", decimals: 18, name: "Dai Stablecoin", icon: "◈" },
  ],
  43114: [ // Avalanche
    { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC", decimals: 6, name: "USD Coin", icon: "💵" },
    { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", symbol: "USDT", decimals: 6, name: "Tether USD", icon: "💲" },
    { address: "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB", symbol: "WETH.e", decimals: 18, name: "Wrapped Ether", icon: "⟠" },
    { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", symbol: "WAVAX", decimals: 18, name: "Wrapped AVAX", icon: "🔺" },
    { address: "0x152b9d0FdC40C096DE345354d2Dc01401c7f7Ae6", symbol: "BTC.b", decimals: 8, name: "Bitcoin", icon: "₿" },
    { address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", symbol: "DAI.e", decimals: 18, name: "Dai Stablecoin", icon: "◈" },
  ],
  8453: [ // Base
    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6, name: "USD Coin", icon: "💵" },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, name: "Wrapped Ether", icon: "⟠" },
    { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", symbol: "DAI", decimals: 18, name: "Dai Stablecoin", icon: "◈" },
    { address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", symbol: "USDbC", decimals: 6, name: "Bridged USDC", icon: "💵" },
  ],
  42161: [ // Arbitrum
    { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6, name: "USD Coin", icon: "💵" },
    { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", symbol: "USDC.e", decimals: 6, name: "Bridged USDC", icon: "💵" },
    { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", decimals: 6, name: "Tether USD", icon: "💲" },
    { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", decimals: 18, name: "Wrapped Ether", icon: "⟠" },
    { address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f", symbol: "WBTC", decimals: 8, name: "Wrapped BTC", icon: "₿" },
    { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", symbol: "DAI", decimals: 18, name: "Dai Stablecoin", icon: "◈" },
    { address: "0x912CE59144191C1204E64559FE8253a0e49E6548", symbol: "ARB", decimals: 18, name: "Arbitrum", icon: "🔵" },
  ],
  16661: [], // 0G — no established tokens yet

}

// ─── Known ERC-1271 Callers (protocols that verify smart wallet signatures) ───
export interface KnownERC1271Caller {
  address: string;
  name: string;
  description: string;
  chainId: number;
}

export const KNOWN_ERC1271_CALLERS: KnownERC1271Caller[] = [
  // Polygon
  { address: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E", name: "Polymarket CTF Exchange", description: "Trade prediction markets with agent signatures", chainId: 137 },
  { address: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045", name: "Polymarket Neg Risk CTF", description: "Neg-risk prediction market exchange", chainId: 137 },
  { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", name: "Permit2 (Uniswap)", description: "Gasless token approvals via signatures", chainId: 137 },
  // Avalanche
  { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", name: "Permit2 (Uniswap)", description: "Gasless token approvals via signatures", chainId: 43114 },
  // Base
  { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", name: "Permit2 (Uniswap)", description: "Gasless token approvals via signatures", chainId: 8453 },
  // Arbitrum
  { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", name: "Permit2 (Uniswap)", description: "Gasless token approvals via signatures", chainId: 42161 },
];

export function getKnownERC1271Callers(chainId: number): KnownERC1271Caller[] {
  return KNOWN_ERC1271_CALLERS.filter(c => c.chainId === chainId);
}

export const FACTORY_ADDRESSES: Record<number, `0x${string}`> = {
  1: "0x20f926bd5f416c875a7ec538f499d21d62850f35",      // Ethereum Mainnet (V12)
  137: "0x483D6e4e203771485aC75f183b56D5F5cDcbe679",    // Polygon Mainnet (V12)
  43114: "0x86e85de25473b432dabf1b9e8e8ce5145059b85b",  // Avalanche Mainnet (V12)
  8453: "0x5729291ed4c69936f5b5ace04dee454c6838fd50",   // Base Mainnet (V12)
  42161: "0x2f4dd6db7affcf1f34c4d70998983528d834b8f6",  // Arbitrum One (V12)
  16661: "0x8bAD12A489338B533BCA3B19138Cd61caA17405F",  // 0G Mainnet (V12)
};

export const MAINNET_CHAINS = new Set([1, 137, 43114, 8453, 42161, 16661]);
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
    name: "ownerThreshold",
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
    name: "setAllowedTarget",
    inputs: [
      { name: "target_", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setAllowedFunction",
    inputs: [
      { name: "selector", type: "bytes4" },
      { name: "allowed", type: "bool" },
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
  // Multicall — batch up to 20 calls in 1 tx
  {
    type: "function",
    name: "multicall",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
    stateMutability: "nonpayable",
  },
  // V12: Scoped ERC-1271
  {
    type: "function",
    name: "setAllowedERC1271Caller",
    inputs: [
      { name: "caller", type: "address" },
      { name: "allowed", type: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowedERC1271Callers",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

// Chain-aware native token symbol
export function getNativeToken(chainId: number): string {
  if (chainId === 1) return "ETH";
  if (chainId === 137) return "POL";
  if (chainId === 43114) return "AVAX";
  if (chainId === 8453) return "ETH";
  if (chainId === 42161) return "ETH";
  if (chainId === 16661) return "A0GI";
  return "ETH";
}

// Chain-aware explorer info
export function getExplorer(chainId: number): { name: string; url: string } {
  switch (chainId) {
    case 1: return { name: "Etherscan", url: "https://etherscan.io" };
    case 137: return { name: "PolygonScan", url: "https://polygonscan.com" };
    case 43114: return { name: "Snowtrace", url: "https://snowtrace.io" };
    case 8453: return { name: "BaseScan", url: "https://basescan.org" };
    case 42161: return { name: "Arbiscan", url: "https://arbiscan.io" };
    case 16661: return { name: "0G Explorer", url: "https://chainscan-newton.0g.ai" };
    default: return { name: "Etherscan", url: "https://etherscan.io" };
  }
}

// Chain-aware display name
export function getChainName(chainId: number): string {
  switch (chainId) {
    case 1: return "Ethereum";
    case 137: return "Polygon";
    case 43114: return "Avalanche";
    case 8453: return "Base";
    case 42161: return "Arbitrum";
    case 16661: return "0G Mainnet";
    default: return `Chain ${chainId}`;
  }
}

// Chain-aware RPC URLs for raw JSON-RPC calls
export function getRpcUrl(chainId: number): string {
  switch (chainId) {
    case 1: return "https://eth.drpc.org";
    case 137: return "https://polygon.drpc.org";
    case 43114: return "https://api.avax.network/ext/bc/C/rpc";
    case 8453: return "https://mainnet.base.org";
    case 42161: return "https://arb1.arbitrum.io/rpc";
    case 16661: return "https://0g.drpc.org";
    default: return "https://eth.drpc.org";
  }
}

// Factory deploy block numbers (for account discovery scanning)
export const FACTORY_DEPLOY_BLOCKS: Record<number, number> = {
  1: 22335000,
  137: 83104526,
  43114: 77869160,
  8453: 27000000,
  42161: 300000000,
  16661: 1000000,
};

// RPC-safe chunk sizes for eth_getLogs per chain
export const LOG_CHUNK_SIZES: Record<number, number> = {
  1: 10000,
  137: 3500,
  43114: 2048,
  8453: 10000,
  42161: 100000,
  16661: 100000,
};

// --- Multi-Account Storage ---

export interface StoredAccount {
  address: string;
  chainId: number;
  label?: string;
  createdAt: string;
}

const ACCOUNTS_KEY = "sigil-accounts";
const ACTIVE_KEY = "sigil-active-account"; // JSON: Record<chainId, address>

// Known system/invalid addresses that should never be stored as Sigil accounts
const INVALID_ACCOUNTS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x0000000000000000000000000000000000001010", // Polygon MATIC system contract
  "0xca11bde05977b3631167028862be2a173976ca11", // Multicall3
]);

function isValidSigilAccount(addr: string): boolean {
  if (!addr?.match(/^0x[0-9a-fA-F]{40}$/)) return false;
  return !INVALID_ACCOUNTS.has(addr.toLowerCase());
}

function migrateOldAccounts(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("sigil-accounts-migrated")) return;
  const accounts: StoredAccount[] = [];
  const active: Record<number, string> = {};
  const chainIds = [1, 137, 43114, 8453, 42161, 16661];
  for (const cid of chainIds) {
    const val = localStorage.getItem(`sigil-account-${cid}`);
    if (val && isValidSigilAccount(val)) {
      accounts.push({ address: val, chainId: cid, createdAt: new Date().toISOString() });
      active[cid] = val;
    }
  }
  if (accounts.length > 0) {
    const existing = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]") as StoredAccount[];
    const merged = [...existing];
    for (const a of accounts) {
      if (!merged.some(e => e.address.toLowerCase() === a.address.toLowerCase() && e.chainId === a.chainId)) {
        merged.push(a);
      }
    }
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(merged));
    const existingActive = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "{}");
    localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...existingActive, ...active }));
  }
  localStorage.setItem("sigil-accounts-migrated", "1");
}

function cleanupInvalidAccounts(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("sigil-accounts-cleaned-v1")) return;
  // Clean invalid entries from active accounts
  try {
    const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "{}");
    let changed = false;
    for (const [cid, addr] of Object.entries(active)) {
      if (!isValidSigilAccount(addr as string)) { delete active[cid]; changed = true; }
    }
    if (changed) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
  } catch {}
  // Clean old per-chain keys
  for (const cid of [1, 137, 43114, 8453, 42161, 16661]) {
    const val = localStorage.getItem(`sigil-account-${cid}`);
    if (val && !isValidSigilAccount(val)) localStorage.removeItem(`sigil-account-${cid}`);
  }
  localStorage.setItem("sigil-accounts-cleaned-v1", "1");
}

function ensureMigrated(): void {
  if (typeof window === "undefined") return;
  cleanupInvalidAccounts();
  migrateOldAccounts();
}

export function getStoredAccounts(): StoredAccount[] {
  if (typeof window === "undefined") return [];
  ensureMigrated();
  try {
    const all: StoredAccount[] = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]");
    // Filter out any invalid addresses that got stored by mistake
    const valid = all.filter(a => isValidSigilAccount(a.address));
    if (valid.length !== all.length) {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(valid));
    }
    return valid;
  } catch {
    return [];
  }
}

export function getStoredAccountsForChain(chainId: number): StoredAccount[] {
  return getStoredAccounts().filter(a => a.chainId === chainId);
}

export function getActiveAccount(chainId: number): string | null {
  if (typeof window === "undefined") return null;
  ensureMigrated();
  try {
    const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "{}");
    const addr = active[chainId];
    if (isValidSigilAccount(addr)) return addr;
  } catch {}
  // Fallback: return first account for this chain
  const accounts = getStoredAccountsForChain(chainId);
  return accounts.length > 0 ? accounts[0].address : null;
}

// Backwards compatible alias
export function getStoredAccount(chainId: number): string | null {
  return getActiveAccount(chainId);
}

export function setActiveAccount(chainId: number, address: string): void {
  if (typeof window === "undefined") return;
  ensureMigrated();
  try {
    const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "{}");
    active[chainId] = address;
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
  } catch {}
  // Also update old key for backwards compat
  localStorage.setItem(`sigil-account-${chainId}`, address);
}

export function addStoredAccount(chainId: number, address: string, label?: string): void {
  if (typeof window === "undefined") return;
  if (!isValidSigilAccount(address)) return; // Reject invalid/system addresses
  ensureMigrated();
  const accounts = getStoredAccounts();
  if (accounts.some(a => a.address.toLowerCase() === address.toLowerCase() && a.chainId === chainId)) return;
  accounts.push({ address, chainId, label, createdAt: new Date().toISOString() });
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function removeStoredAccount(chainId: number, address: string): void {
  if (typeof window === "undefined") return;
  ensureMigrated();
  const accounts = getStoredAccounts().filter(
    a => !(a.address.toLowerCase() === address.toLowerCase() && a.chainId === chainId)
  );
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  // If this was the active account, clear it
  try {
    const active = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "{}");
    if (active[chainId]?.toLowerCase() === address.toLowerCase()) {
      delete active[chainId];
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
    }
  } catch {}
}

// Backwards compatible alias
export function setStoredAccount(chainId: number, address: string): void {
  addStoredAccount(chainId, address);
  setActiveAccount(chainId, address);
}
