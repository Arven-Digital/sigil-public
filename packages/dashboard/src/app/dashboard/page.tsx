"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useChainId, useBalance, useReadContract, usePublicClient } from "wagmi";
import { formatEther, parseAbiItem } from "viem";
import { useWallet } from "@/lib/wallet";
import { getStoredAccount, setStoredAccount, SIGIL_ACCOUNT_ABI, FACTORY_ADDRESSES, getNativeToken } from "@/lib/contracts";
import { useHealth, useProtectionStatus } from "@/lib/hooks";
import { api } from "@/lib/api";
import EditableName from "@/components/EditableName";

// ─── Mock Data (demo mode only) ───
const MOCK_BALANCE = { total: "$12,847", breakdown: "4.21 AVAX + 8,200 USDC" };
const MOCK_DAILY = { spent: "$342", limit: "$2,000", percent: 17.1 };
const MOCK_TXS = { total: 14, approved: 13, blocked: 1 };
const MOCK_RISK = { score: 12, label: "Low risk · all within policy" };

const MOCK_POLICY = {
  perTxLimit: "$500",
  dailyLimit: "$2,000",
  guardianThreshold: "> $100",
  ownerRequired: "> $1,000",
  whitelisted: ["Uniswap V3", "Aave V3", "1inch"],
};

const MOCK_GUARDIANS = [
  { region: "us-east", status: "Online" },
  { region: "eu-west", status: "Online" },
  { region: "ap-south", status: "Online" },
];

const MOCK_RECENT_TXS = [
  { id: 1, action: "Swap 50 USDC → AVAX", detail: "Uniswap V3 · 2 min ago", value: "$50", verdict: "approved" as const, risk: 8 },
  { id: 2, action: "Transfer 1,500 USDC", detail: "BLOCKED — Exceeds per-tx limit ($500)", value: "$1,500", verdict: "blocked" as const, layer: "Layer 1" },
  { id: 3, action: "Supply 500 USDC to Aave", detail: "Guardian co-signed · 1h ago", value: "$500", verdict: "approved" as const, risk: 18 },
  { id: 4, action: "Approve USDC on Aave V3", detail: "Contract interaction · 1h ago", value: "$0", verdict: "approved" as const, risk: 5 },
];

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
      <div className="text-xs text-white/40 uppercase tracking-wide mb-2">{label}</div>
      {children}
    </div>
  );
}

function RiskBadge({ score }: { score: number }) {
  const color = score <= 20 ? "text-[#00FF88] bg-[#00FF88]/10" : score <= 50 ? "text-[#F4A524] bg-[#F4A524]/10" : "text-[#F04452] bg-[#F04452]/10";
  return <span className={`text-xs px-2 py-0.5 rounded-md font-medium font-mono ${color}`}>Risk: {score}</span>;
}

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-3">
      <code className="text-lg font-mono text-white break-all">{address}</code>
      <button
        onClick={handleCopy}
        className="shrink-0 px-3 py-1.5 rounded-lg border border-white/5 bg-white/5/30 text-xs font-medium hover:bg-white/5/50 transition-colors"
      >
        {copied ? "✓ Copied!" : "📋 Copy"}
      </button>
    </div>
  );
}

