"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatEther, formatUnits } from "viem";
import { useWallet } from "@/lib/wallet";
import { useViewChain } from "@/lib/view-chain";
import {
  getStoredAccount, setStoredAccount, FACTORY_ADDRESSES, getNativeToken,
  getExplorer, getChainName, getRpcUrl, FACTORY_DEPLOY_BLOCKS, LOG_CHUNK_SIZES,
  CHAIN_TOKENS, type TokenInfo,
} from "@/lib/contracts";
import { useHealth, useProtectionStatus } from "@/lib/hooks";
import { api } from "@/lib/api";
import EditableName from "@/components/EditableName";

// ─── Raw RPC helper ───
function rpcCall(rpc: string, method: string, params: unknown[]) {
  return fetch(rpc, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  }).then(r => r.json()).then(j => j.result ?? null).catch(() => null);
}

// balanceOf(address) selector
const BALANCE_OF = "0x70a08231";

interface TokenBalance {
  token: TokenInfo;
  balance: bigint;
  formatted: string;
}

function RiskBadge({ score }: { score: number }) {
  const color = score <= 20 ? "text-[#00FF88] bg-[#00FF88]/10" : score <= 50 ? "text-[#F4A524] bg-[#F4A524]/10" : "text-[#F04452] bg-[#F04452]/10";
  return <span className={`text-xs px-2 py-0.5 rounded-md font-medium font-mono ${color}`}>Risk: {score}</span>;
}

