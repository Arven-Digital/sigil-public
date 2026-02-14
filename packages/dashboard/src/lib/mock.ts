// Mock data — only shown in demo mode (no wallet connected or ?demo=true)
import { DEMO_ADDRESS } from "./api";

/**
 * Demo mode gate: mock data is ONLY shown when:
 * 1. URL has ?demo=true, OR
 * 2. No wallet is connected
 * When wallet IS connected but API is down, we show errors — NOT mock data.
 */
export function isDemoMode(isConnected: boolean): boolean {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "true") return true;
  }
  return !isConnected;
}

export const mockAccount = {
  address: DEMO_ADDRESS,
  chain: "Avalanche C-Chain",
  chainId: 43114,
  tier: "free",
  frozen: false,
  guardian: {
    status: "healthy",
    lastHeartbeat: new Date().toISOString(),
  },
  policy: {
    maxPerTx: "1.0",
    dailyLimit: "10.0",
    weeklyLimit: "50.0",
    guardianThreshold: "0.5",
    ownerThreshold: "5.0",
    allowedTargets: [
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ],
    allowedFunctions: ["transfer(address,uint256)", "approve(address,uint256)"],
    blockedAddresses: ["0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead"],
  },
  stats: {
    totalTransactions: 47,
    blocked: 3,
    approvalRate: 93.6,
    avgRiskScore: 0.23,
  },
};

export const mockRecoveryConfig = {
  threshold: 2,
  guardianCount: 3,
  delay: 172800, // 48 hours in seconds
  guardians: [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ],
};

export const mockActiveRecoveries = [
  {
    id: "0xabc123",
    newOwner: "0x9999999999999999999999999999999999999999",
    supportCount: 1,
    executeAfter: Math.floor(Date.now() / 1000) + 86400, // 24h from now
    executed: false,
    cancelled: false,
  },
];

export const mockUpgradeStatus = {
  currentImplementation: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  pendingImplementation: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  requestedAt: Math.floor(Date.now() / 1000) - 3600,
  executeAfter: Math.floor(Date.now() / 1000) + 82800, // ~23h from now
};

export const mockUpgradeHistory = [
  {
    fromImplementation: "0x0000000000000000000000000000000000000001",
    toImplementation: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    executedAt: Math.floor(Date.now() / 1000) - 604800, // 7 days ago
    txHash: "0xdef456789abc",
  },
];

export type Transaction = {
  id: string;
  target: string;
  value: string;
  function: string;
  verdict: "approved" | "rejected" | "pending";
  riskScore: number;
  timestamp: string;
  layers?: {
    layer1: { pass: boolean; reason: string };
    layer2: { pass: boolean; reason: string };
    layer3: { pass: boolean; score: number; reason: string };
  };
};

export const mockTransactions: Transaction[] = Array.from({ length: 25 }, (_, i) => {
  const verdicts: Transaction["verdict"][] = ["approved", "approved", "approved", "rejected", "pending"];
  const verdict = verdicts[i % 5];
  const fns = ["transfer(address,uint256)", "approve(address,uint256)", "swap(uint256,uint256)", "execute(bytes)"];
  return {
    id: `tx-${String(i + 1).padStart(3, "0")}`,
    target: `0x${(i * 1111).toString(16).padStart(40, "a")}`,
    value: (Math.random() * 2).toFixed(4) + " AVAX",
    function: fns[i % 4],
    verdict,
    riskScore: verdict === "rejected" ? 0.7 + Math.random() * 0.3 : Math.random() * 0.5,
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    layers: {
      layer1: { pass: verdict !== "rejected" || i % 3 !== 0, reason: verdict === "rejected" && i % 3 === 0 ? "Exceeds daily limit" : "All rules passed" },
      layer2: { pass: verdict !== "rejected" || i % 3 !== 1, reason: verdict === "rejected" && i % 3 === 1 ? "Simulation reverted" : "Simulation OK" },
      layer3: { pass: verdict !== "rejected" || i % 3 !== 2, score: verdict === "rejected" ? 0.85 : 0.15 + Math.random() * 0.3, reason: verdict === "rejected" && i % 3 === 2 ? "High risk pattern detected" : "Low risk" },
    },
  };
});