export default function DashboardOverview() {
  const [mounted, setMounted] = useState(false);
  const [showGettingStarted, setShowGettingStarted] = useState(true);
  useEffect(() => setMounted(true), []);

  const { isConnected, address: walletAddress } = useWallet();
  const chainId = useChainId();
  const nativeToken = getNativeToken(chainId);
  const publicClient = usePublicClient();
  const [discoveredAccount, setDiscoveredAccount] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);

  const storedAccount = mounted ? getStoredAccount(chainId) : null;
  const accountAddress = storedAccount || discoveredAccount;
  const hasAccount = !!accountAddress;
  const isDemo = !isConnected || !hasAccount;

  // Dismiss getting started from localStorage
  useEffect(() => {
    if (mounted) {
      const dismissed = localStorage.getItem("sigil-getting-started-dismissed");
      if (dismissed === "true") setShowGettingStarted(false);
    }
  }, [mounted]);

  const dismissGettingStarted = () => {
    setShowGettingStarted(false);
    localStorage.setItem("sigil-getting-started-dismissed", "true");
  };

  // On-chain account discovery: query factory AccountCreated events for this wallet
  useEffect(() => {
    if (!mounted || !isConnected || !walletAddress || !publicClient || storedAccount) return;
    const factoryAddress = FACTORY_ADDRESSES[chainId];
    if (!factoryAddress) return;

    const FACTORY_DEPLOY_BLOCK: Record<number, bigint> = {
      43114: BigInt(77869160),
      43113: BigInt(40000000),
    };

    setDiscovering(true);
    (async () => {
      try {
        const startBlock = FACTORY_DEPLOY_BLOCK[chainId] || BigInt(0);
        const currentBlock = await publicClient.getBlockNumber();
        const chunkSize = BigInt(2000);
        let found = false;

        for (let from = startBlock; from <= currentBlock && !found; from += chunkSize) {
          let to = from + chunkSize - BigInt(1);
          if (to > currentBlock) to = currentBlock;

          try {
            const logs = await publicClient.getLogs({
              address: factoryAddress as `0x${string}`,
              event: parseAbiItem("event AccountCreated(address indexed account, address indexed owner, address indexed agentKey, address guardianKey)"),
              args: { owner: walletAddress as `0x${string}` },
              fromBlock: from,
              toBlock: to,
            });
            if (logs.length > 0) {
              const lastLog = logs[logs.length - 1];
              const account = lastLog.args.account;
              if (account) {
                setDiscoveredAccount(account);
                setStoredAccount(chainId, account);
                found = true;
              }
            }
          } catch {
            // chunk failed, try next
          }
        }
      } catch (err) {
        console.warn("Account discovery failed:", err);
      } finally {
        setDiscovering(false);
      }
    })();
  }, [mounted, isConnected, walletAddress, chainId, publicClient, storedAccount]);

  // Real data hooks (only when connected with account)
  const { data: balanceData } = useBalance({
    address: accountAddress as `0x${string}` | undefined,
    query: { enabled: !!accountAddress },
  });

  // Connected wallet balance (owner wallet, not Sigil account)
  const { data: ownerBalanceData } = useBalance({
    address: walletAddress as `0x${string}` | undefined,
    query: { enabled: !!walletAddress && !!accountAddress },
  });

  const { data: maxTxValue } = useReadContract({
    address: accountAddress as `0x${string}`,
    abi: SIGIL_ACCOUNT_ABI,
    functionName: "maxTxValue",
    query: { enabled: !!accountAddress },
  });

  const { data: dailyLimit } = useReadContract({
    address: accountAddress as `0x${string}`,
    abi: SIGIL_ACCOUNT_ABI,
    functionName: "dailyLimit",
    query: { enabled: !!accountAddress },
  });

  const { data: isFrozen } = useReadContract({
    address: accountAddress as `0x${string}`,
    abi: SIGIL_ACCOUNT_ABI,
    functionName: "isFrozen",
    query: { enabled: !!accountAddress },
  });

  const { data: dailySpent } = useReadContract({
    address: accountAddress as `0x${string}`,
    abi: SIGIL_ACCOUNT_ABI,
    functionName: "dailySpent",
    query: { enabled: !!accountAddress },
  });

  const { data: guardianThreshold } = useReadContract({
    address: accountAddress as `0x${string}`,
    abi: SIGIL_ACCOUNT_ABI,
    functionName: "guardianThreshold",
    query: { enabled: !!accountAddress },
  });

  const { data: healthData } = useHealth();
  const { data: protectionData } = useProtectionStatus(accountAddress ?? undefined, chainId);
  const [resettingCB, setResettingCB] = useState(false);

  if (!mounted) return null;

  // Loading state while discovering on-chain account
  if (isConnected && !hasAccount && discovering) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin h-12 w-12 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-6" />
        <h2 className="text-xl font-bold mb-2">Searching for your account...</h2>
        <p className="text-gray-400">Checking on-chain records</p>
      </div>
    );
  }

  // CTA if connected but no account
  if (isConnected && !hasAccount) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-6"><img src="/sigil-symbol.svg" alt="Sigil" className="w-16 h-16 mx-auto" /></div>
        <h2 className="text-2xl font-bold mb-3">No Sigil Account Found</h2>
        <p className="text-gray-400 mb-8 text-center max-w-md">
          Deploy a Sigil smart account to protect your AI agent with 3-layer security.
        </p>
        <Link
          href="/onboarding"
          className="px-8 py-3 bg-[#00FF88] hover:brightness-110 text-[#050505] text-[#050505] rounded-xl font-medium transition-colors"
        >
          Deploy Your Sigil Wallet →
        </Link>
      </div>
    );
  }

  // Format real data
  const sigilBalance = !isDemo && balanceData
    ? parseFloat(formatEther(balanceData.value))
    : null;
  const ownerBalance = !isDemo && ownerBalanceData
    ? parseFloat(formatEther(ownerBalanceData.value))
    : null;
  const balanceDisplay = !isDemo && balanceData
    ? `${(sigilBalance ?? 0).toFixed(4)} ${balanceData.symbol}`
    : MOCK_BALANCE.breakdown;
  const balanceTotal = !isDemo && balanceData
    ? `${(sigilBalance ?? 0).toFixed(4)} ${balanceData.symbol}`
    : MOCK_BALANCE.total;

  // Policy display — real data for connected users, mock for demo
  const policyDisplay = !isDemo && maxTxValue !== undefined && dailyLimit !== undefined ? {
    perTxLimit: `${parseFloat(formatEther(maxTxValue as bigint)).toFixed(2)} ${nativeToken}`,
    dailyLimit: `${parseFloat(formatEther(dailyLimit as bigint)).toFixed(2)} ${nativeToken}`,
    guardianThreshold: guardianThreshold !== undefined
      ? `> ${parseFloat(formatEther(guardianThreshold as bigint)).toFixed(2)} ${nativeToken}`
      : "Loading...",
    ownerRequired: "See policy page",
    whitelisted: ["View in Policies →"],
  } : MOCK_POLICY;

  // Daily spend — real data for connected users
  const dailySpentDisplay = !isDemo && dailySpent !== undefined
    ? parseFloat(formatEther(dailySpent as bigint)).toFixed(2)
    : null;
  const dailyLimitDisplay = !isDemo && dailyLimit !== undefined
    ? parseFloat(formatEther(dailyLimit as bigint)).toFixed(2)
    : null;
  const dailyPercent = dailySpentDisplay && dailyLimitDisplay && parseFloat(dailyLimitDisplay) > 0
    ? (parseFloat(dailySpentDisplay) / parseFloat(dailyLimitDisplay)) * 100
    : 0;

  const frozenStatus = !isDemo && isFrozen !== undefined ? isFrozen as boolean : false;
  const guardianStatus = healthData?.status === "healthy" || healthData?.status === "ok";

  return (
    <div className="space-y-6">
      {/* Frozen banner */}
      {frozenStatus && (
        <div className="p-4 bg-[#F04452]/10 border border-[#F04452]/30 rounded-xl flex items-center gap-3">
          <span className="text-2xl">🔒</span>
          <div>
            <div className="font-bold text-[#F04452]">Account Frozen</div>
            <div className="text-sm text-gray-400">All transactions are blocked. <Link href="/dashboard/emergency" className="text-[#00FF88] underline">Manage →</Link></div>
          </div>
        </div>
      )}

      {isDemo && (
        <div className="p-3 bg-[#00FF88]/10 border border-[#00FF88]/20 rounded-lg text-sm text-[#00FF88]">
          📋 Demo mode — showing sample data. Connect wallet & deploy to see real data.
        </div>
      )}

      {/* Account Address — always visible for real accounts */}
      {!isDemo && accountAddress && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <EditableName chainId={chainId} address={accountAddress} />
          <div className="text-xs text-white/40 uppercase tracking-wide mb-2 mt-1">Your Sigil Wallet — Send {nativeToken} here to fund it</div>
          <CopyableAddress address={accountAddress} />
          {frozenStatus && (
            <div className="mt-2 text-xs text-[#F04452] font-medium">🔒 Account is frozen</div>
          )}
        </div>
      )}

      {/* Getting Started — dismissable */}
      {!isDemo && accountAddress && showGettingStarted && (
        <div className="rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[#00FF88]">🚀 Your Sigil Account is live!</h2>
            <button
              onClick={dismissGettingStarted}
              className="text-white/40 hover:text-white text-sm"
            >
              ✕ Dismiss
            </button>
          </div>
          <p className="text-sm text-gray-400 mb-4">Here&apos;s how to use it:</p>
          <div className="space-y-2 text-sm">
            <div className="flex gap-3">
              <span className="text-[#00FF88] font-bold">1.</span>
              <span><strong>Fund your account</strong> — Send {nativeToken} to the address above to cover gas fees</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[#00FF88] font-bold">2.</span>
              <span><strong>Configure your agent</strong> — Use the <Link href="/dashboard/agent" className="text-[#00FF88] underline">Agent Access</Link> page to set up API keys for your AI agent</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[#00FF88] font-bold">3.</span>
              <span><strong>Set policies</strong> — Adjust spending limits and whitelists in the <Link href="/dashboard/policy" className="text-[#00FF88] underline">Policies</Link> page</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[#00FF88] font-bold">4.</span>
              <span><strong>Evaluate transactions</strong> — Your agent sends transactions through the Guardian for 3-layer validation</span>
            </div>
          </div>
          <div className="mt-4">
            <a href="https://api.sigil.codes" target="_blank" rel="noopener noreferrer" className="text-[#00FF88] text-sm hover:underline">
              📖 API Docs & Integration Guide →
            </a>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Sigil Account Balance">
          <div className="text-3xl font-bold font-mono">{balanceTotal}</div>
          {!isDemo && sigilBalance !== null && sigilBalance === 0 && (
            <div className="text-xs text-[#F4A524] mt-1">
              ⚠ Account unfunded — send {nativeToken} to your Sigil address above
            </div>
          )}
          {!isDemo && ownerBalance !== null && (
            <div className="text-xs text-white/40 mt-1 font-mono">
              Connected wallet: {ownerBalance.toFixed(4)} {nativeToken}
            </div>
          )}
          {isDemo && <div className="text-xs text-white/40 mt-1 font-mono">{balanceDisplay}</div>}
        </StatCard>

        <StatCard label="Today's Spend">
          {isDemo ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold font-mono">{MOCK_DAILY.spent}</span>
                <span className="text-white/40 text-sm font-mono">/ {MOCK_DAILY.limit}</span>
              </div>
              <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-[#00FF88] rounded-full" style={{ width: `${MOCK_DAILY.percent}%` }} />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold font-mono">{dailySpentDisplay ?? "0.00"} {nativeToken}</span>
                <span className="text-white/40 text-sm font-mono">/ {dailyLimitDisplay ?? "—"} {nativeToken}</span>
              </div>
              <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-[#00FF88] rounded-full" style={{ width: `${Math.min(dailyPercent, 100)}%` }} />
              </div>
              {dailySpentDisplay === "0.00" && (
                <div className="text-xs text-white/40 mt-1">No transactions today</div>
              )}
            </>
          )}
        </StatCard>

        <StatCard label="TXs Today">
          {isDemo ? (
            <>
              <div className="text-3xl font-bold font-mono">{MOCK_TXS.total}</div>
              <div className="text-xs text-white/40 mt-1">
                <span className="text-[#00FF88] font-mono">{MOCK_TXS.approved} approved</span>
                {" · "}
                <span className="text-[#F04452] font-mono">{MOCK_TXS.blocked} blocked</span>
              </div>
            </>
          ) : (
            <>
              <div className="text-3xl font-bold font-mono">0</div>
              <div className="text-xs text-white/40 mt-1">No transactions yet</div>
            </>
          )}
        </StatCard>

        <StatCard label="Risk Score">
          {isDemo ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-[#00FF88] font-mono">{MOCK_RISK.score}</span>
                <span className="text-white/40 text-sm font-mono">/ 100</span>
              </div>
              <div className="text-xs text-white/40 mt-1">{MOCK_RISK.label}</div>
            </>
          ) : (
            <>
              <div className="text-3xl font-bold text-white/40 font-mono">—</div>
              <div className="text-xs text-white/40 mt-1">Evaluate a transaction to see risk</div>
            </>
          )}
        </StatCard>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-5 gap-6">
        {/* Recent Activity */}
        <div className="col-span-3 rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold">Recent Activity</h2>
            <Link href="/dashboard/activity" className="text-[#00FF88] text-sm hover:text-[#00FF88]/80">View all →</Link>
          </div>
          {isDemo ? (
            <div className="space-y-1">
              {MOCK_RECENT_TXS.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 py-3 border-b border-white/5/40 last:border-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${tx.verdict === "approved" ? "bg-[#00FF88]/10 text-[#00FF88]" : "bg-[#F04452]/10 text-[#F04452]"}`}>
                    {tx.verdict === "approved" ? "✓" : "✕"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{tx.action}</div>
                    <div className={`text-xs mt-0.5 ${tx.verdict === "blocked" ? "text-[#F04452]" : "text-white/40"}`}>{tx.detail}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium text-sm font-mono ${tx.verdict === "blocked" ? "text-[#F04452]" : ""}`}>{tx.value}</div>
                    {tx.risk !== undefined && <RiskBadge score={tx.risk} />}
                    {tx.layer && <span className="text-xs text-white/40">{tx.layer}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-4"><img src="/sigil-symbol.svg" alt="Sigil" className="w-10 h-10 mx-auto opacity-50" /></div>
              <p className="text-white/40 mb-4">No activity yet. Evaluate your first transaction to get started.</p>
              <Link
                href="/dashboard/evaluate"
                className="px-6 py-2.5 bg-[#00FF88] hover:brightness-110 text-[#050505] text-[#050505] rounded-xl font-medium transition-colors"
              >
                🔍 Evaluate Transaction →
              </Link>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="col-span-2 space-y-6">
          {/* Active Policy */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Active Policy</h2>
              <Link href="/dashboard/policy" className="text-[#00FF88] text-sm hover:text-[#00FF88]/80">Edit →</Link>
            </div>
            <div className="space-y-3">
              {[
                { label: "Per-tx limit", value: policyDisplay.perTxLimit },
                { label: "Daily limit", value: policyDisplay.dailyLimit },
                { label: "Guardian threshold", value: policyDisplay.guardianThreshold },
                { label: "Owner required", value: policyDisplay.ownerRequired },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-white/40">{row.label}</span>
                  <span className="font-mono font-medium">{row.value}</span>
                </div>
              ))}
              {!isDemo && (
                <div className="flex items-center justify-between text-sm pt-2 border-t border-white/5/40">
                  <span className="text-white/40">Status</span>
                  <span className={`font-medium ${frozenStatus ? "text-[#F04452]" : "text-[#00FF88]"}`}>
                    {frozenStatus ? "🔒 Frozen" : "✓ Active"}
                  </span>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-white/5/40">
              <div className="text-xs text-white/40 mb-2">Whitelisted</div>
              <div className="flex flex-wrap gap-2">
                {policyDisplay.whitelisted.map(w => (
                  <Link key={w} href="/dashboard/policy" className="px-2.5 py-1 rounded-md bg-white/5 border border-white/5 text-xs text-white/50 hover:text-[#00FF88] hover:border-[#00FF88]/30 transition-colors cursor-pointer">{w}</Link>
                ))}
              </div>
            </div>
          </div>

          {/* Guardian Status */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <h2 className="font-semibold mb-4">Guardian Status</h2>
            <div className="space-y-3">
              {isDemo ? MOCK_GUARDIANS.map(g => (
                <div key={g.region} className="flex items-center justify-between text-sm">
                  <span className="text-white/40">{g.region}</span>
                  <span className="flex items-center gap-1.5 text-[#00FF88]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00FF88]" />
                    {g.status}
                  </span>
                </div>
              )) : (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/40">Guardian API</span>
                  <span className={`flex items-center gap-1.5 ${guardianStatus ? "text-[#00FF88]" : "text-[#F04452]"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${guardianStatus ? "bg-[#00FF88]" : "bg-[#F04452]"}`} />
                    {guardianStatus ? "Online" : "Offline"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Protection Status — velocity + circuit breaker */}
          {!isDemo && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
              <h2 className="font-semibold mb-4">Protection Status</h2>
              {protectionData ? (
                <div className="space-y-4">
                  {/* Circuit Breaker */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-white/40">Circuit Breaker</span>
                      <span className={`flex items-center gap-1.5 ${protectionData.circuitBreaker?.tripped ? "text-[#F04452]" : "text-[#00FF88]"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${protectionData.circuitBreaker?.tripped ? "bg-[#F04452] animate-pulse" : "bg-[#00FF88]"}`} />
                        {protectionData.circuitBreaker?.tripped ? "TRIPPED" : "Normal"}
                      </span>
                    </div>
                    {protectionData.circuitBreaker?.tripped && (
                      <div className="p-3 bg-[#F04452]/10 border border-[#F04452]/20 rounded-lg">
                        <p className="text-xs text-[#F04452] mb-2">Guardian is refusing all co-signs due to repeated suspicious activity.</p>
                        <button
                          onClick={async () => {
                            setResettingCB(true);
                            try {
                              await api.resetCircuitBreaker(accountAddress!, chainId);
                              // Trigger SWR revalidation
                              window.location.reload();
                            } catch (e) {
                              console.error("Reset failed:", e);
                            } finally {
                              setResettingCB(false);
                            }
                          }}
                          disabled={resettingCB}
                          className="w-full py-2 rounded-lg bg-[#F04452] text-white text-xs font-medium hover:brightness-110 transition-colors disabled:opacity-50"
                        >
                          {resettingCB ? "Resetting..." : "🔓 Reset Circuit Breaker"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Velocity — Hourly */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-white/40">Hourly Spend</span>
                      <span className="font-mono text-xs">
                        {protectionData.velocity?.hourlySpent ?? "0"} / {protectionData.velocity?.hourlyLimit ?? "5"} {nativeToken}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(((protectionData.velocity?.hourlyPercent ?? 0)), 100)}%`,
                          backgroundColor: (protectionData.velocity?.hourlyPercent ?? 0) > 80 ? "#F04452" : "#00FF88",
                        }}
                      />
                    </div>
                  </div>

                  {/* Velocity — Daily */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-white/40">Daily Spend</span>
                      <span className="font-mono text-xs">
                        {protectionData.velocity?.dailySpent ?? "0"} / {protectionData.velocity?.dailyLimit ?? "50"} {nativeToken}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(((protectionData.velocity?.dailyPercent ?? 0)), 100)}%`,
                          backgroundColor: (protectionData.velocity?.dailyPercent ?? 0) > 80 ? "#F04452" : "#00FF88",
                        }}
                      />
                    </div>
                  </div>

                  {/* Recent rejections count */}
                  {(protectionData.recentRejections ?? 0) > 0 && (
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-white/5">
                      <span className="text-white/40">Recent Rejections</span>
                      <span className="font-mono text-[#F04452]">{protectionData.recentRejections} in last hour</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/40">Circuit Breaker</span>
                    <span className="flex items-center gap-1.5 text-[#00FF88]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00FF88]" />
                      Normal
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/40">Velocity Limits</span>
                    <span className="text-white/40 text-xs">No activity</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Network & Fees */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <h2 className="font-semibold mb-4">Network</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/40">Chain</span>
                <span className="font-medium">{chainId === 43114 ? "Avalanche C-Chain" : chainId === 8453 ? "Base" : chainId === 42161 ? "Arbitrum One" : chainId === 43113 ? "Avalanche Fuji" : `Chain ${chainId}`}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/40">Deploy Fee</span>
                <span className="font-mono text-[#00FF88]">0.2 AVAX</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/40">Session Key Fee</span>
                <span className="font-mono text-white/60">0.01 AVAX</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/40">Recovery Fee</span>
                <span className="font-mono text-white/60">0.05 AVAX</span>
              </div>
              {!isDemo && accountAddress && (
                <div className="pt-3 border-t border-white/5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/40">Factory</span>
                    <a
                      href={`https://${chainId === 43114 ? "snowtrace.io" : "testnet.snowtrace.io"}/address/${FACTORY_ADDRESSES[chainId]}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-white/30 hover:text-[#00FF88] transition-colors"
                    >
                      {FACTORY_ADDRESSES[chainId]?.slice(0, 8)}...{FACTORY_ADDRESSES[chainId]?.slice(-4)} ↗
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <h2 className="font-semibold mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Link href="/dashboard/evaluate" className="block w-full py-2.5 rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/5 text-[#00FF88] font-medium text-center hover:bg-[#00FF88]/10 transition-colors">
                🔍 Evaluate Transaction
              </Link>
              <Link href="/dashboard/emergency" className="block w-full py-2.5 rounded-lg border border-[#F04452]/40 bg-[#F04452]/5 text-[#F04452] font-medium text-center hover:bg-[#F04452]/10 transition-colors">
                ⚠ Emergency Controls
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