function CopyableAddress({ address, label, compact }: { address: string; label?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  if (compact) {
    return (
      <button onClick={handleCopy} className="font-mono text-xs text-white/40 hover:text-[#00FF88] transition-colors" title={address}>
        {copied ? "✓ Copied!" : `${address.slice(0, 6)}...${address.slice(-4)}`}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-xs text-white/40 shrink-0">{label}</span>}
      <code className="text-lg font-mono text-white break-all">{address}</code>
      <button onClick={handleCopy} className="shrink-0 px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.03] text-xs font-medium hover:bg-white/[0.06] transition-colors">
        {copied ? "✓ Copied!" : "📋 Copy"}
      </button>
    </div>
  );
}

// ─── Animated number (for that "dashboard you visit daily" feel) ───
function AnimatedValue({ value, suffix }: { value: string; suffix?: string }) {
  return (
    <span className="tabular-nums">
      {value}{suffix && <span className="text-white/40 text-sm ml-1">{suffix}</span>}
    </span>
  );
}

// ─── Token Row ───
function TokenRow({ tb, chainId }: { tb: TokenBalance; chainId: number }) {
  const explorer = getExplorer(chainId);
  return (
    <div className="flex items-center justify-between py-2.5 group">
      <div className="flex items-center gap-3">
        <span className="text-lg w-7 text-center">{tb.token.icon || "🪙"}</span>
        <div>
          <span className="text-sm font-medium">{tb.token.symbol}</span>
          <span className="text-xs text-white/30 ml-2 hidden group-hover:inline">{tb.token.name}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm">{tb.formatted}</span>
        <a href={`${explorer.url}/token/${tb.token.address}`} target="_blank" rel="noreferrer"
          className="text-white/20 hover:text-[#00FF88] text-xs transition-colors opacity-0 group-hover:opacity-100">↗</a>
      </div>
    </div>
  );
}

export default function DashboardOverview() {
  const [mounted, setMounted] = useState(false);
  const [showGettingStarted, setShowGettingStarted] = useState(true);
  useEffect(() => setMounted(true), []);

  const { isConnected, address: walletAddress } = useWallet();
  const { viewChainId: chainId } = useViewChain();
  const nativeToken = getNativeToken(chainId);
  const rpc = getRpcUrl(chainId);

  const [discoveredAccount, setDiscoveredAccount] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);

  const storedAccount = mounted ? getStoredAccount(chainId) : null;
  const accountAddress = storedAccount || discoveredAccount;
  const hasAccount = !!accountAddress;
  const noAccount = !isConnected || !hasAccount;

  // ─── localStorage ───
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

  // ─── Account discovery: API first, then on-chain fallback ───
  useEffect(() => {
    if (!mounted || !isConnected || !walletAddress || storedAccount) return;

    setDiscovering(true);
    (async () => {
      // Fast path: Guardian API
      try {
        const res = await api.discoverAccounts(walletAddress, chainId);
        const accounts = res?.accounts || [];
        if (accounts.length > 0) {
          const account = accounts[0].address;
          setDiscoveredAccount(account);
          setStoredAccount(chainId, account);
          setDiscovering(false);
          return;
        }
      } catch { /* API unavailable — fall through */ }

      // Slow path: on-chain event scan
      const factoryAddress = FACTORY_ADDRESSES[chainId];
      if (!factoryAddress) { setDiscovering(false); return; }

      const rpcUrl = getRpcUrl(chainId);
      const startBlock = FACTORY_DEPLOY_BLOCKS[chainId] || 0;
      const chunkSize = LOG_CHUNK_SIZES[chainId] || 2048;
      const eventTopic = "0xf910bcf6ef45198082a2e9755330a11e60bde93603dd71de5eb22ecab5416768";
      const ownerTopic = "0x000000000000000000000000" + walletAddress.slice(2).toLowerCase();

      try {
        const currentBlock = parseInt(await rpcCall(rpcUrl, "eth_blockNumber", []), 16);
        if (!currentBlock) { setDiscovering(false); return; }
        // Scan backwards (newest first) — most users deployed recently
        for (let to = currentBlock; to >= startBlock; to -= chunkSize) {
          const from = Math.max(to - chunkSize + 1, startBlock);
          try {
            const logs = await rpcCall(rpcUrl, "eth_getLogs", [{
              address: factoryAddress, topics: [eventTopic, null, ownerTopic],
              fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16),
            }]);
            if (logs?.length > 0) {
              const account = "0x" + logs[logs.length - 1].topics[1].slice(26);
              if (account.length === 42) {
                setDiscoveredAccount(account);
                setStoredAccount(chainId, account);
                return;
              }
            }
          } catch { /* chunk failed */ }
        }
      } catch { /* discovery failed */ } finally { setDiscovering(false); }
    })();
  }, [mounted, isConnected, walletAddress, chainId, storedAccount]);

  // ─── On-chain reads (raw JSON-RPC, no viem) ───
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [ownerBalanceWei, setOwnerBalanceWei] = useState<bigint | null>(null);
  const [maxTxValue, setMaxTxValue] = useState<bigint | undefined>(undefined);
  const [dailyLimit, setDailyLimit] = useState<bigint | undefined>(undefined);
  const [isFrozen, setIsFrozen] = useState<boolean | undefined>(undefined);
  const [dailySpent, setDailySpent] = useState<bigint | undefined>(undefined);
  const [guardianThreshold, setGuardianThreshold] = useState<bigint | undefined>(undefined);
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [agentKey, setAgentKey] = useState<string | null>(null);
  const [agentBalance, setAgentBalance] = useState<bigint | null>(null);

  const SELECTORS = {
    maxTxValue: "0xe8eecf4c", dailyLimit: "0x67eeba0c", isFrozen: "0x33eeb147",
    dailySpent: "0x0bc6b89c", guardianThreshold: "0xd5af4e20", agentKey: "0xaf2c73a2",
  };

  // Fetch native + contract state
  useEffect(() => {
    if (!mounted || !accountAddress || !chainId) return;
    (async () => {
      const [bal, ownerBal, mtx, dl, frz, ds, gt, ak] = await Promise.all([
        rpcCall(rpc, "eth_getBalance", [accountAddress, "latest"]),
        walletAddress ? rpcCall(rpc, "eth_getBalance", [walletAddress, "latest"]) : null,
        rpcCall(rpc, "eth_call", [{ to: accountAddress, data: SELECTORS.maxTxValue }, "latest"]),
        rpcCall(rpc, "eth_call", [{ to: accountAddress, data: SELECTORS.dailyLimit }, "latest"]),
        rpcCall(rpc, "eth_call", [{ to: accountAddress, data: SELECTORS.isFrozen }, "latest"]),
        rpcCall(rpc, "eth_call", [{ to: accountAddress, data: SELECTORS.dailySpent }, "latest"]),
        rpcCall(rpc, "eth_call", [{ to: accountAddress, data: SELECTORS.guardianThreshold }, "latest"]),
        rpcCall(rpc, "eth_call", [{ to: accountAddress, data: SELECTORS.agentKey }, "latest"]),
      ]);
      if (bal) setBalanceWei(BigInt(bal));
      if (ownerBal) setOwnerBalanceWei(BigInt(ownerBal));
      if (mtx) setMaxTxValue(BigInt(mtx));
      if (dl) setDailyLimit(BigInt(dl));
      if (frz) setIsFrozen(BigInt(frz) !== BigInt(0));
      if (ds) setDailySpent(BigInt(ds));
      if (gt) setGuardianThreshold(BigInt(gt));
      if (ak) {
        const agentAddr = "0x" + ak.slice(26);
        if (agentAddr !== "0x0000000000000000000000000000000000000000") {
          setAgentKey(agentAddr);
          const agentBal = await rpcCall(rpc, "eth_getBalance", [agentAddr, "latest"]);
          if (agentBal) setAgentBalance(BigInt(agentBal));
        }
      }
    })();
  }, [mounted, accountAddress, walletAddress, chainId, rpc]);

  // Fetch token balances
  useEffect(() => {
    if (!mounted || !accountAddress || !chainId) return;
    const tokens = CHAIN_TOKENS[chainId] || [];
    if (tokens.length === 0) { setTokenBalances([]); return; }

    setTokensLoading(true);
    (async () => {
      const paddedAddr = accountAddress.slice(2).toLowerCase().padStart(64, "0");
      const results: TokenBalance[] = [];
      // Batch all balanceOf calls
      const calls = tokens.map(t =>
        rpcCall(rpc, "eth_call", [{ to: t.address, data: BALANCE_OF + paddedAddr }, "latest"])
      );
      const responses = await Promise.all(calls);
      for (let i = 0; i < tokens.length; i++) {
        const raw = responses[i];
        if (!raw || raw === "0x" || raw === "0x0") continue;
        const balance = BigInt(raw);
        if (balance === BigInt(0)) continue;
        const formatted = parseFloat(formatUnits(balance, tokens[i].decimals));
        // Show up to 6 decimals for small amounts, 2 for large
        const display = formatted < 0.01 ? formatted.toPrecision(3) : formatted < 1000 ? formatted.toFixed(4) : formatted.toLocaleString(undefined, { maximumFractionDigits: 2 });
        results.push({ token: tokens[i], balance, formatted: display });
      }
      // Sort by rough value (stablecoins first since they're usually larger nominal amounts)
      results.sort((a, b) => Number(b.balance * BigInt(10 ** (18 - b.token.decimals))) - Number(a.balance * BigInt(10 ** (18 - a.token.decimals))));
      setTokenBalances(results);
      setTokensLoading(false);
    })();
  }, [mounted, accountAddress, chainId, rpc]);

  const { data: healthData } = useHealth();
  const { data: protectionData } = useProtectionStatus(accountAddress ?? undefined, chainId);
  const [resettingCB, setResettingCB] = useState(false);

  if (!mounted) return null;

  // Loading state
  if (isConnected && !hasAccount && discovering) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin h-12 w-12 border-4 border-[#00FF88] border-t-transparent rounded-full mx-auto mb-6" />
        <h2 className="text-xl font-bold mb-2">Searching for your Sigil Wallet...</h2>
        <p className="text-white/40">Scanning on-chain records</p>
      </div>
    );
  }

  // No account CTA
  if (isConnected && !hasAccount) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="mb-6"><img src="/sigil-symbol.svg" alt="Sigil" className="w-16 h-16 mx-auto" /></div>
        <h2 className="text-2xl font-bold mb-3">No Sigil Wallet Found</h2>
        <p className="text-white/40 mb-8 text-center max-w-md">
          Deploy a Sigil Wallet to protect your AI agent with 3-layer security.
        </p>
        <Link href="/onboarding" className="px-8 py-3 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-xl font-medium transition-colors">
          Deploy Your Sigil Wallet →
        </Link>
      </div>
    );
  }

  // ─── Data formatting ───
  const sigilBalance = balanceWei !== null ? parseFloat(formatEther(balanceWei)) : null;
  const ownerBalance = ownerBalanceWei !== null ? parseFloat(formatEther(ownerBalanceWei)) : null;
  const agentBal = agentBalance !== null ? parseFloat(formatEther(agentBalance)) : null;

  const policyDisplay = noAccount ? null : {
    perTxLimit: maxTxValue !== undefined ? `${parseFloat(formatEther(maxTxValue)).toFixed(2)} ${nativeToken}` : "Loading...",
    dailyLimit: dailyLimit !== undefined ? `${parseFloat(formatEther(dailyLimit)).toFixed(2)} ${nativeToken}` : "Loading...",
    guardianThreshold: guardianThreshold !== undefined ? `> ${parseFloat(formatEther(guardianThreshold)).toFixed(2)} ${nativeToken}` : "Loading...",
    ownerRequired: "See policy page",
    whitelisted: ["View in Policies →"],
  };

  const dailySpentVal = !noAccount && dailySpent !== undefined ? parseFloat(formatEther(dailySpent)).toFixed(2) : !noAccount ? "0.00" : null;
  const dailyLimitVal = !noAccount && dailyLimit !== undefined ? parseFloat(formatEther(dailyLimit)).toFixed(2) : !noAccount ? "—" : null;
  const dailyPercent = dailySpentVal && dailyLimitVal && parseFloat(dailyLimitVal) > 0
    ? (parseFloat(dailySpentVal) / parseFloat(dailyLimitVal)) * 100 : 0;

  const frozenStatus = !noAccount && isFrozen !== undefined ? isFrozen as boolean : false;
  const guardianStatus = healthData?.status === "healthy" || healthData?.status === "ok";
  const explorer = getExplorer(chainId);

  return (
    <div className="space-y-6">
      {/* ─── Frozen Banner ─── */}
      {frozenStatus && (
        <div className="p-4 bg-[#F04452]/10 border border-[#F04452]/30 rounded-xl flex items-center gap-3">
          <span className="text-2xl">🔒</span>
          <div>
            <div className="font-bold text-[#F04452]">Wallet Frozen</div>
            <div className="text-sm text-white/40">All transactions are blocked. <Link href="/dashboard/emergency" className="text-[#00FF88] underline">Manage →</Link></div>
          </div>
        </div>
      )}

      {noAccount && !discovering && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <p className="text-white/40 mb-4">{isConnected ? "No Sigil Wallet found on this chain" : "Connect your wallet to get started"}</p>
          {isConnected && (
            <Link href="/onboarding" className="inline-flex px-6 py-2.5 bg-[#00FF88] text-[#050505] rounded-lg text-sm font-medium hover:brightness-110 transition-colors">
              Create Your Wallet →
            </Link>
          )}
        </div>
      )}

      {/* ─── Wallet Identity Card ─── */}
      {!noAccount && accountAddress && (
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent p-6">
          <div className="flex items-start justify-between">
            <div>
              <EditableName chainId={chainId} address={accountAddress} />
              <div className="text-xs text-white/30 uppercase tracking-wider mt-1 mb-3">Sigil Wallet · {getChainName(chainId)}</div>
              <CopyableAddress address={accountAddress} />
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${frozenStatus ? "bg-[#F04452]" : "bg-[#00FF88] animate-pulse"}`} />
              <span className={`text-xs font-medium ${frozenStatus ? "text-[#F04452]" : "text-[#00FF88]"}`}>
                {frozenStatus ? "Frozen" : "Active"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Getting Started (dismissable) ─── */}
      {!noAccount && accountAddress && showGettingStarted && (
        <div className="rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/[0.03] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[#00FF88]">Setup Checklist</h2>
            <button onClick={dismissGettingStarted} className="text-white/30 hover:text-white text-sm">✕</button>
          </div>
          <div className="space-y-3">
            {/* Step 1: Fund Sigil Wallet */}
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#00FF88] font-bold text-sm">1</span>
                <span className="font-medium text-sm">Fund your Sigil Wallet</span>
              </div>
              <p className="text-xs text-white/30 mb-2">Send {nativeToken} and tokens your agent will trade. This is your on-chain smart account — all agent transactions execute from here.</p>
              <div className="flex items-center gap-2 bg-[#050505] rounded-lg px-3 py-2 border border-white/5">
                <code className="text-xs text-[#00FF88] break-all flex-1">{accountAddress}</code>
                <button onClick={() => navigator.clipboard.writeText(accountAddress)} className="shrink-0 px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 rounded text-white/40 transition-colors">Copy</button>
              </div>
            </div>

            {/* Step 2: Fund Agent Wallet */}
            <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[#00FF88] font-bold text-sm">2</span>
                <span className="font-medium text-sm">Fund your Agent Wallet (gas)</span>
              </div>
              <p className="text-xs text-white/30 mb-2">Your agent&apos;s EOA needs a small amount of {nativeToken} to pay gas when submitting transactions. A few dollars worth is enough.</p>
              {agentKey ? (
                <div className="flex items-center gap-2 bg-[#050505] rounded-lg px-3 py-2 border border-white/5">
                  <code className="text-xs text-white/50 break-all flex-1">{agentKey}</code>
                  <button onClick={() => navigator.clipboard.writeText(agentKey)} className="shrink-0 px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 rounded text-white/40 transition-colors">Copy</button>
                </div>
              ) : (
                <p className="text-xs text-white/20">Agent key not yet configured — <Link href="/dashboard/agent-access" className="text-[#00FF88] hover:underline">set up first</Link></p>
              )}
            </div>

            {/* Step 3-5 compact row */}
            <div className="grid grid-cols-3 gap-3">
              <Link href="/dashboard/agent-access" className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-[#00FF88]/30 transition-colors block">
                <span className="text-[#00FF88] font-bold text-sm">3</span>
                <div className="font-medium text-sm mt-1">Generate API Key</div>
                <div className="text-white/30 text-xs mt-0.5">Agent needs this to call Guardian</div>
              </Link>
              <Link href="/dashboard/policy" className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-[#00FF88]/30 transition-colors block">
                <span className="text-[#00FF88] font-bold text-sm">4</span>
                <div className="font-medium text-sm mt-1">Review Policies</div>
                <div className="text-white/30 text-xs mt-0.5">Spending limits & whitelisted contracts</div>
              </Link>
              <Link href="/dashboard/evaluate" className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-[#00FF88]/30 transition-colors block">
                <span className="text-[#00FF88] font-bold text-sm">5</span>
                <div className="font-medium text-sm mt-1">Test a Transaction</div>
                <div className="text-white/30 text-xs mt-0.5">Evaluate through all 3 Guardian layers</div>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ─── Portfolio + Stats Row ─── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Native Balance */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="text-xs text-white/40 uppercase tracking-wide mb-2">Sigil Wallet</div>
          <div className="text-3xl font-bold font-mono">
            {noAccount ? "—" : sigilBalance !== null ? <AnimatedValue value={sigilBalance.toFixed(4)} suffix={nativeToken} /> : "Loading..."}
          </div>
          {!noAccount && sigilBalance !== null && sigilBalance === 0 && (
            <div className="text-xs text-[#F4A524] mt-2">⚠ Send {nativeToken} to your Sigil Wallet to get started</div>
          )}
          {!noAccount && ownerBalance !== null && (
            <div className="text-xs text-white/30 mt-2 font-mono">
              Origin: {ownerBalance.toFixed(4)} {nativeToken}
            </div>
          )}

        </div>

        {/* Today's Spend */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="text-xs text-white/40 uppercase tracking-wide mb-2">Today&apos;s Spend</div>
          {noAccount ? (
            <div className="text-white/20 text-sm py-2">—</div>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold font-mono">{dailySpentVal ?? "0.00"}</span>
                <span className="text-white/30 text-sm font-mono">/ {dailyLimitVal ?? "—"} {nativeToken}</span>
              </div>
              <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-[#00FF88] rounded-full transition-all" style={{ width: `${Math.min(dailyPercent, 100)}%` }} />
              </div>
              {dailySpentVal === "0.00" && <div className="text-xs text-white/30 mt-1">No activity today</div>}
            </>
          )}
        </div>

        {/* Agent Wallet — gas funding notice */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="text-xs text-white/40 uppercase tracking-wide mb-2">Agent Wallet <span className="text-white/20">(gas only)</span></div>
          {noAccount ? (
            <div className="text-white/20 text-sm py-2">—</div>
          ) : agentKey ? (
            <>
              <div className={`text-3xl font-bold font-mono ${agentBal !== null && agentBal < 0.005 ? "text-[#F4A524]" : "text-[#00FF88]"}`}>
                {agentBal !== null ? <AnimatedValue value={agentBal.toFixed(4)} suffix={nativeToken} /> : "—"}
              </div>
              {agentBal !== null && agentBal < 0.005 && (
                <div className="text-xs text-[#F4A524] mt-2 flex items-center gap-1">
                  ⚠ Low gas — fund your agent to submit txs
                </div>
              )}
              {agentBal !== null && agentBal >= 0.005 && (
                <div className="text-xs text-white/30 mt-2">Gas for on-chain submissions</div>
              )}
              <div className="mt-2">
                <CopyableAddress address={agentKey} compact />
              </div>
            </>
          ) : (
            <>
              <div className="text-3xl font-bold text-white/20 font-mono">—</div>
              <div className="text-xs text-white/30 mt-2">No agent key configured</div>
              <Link href="/dashboard/agent-access" className="text-[#00FF88] text-xs mt-1 inline-block hover:underline">Set up →</Link>
            </>
          )}
        </div>
      </div>

      {/* ─── Main Content Grid ─── */}
      <div className="grid grid-cols-5 gap-6">
        {/* ─── Left Column (3/5) ─── */}
        <div className="col-span-3 space-y-6">
          {/* Token Balances */}
          {!noAccount && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Token Balances</h2>
                {accountAddress && (
                  <a href={`${explorer.url}/address/${accountAddress}#tokentxns`} target="_blank" rel="noreferrer"
                    className="text-xs text-white/30 hover:text-[#00FF88] transition-colors">View on explorer ↗</a>
                )}
              </div>
              {tokensLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-5 w-5 border-2 border-[#00FF88] border-t-transparent rounded-full" />
                  <span className="text-white/30 text-sm ml-3">Scanning tokens...</span>
                </div>
              ) : tokenBalances.length > 0 ? (
                <div className="divide-y divide-white/[0.04]">
                  {tokenBalances.map(tb => (
                    <TokenRow key={tb.token.address} tb={tb} chainId={chainId} />
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <div className="text-white/20 text-2xl mb-2">🪙</div>
                  <p className="text-white/30 text-sm">No tokens found</p>
                  <p className="text-white/20 text-xs mt-1">Send ERC-20 tokens to your Sigil Wallet to see them here</p>
                </div>
              )}
            </div>
          )}

          {/* Recent Activity */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold">Recent Activity</h2>
              <Link href="/dashboard/activity" className="text-[#00FF88] text-sm hover:text-[#00FF88]/80">View all →</Link>
            </div>
            {noAccount ? (
              <div className="text-center py-8 text-white/20 text-sm">Connect wallet to view activity</div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="text-white/10 text-3xl mb-3">📋</div>
                <p className="text-white/30 mb-4">No activity yet</p>
                <Link href="/dashboard/evaluate" className="px-5 py-2 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-lg font-medium text-sm transition-colors">
                  Evaluate Transaction →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ─── Right Column (2/5) ─── */}
        <div className="col-span-2 space-y-6">
          {/* Active Policy */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Active Policy</h2>
              <Link href="/dashboard/policy" className="text-[#00FF88] text-sm hover:text-[#00FF88]/80">Edit →</Link>
            </div>
            {policyDisplay ? (
              <>
                <div className="space-y-3">
                  {[
                    { label: "Per-tx limit", value: policyDisplay.perTxLimit },
                    { label: "Daily limit", value: policyDisplay.dailyLimit },
                    { label: "Guardian co-sign", value: policyDisplay.guardianThreshold },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                      <span className="text-white/40">{row.label}</span>
                      <span className="font-mono font-medium">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-white/[0.04]">
                    <span className="text-white/40">Status</span>
                    <span className={`font-medium ${frozenStatus ? "text-[#F04452]" : "text-[#00FF88]"}`}>
                      {frozenStatus ? "🔒 Frozen" : "✓ Active"}
                    </span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/[0.04]">
                  <div className="text-xs text-white/30 mb-2">Whitelisted</div>
                  <div className="flex flex-wrap gap-2">
                    {policyDisplay.whitelisted.map(w => (
                      <Link key={w} href="/dashboard/policy" className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-xs text-white/50 hover:text-[#00FF88] hover:border-[#00FF88]/30 transition-colors">{w}</Link>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-white/20 text-sm py-4 text-center">—</div>
            )}
          </div>

          {/* Guardian + Protection */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="font-semibold mb-4">Protection Status</h2>
            <div className="space-y-3">
              {/* Guardian */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/40">Guardian</span>
                {noAccount ? (
                  <span className="text-white/20">—</span>
                ) : (
                  <span className={`flex items-center gap-1.5 ${guardianStatus ? "text-[#00FF88]" : "text-[#F04452]"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${guardianStatus ? "bg-[#00FF88]" : "bg-[#F04452]"}`} />
                    {guardianStatus ? "Online" : "Offline"}
                  </span>
                )}
              </div>

              {/* Circuit Breaker */}
              {!noAccount && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/40">Circuit Breaker</span>
                  <span className={`flex items-center gap-1.5 ${protectionData?.circuitBreaker?.tripped ? "text-[#F04452]" : "text-[#00FF88]"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${protectionData?.circuitBreaker?.tripped ? "bg-[#F04452] animate-pulse" : "bg-[#00FF88]"}`} />
                    {protectionData?.circuitBreaker?.tripped ? "TRIPPED" : "Normal"}
                  </span>
                </div>
              )}

              {/* Tripped reset */}
              {!noAccount && protectionData?.circuitBreaker?.tripped && (
                <button
                  onClick={async () => {
                    setResettingCB(true);
                    try { await api.resetCircuitBreaker(accountAddress!, chainId); window.location.reload(); }
                    catch (e) { /* Circuit breaker reset failed */ } finally { setResettingCB(false); }
                  }}
                  disabled={resettingCB}
                  className="w-full py-2 rounded-lg bg-[#F04452] text-white text-xs font-medium hover:brightness-110 transition-colors disabled:opacity-50"
                >
                  {resettingCB ? "Resetting..." : "🔓 Reset Circuit Breaker"}
                </button>
              )}
            </div>

            {/* Velocity bars */}
            {!noAccount && protectionData?.velocity && (
              <div className="mt-4 pt-4 border-t border-white/[0.04] space-y-3">
                {[
                  { label: "Hourly", spent: protectionData.velocity.hourlySpent, limit: protectionData.velocity.hourlyLimit, pct: protectionData.velocity.hourlyPercent },
                  { label: "Daily", spent: protectionData.velocity.dailySpent, limit: protectionData.velocity.dailyLimit, pct: protectionData.velocity.dailyPercent },
                ].map(v => (
                  <div key={v.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-white/40">{v.label}</span>
                      <span className="font-mono text-xs">{v.spent ?? "0"} / {v.limit ?? "—"} {nativeToken}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(v.pct ?? 0, 100)}%`, backgroundColor: (v.pct ?? 0) > 80 ? "#F04452" : "#00FF88" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Network */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="font-semibold mb-4">Network</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-white/40">Chain</span>
                <span className="font-medium">{getChainName(chainId)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/40">Explorer</span>
                <a href={explorer.url} target="_blank" rel="noreferrer" className="text-[#00FF88] text-xs hover:underline">{explorer.name} ↗</a>
              </div>
              {!noAccount && accountAddress && (
                <>
                  <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                    <span className="text-white/40">Wallet</span>
                    <a href={`${explorer.url}/address/${accountAddress}`} target="_blank" rel="noreferrer"
                      className="font-mono text-xs text-white/30 hover:text-[#00FF88]">{accountAddress.slice(0, 8)}...{accountAddress.slice(-4)} ↗</a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/40">Factory</span>
                    <a href={`${explorer.url}/address/${FACTORY_ADDRESSES[chainId]}`} target="_blank" rel="noreferrer"
                      className="font-mono text-xs text-white/30 hover:text-[#00FF88]">{FACTORY_ADDRESSES[chainId]?.slice(0, 8)}...{FACTORY_ADDRESSES[chainId]?.slice(-4)} ↗</a>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="font-semibold mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Link href="/dashboard/evaluate" className="block w-full py-2.5 rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/5 text-[#00FF88] font-medium text-center text-sm hover:bg-[#00FF88]/10 transition-colors">
                🔍 Evaluate Transaction
              </Link>
              <Link href="/dashboard/policy" className="block w-full py-2.5 rounded-lg border border-white/10 bg-white/[0.02] text-white/60 font-medium text-center text-sm hover:bg-white/[0.04] transition-colors">
                🛡️ Manage Policies
              </Link>
              <Link href="/dashboard/emergency" className="block w-full py-2.5 rounded-lg border border-[#F04452]/30 bg-[#F04452]/5 text-[#F04452] font-medium text-center text-sm hover:bg-[#F04452]/10 transition-colors">
                🚨 Emergency Controls
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
