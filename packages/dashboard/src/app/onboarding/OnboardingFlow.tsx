"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount as useWagmiAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseEther, encodeFunctionData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FACTORY_ABI, FACTORY_ADDRESSES, GUARDIAN_ADDRESS, SIGIL_ACCOUNT_ABI, isMainnet, setStoredAccount, addStoredAccount, setActiveAccount, getNativeToken } from "@/lib/contracts";
import { getBundlesForChain, getTemplateBundles, POLICY_BUNDLES, TEMPLATE_BUNDLE_MAP } from "@/lib/bundles";
import { api } from "@/lib/api";
import { decodeErrorMessage } from "@/lib/errors";
import { useWallet } from "@/lib/wallet";

// Chain-aware limit multipliers: native token amounts differ per chain
// Base values are in "units" — multiplied by chain factor to get native token amounts
const CHAIN_MULTIPLIERS: Record<number, number> = {
  1: 0.003,      // ETH ~$3000 — 0.003 ETH ≈ $9
  137: 10,       // POL ~$0.10 — 10 POL ≈ $1 (cheap chain)
  43114: 1,      // AVAX ~$9 — base unit
  8453: 0.003,   // ETH ~$3000 — 0.003 ETH ≈ $9
  42161: 0.003,  // ETH ~$3000
  16661: 10,     // A0GI ~$0.90 — 10 A0GI ≈ $9
};

function getChainAwareLimits(base: { maxTx: string; daily: string; guardianThreshold: string }, chainId: number) {
  const m = CHAIN_MULTIPLIERS[chainId] ?? 1;
  return {
    maxTx: (parseFloat(base.maxTx) * m).toFixed(m < 0.01 ? 6 : m < 1 ? 4 : 2),
    daily: (parseFloat(base.daily) * m).toFixed(m < 0.01 ? 6 : m < 1 ? 4 : 2),
    guardianThreshold: (parseFloat(base.guardianThreshold) * m).toFixed(m < 0.01 ? 6 : m < 1 ? 4 : 2),
  };
}

const TEMPLATE_BASES = [
  {
    id: "conservative",
    name: "Conservative",
    emoji: "🛡️",
    desc: "Minimal risk. Small transfers, tight daily caps. Ideal for testing or low-value operations.",
    maxTx: "0.1",
    daily: "0.5",
    guardianThreshold: "0.05",
    color: "border-blue-500/40 bg-blue-500/5 hover:border-blue-500/60",
    selected: "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/50",
  },
  {
    id: "moderate",
    name: "Moderate",
    emoji: "⚖️",
    desc: "Balanced limits for everyday DeFi operations — swaps, staking, lending.",
    maxTx: "0.5",
    daily: "2",
    guardianThreshold: "0.2",
    color: "border-[#00FF88]/40 bg-[#00FF88]/5 hover:border-[#00FF88]/60",
    selected: "border-[#00FF88] bg-[#00FF88]/10 ring-2 ring-green-500/50",
  },
  {
    id: "aggressive",
    name: "Aggressive",
    emoji: "📈",
    desc: "Higher limits for active trading bots. Frequent swaps, larger positions.",
    maxTx: "2",
    daily: "10",
    guardianThreshold: "1",
    color: "border-orange-500/40 bg-orange-500/5 hover:border-orange-500/60",
    selected: "border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/50",
  },
  {
    id: "defi-agent",
    name: "DeFi Agent",
    emoji: "🤖",
    desc: "Purpose-built for autonomous DeFi agents. Moderate per-tx, generous daily for compounding.",
    maxTx: "0.3",
    daily: "5",
    guardianThreshold: "0.1",
    color: "border-cyan-500/40 bg-cyan-500/5 hover:border-cyan-500/60",
    selected: "border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/50",
  },
  {
    id: "nft-agent",
    name: "NFT Agent",
    emoji: "🎨",
    desc: "Optimized for NFT minting, bidding, and collecting. Higher per-tx for mint prices.",
    maxTx: "1",
    daily: "3",
    guardianThreshold: "0.5",
    color: "border-purple-500/40 bg-purple-500/5 hover:border-purple-500/60",
    selected: "border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/50",
  },
  {
    id: "yield-farmer",
    name: "Yield Farmer",
    emoji: "🌾",
    desc: "Built for auto-compounding and yield optimization. High daily cap for frequent harvests.",
    maxTx: "0.5",
    daily: "8",
    guardianThreshold: "0.2",
    color: "border-yellow-500/40 bg-yellow-500/5 hover:border-yellow-500/60",
    selected: "border-yellow-500 bg-yellow-500/10 ring-2 ring-yellow-500/50",
  },
  {
    id: "sniper",
    name: "Sniper Bot",
    emoji: "🎯",
    desc: "For token launch sniping and fast trades. High per-tx, moderate daily. Speed over caution.",
    maxTx: "3",
    daily: "15",
    guardianThreshold: "1.5",
    color: "border-red-500/40 bg-red-500/5 hover:border-red-500/60",
    selected: "border-red-500 bg-red-500/10 ring-2 ring-red-500/50",
  },
  {
    id: "treasury",
    name: "Treasury Manager",
    emoji: "🏦",
    desc: "DAO and treasury operations. Large daily allowance, moderate per-tx to prevent single-tx drain.",
    maxTx: "1",
    daily: "20",
    guardianThreshold: "0.5",
    color: "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60",
    selected: "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/50",
  },
  {
    id: "micro-agent",
    name: "Micro Agent",
    emoji: "🐜",
    desc: "For micro-transactions and tipping. Tiny limits, high frequency. Perfect for social or gaming agents.",
    maxTx: "0.01",
    daily: "0.1",
    guardianThreshold: "0.005",
    color: "border-pink-500/40 bg-pink-500/5 hover:border-pink-500/60",
    selected: "border-pink-500 bg-pink-500/10 ring-2 ring-pink-500/50",
  },
  {
    id: "prediction",
    name: "Prediction Agent",
    emoji: "🎲",
    desc: "For prediction markets like Polymarket. Moderate bets, high daily volume. Deploy on Polygon, whitelist verified contracts after deploy.",
    maxTx: "0.5",
    daily: "10",
    guardianThreshold: "0.3",
    color: "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60",
    selected: "border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/50",
  },
  {
    id: "custom",
    name: "Custom",
    emoji: "⚙️",
    desc: "Set your own limits. Full control over max transaction, daily cap, and guardian threshold.",
    maxTx: "1",
    daily: "5",
    guardianThreshold: "0.5",
    color: "border-white/40 bg-white/5 hover:border-white/60",
    selected: "border-white bg-white/10 ring-2 ring-white/50",
  },
];

const CHAINS = [
  { id: 1, name: "Ethereum", icon: "🔷", mainnet: true },
  { id: 137, name: "Polygon", icon: "🟣", mainnet: true },
  { id: 43114, name: "Avalanche", icon: "🔺", mainnet: true },
  { id: 8453, name: "Base", icon: "🔵", mainnet: true },
  { id: 42161, name: "Arbitrum One", icon: "⚪", mainnet: true },
  { id: 16661, name: "0G Mainnet", icon: "⚡", mainnet: true },
];

type Step = 1 | 2 | 3 | 4 | 5;

export default function OnboardingFlow() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useWagmiAccount();
  const { isAuthenticated, signIn, isAuthenticating, needsSignIn } = useWallet();
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<number>(137);
  const [agentPrivateKey, setAgentPrivateKey] = useState("");
  const [agentAddress, setAgentAddress] = useState("");
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyAcknowledged, setKeyAcknowledged] = useState(false);
  const [customMaxTx, setCustomMaxTx] = useState("1");
  const [customDaily, setCustomDaily] = useState("5");
  const [customThreshold, setCustomThreshold] = useState("0.5");
  const [deployError, setDeployError] = useState<string | null>(null);
  const [needsDeploy, setNeedsDeploy] = useState(false);
  const [deployedAddress, setDeployedAddress] = useState("");
  const [registering, setRegistering] = useState(false);
  const [existingAccount, setExistingAccount] = useState<string | null>(null);

  const [applyingWhitelist, setApplyingWhitelist] = useState(false);
  const [whitelistApplied, setWhitelistApplied] = useState(false);
  const [whitelistError, setWhitelistError] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });
  const [manualReceipt, setManualReceipt] = useState<typeof receipt | null>(null);
  const effectiveReceipt = receipt || manualReceipt;
  const effectiveConfirmed = isConfirmed || !!manualReceipt;

  const templateBase = TEMPLATE_BASES.find(t => t.id === selectedTemplate);
  const chainLimits = templateBase ? getChainAwareLimits(templateBase, selectedChain) : null;
  // For custom template, use user-provided values directly (already in native token units)
  const isCustom = selectedTemplate === "custom";
  const template = isCustom && templateBase
    ? { ...templateBase, maxTx: customMaxTx, daily: customDaily, guardianThreshold: customThreshold }
    : templateBase && chainLimits ? { ...templateBase, ...chainLimits } : null;

  // Generate Agent Wallet key
  const generateKey = useCallback(() => {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    setAgentPrivateKey(pk);
    setAgentAddress(account.address);
    setKeyCopied(false);
    setKeyAcknowledged(false);
  }, []);

  // Handle deploy
  const handleDeploy = useCallback(() => {
    if (!address || !template || !agentAddress) return;
    setDeployError(null);

    const factoryAddress = FACTORY_ADDRESSES[selectedChain];
    if (!factoryAddress) {
      setDeployError("No factory deployed on this chain");
      return;
    }

    // Switch chain if needed — retry deploy after switch completes
    if (currentChainId !== selectedChain) {
      switchChain({ chainId: selectedChain });
      setNeedsDeploy(true);
      return;
    }

    const salt = BigInt(Date.now());

    // Known deploy fees per chain (avoids RPC readContract which fails on some public RPCs due to multicall issues)
    // These match the on-chain deployFee() values set by factory owner
    const DEPLOY_FEES: Record<number, bigint> = {
      1:     BigInt("3000000000000000"),      // 0.003 ETH
      137:   BigInt("10000000000000000000"),  // 10 POL
      43114: BigInt("500000000000000000"),    // 0.5 AVAX
      8453:  BigInt("3000000000000000"),      // 0.003 ETH
      42161: BigInt("3000000000000000"),      // 0.003 ETH
      16661: BigInt("1000000000000000000"),   // 1 A0GI
    };

    const fee = DEPLOY_FEES[selectedChain];
    if (!fee) {
      setDeployError(`Unknown deploy fee for chain ${selectedChain}`);
      return;
    }

    writeContract({
      address: factoryAddress,
      abi: FACTORY_ABI,
      functionName: "createAccount",
      args: [
        address,
        agentAddress as `0x${string}`,
        GUARDIAN_ADDRESS,
        parseEther(template.maxTx),
        parseEther(template.daily),
        parseEther(template.guardianThreshold),
        salt,
      ],
      value: fee,
    });
  }, [address, template, agentAddress, selectedChain, currentChainId, switchChain, writeContract]);

  // Retry deploy after chain switch completes
  useEffect(() => {
    if (needsDeploy && currentChainId === selectedChain) {
      setNeedsDeploy(false);
      handleDeploy();
    }
  }, [needsDeploy, currentChainId, selectedChain, handleDeploy]);

  // Fallback: if wagmi's receipt hook doesn't resolve in 5s, poll via raw JSON-RPC
  // (bypasses viem multicall which fails on some public RPCs)
  useEffect(() => {
    if (!txHash || isConfirmed || manualReceipt) return;

    const RPC_URLS: Record<number, string[]> = {
      1: ["https://eth.drpc.org"],
      137: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org"],
      43114: ["https://api.avax.network/ext/bc/C/rpc"],
      8453: ["https://mainnet.base.org"],
      42161: ["https://arb1.arbitrum.io/rpc"],
      16661: ["https://0g.drpc.org"],
    };

    let cancelled = false;
    const rpcs = RPC_URLS[selectedChain] || [];

    const pollInterval = setInterval(async () => {
      if (cancelled || rpcs.length === 0) return;
      for (const rpc of rpcs) {
        try {
          const res = await fetch(rpc, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
          });
          const json = await res.json();
          if (json.result && json.result.status && !cancelled) {
            // Convert raw receipt to match wagmi's format enough for our log extraction
            setManualReceipt({
              status: json.result.status === "0x1" ? "success" : "reverted",
              logs: json.result.logs || [],
              contractAddress: json.result.contractAddress,
              transactionHash: txHash,
            } as unknown as typeof receipt);
            clearInterval(pollInterval);
            return;
          }
        } catch {
          // try next RPC
        }
      }
    }, 3000);

    // Stop after 2 minutes
    const timeout = setTimeout(() => { cancelled = true; clearInterval(pollInterval); }, 120000);
    return () => { cancelled = true; clearInterval(pollInterval); clearTimeout(timeout); };
  }, [txHash, isConfirmed, manualReceipt, selectedChain]);

  // After tx confirmed, extract deployed address and register
  useEffect(() => {
    if (!effectiveConfirmed || !effectiveReceipt || deployedAddress) return;

    // Extract deployed account address from factory's AccountCreated event
    // AccountCreated(address indexed account, address indexed owner, address indexed agentKey, address guardianKey)
    const ACCOUNT_CREATED_TOPIC = "0xf910bcf6ef45198082a2e9755330a11e60bde93603dd71de5eb22ecab5416768";
    const factoryAddr = FACTORY_ADDRESSES[selectedChain]?.toLowerCase();
    const logs = effectiveReceipt.logs;
    let accountAddr = "";

    // First: look for AccountCreated event from the factory contract
    for (const log of logs) {
      const logAddr = (typeof log.address === "string" ? log.address : "").toLowerCase();
      const topics = log.topics || [];
      if (logAddr === factoryAddr && topics[0] === ACCOUNT_CREATED_TOPIC && topics.length >= 2 && topics[1]) {
        // topic[1] = indexed account address (padded to 32 bytes)
        accountAddr = "0x" + topics[1].slice(26);
        break;
      }
    }

    // Fallback: any log from the factory with 2+ topics
    if (!accountAddr) {
      for (const log of logs) {
        const logAddr = (typeof log.address === "string" ? log.address : "").toLowerCase();
        const topics2 = log.topics || [];
        if (logAddr === factoryAddr && topics2.length >= 2 && topics2[1]) {
          accountAddr = "0x" + topics2[1].slice(26);
          break;
        }
      }
    }

    // Last resort: contractAddress (unlikely for factory pattern)
    if (!accountAddr && effectiveReceipt.contractAddress) {
      accountAddr = effectiveReceipt.contractAddress;
    }

    if (accountAddr) {
      setDeployedAddress(accountAddr);
      addStoredAccount(selectedChain, accountAddr);
      setActiveAccount(selectedChain, accountAddr);

      // Register with API
      setRegistering(true);
      api.createAccount({
        address: accountAddr,
        agentKey: agentAddress,
        guardianKey: GUARDIAN_ADDRESS,
        chainId: selectedChain,
        factoryTx: txHash,
      }).catch(() => {
        // API registration failed — wallet is still deployed on-chain
      }).finally(() => setRegistering(false));

      // Apply whitelist bundles if template has mapped bundles
      const bundleIds = selectedTemplate ? TEMPLATE_BUNDLE_MAP[selectedTemplate] : undefined;
      if (bundleIds && bundleIds.length > 0 && address) {
        const chainBundles = getBundlesForChain(selectedChain);
        const toApply = chainBundles.filter(b => bundleIds.includes(b.id));
        if (toApply.length > 0) {
          setApplyingWhitelist(true);
          (async () => {
            try {
              for (const bundle of toApply) {
                for (const target of bundle.targets) {
                  const data = encodeFunctionData({
                    abi: SIGIL_ACCOUNT_ABI,
                    functionName: "setAllowedTarget",
                    args: [target.address as `0x${string}`, true],
                  });
                  await window.ethereum?.request({
                    method: "eth_sendTransaction",
                    params: [{ from: address, to: accountAddr, data, value: "0x0" }],
                  });
                }
                for (const fn of bundle.functions) {
                  const data = encodeFunctionData({
                    abi: SIGIL_ACCOUNT_ABI,
                    functionName: "setAllowedFunction",
                    args: [fn.selector as `0x${string}`, true],
                  });
                  await window.ethereum?.request({
                    method: "eth_sendTransaction",
                    params: [{ from: address, to: accountAddr, data, value: "0x0" }],
                  });
                }
              }
              setWhitelistApplied(true);
            } catch (err) {
              setWhitelistError(err instanceof Error ? err.message : "Whitelist tx rejected");
            }
            setApplyingWhitelist(false);
          })();
        }
      }
    }
  }, [effectiveConfirmed, effectiveReceipt, deployedAddress, selectedChain, address, agentAddress]);

  if (!mounted) return null;

  const isDeploying = isWritePending || (isConfirming && !effectiveConfirmed);

  return (
    <div className="min-h-screen pt-8 pb-20 px-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/" className="hover:opacity-70 transition-opacity"><img src="/sigil-symbol.svg" alt="Sigil" className="w-8 h-8" /></Link>
          <div>
            <h1 className="text-xl font-bold">Deploy Sigil Wallet</h1>
            <p className="text-sm text-white/30">Secure your AI agent in 5 minutes</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-10">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${s <= step ? "bg-[#00FF88]" : "bg-white/5"}`} />
            </div>
          ))}
        </div>

        {/* Step 1: Connect Wallet */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
              <p className="text-white/40">This is the <strong>Origin Wallet</strong> — the human. Hardware wallet recommended.</p>
            </div>

            {isConnected ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-[#00FF88]/30 bg-[#00FF88]/5 p-6">
                  <div className="flex items-center gap-3">
                    <span className="text-[#00FF88] text-xl">✅</span>
                    <div>
                      <div className="font-semibold">Connected</div>
                      <div className="font-mono text-sm text-white/40">{address}</div>
                    </div>
                  </div>
                </div>

                {needsSignIn && (
                  <div className="rounded-xl border border-[#F4A524]/30 bg-[#F4A524]/5 p-5">
                    <p className="text-sm text-white/60 mb-3">Sign a message to prove wallet ownership. Required for registration.</p>
                    <button
                      onClick={signIn}
                      disabled={isAuthenticating}
                      className="w-full py-2.5 bg-[#F4A524] hover:brightness-110 disabled:opacity-50 text-[#050505] rounded-xl font-medium transition-colors"
                    >
                      {isAuthenticating ? "Signing..." : "🔐 Sign In with Ethereum"}
                    </button>
                  </div>
                )}

                {isAuthenticated && (
                  <div className="flex items-center gap-2 text-sm text-[#00FF88]">
                    <span>✓</span> Authenticated — ready to deploy
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center">
                <p className="text-white/40 mb-4">Connect with MetaMask, WalletConnect, or any EVM wallet</p>
                <ConnectButton />
              </div>
            )}

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-white/50">
              💡 <strong className="text-white/70">What is an Origin Wallet?</strong> This is YOUR personal wallet (MetaMask, etc). It&apos;s the master key — only you control it. It can freeze, withdraw, and change settings on your Sigil Wallet. Keep it safe.
            </div>

            <button
              disabled={!isConnected || !isAuthenticated}
              onClick={() => setStep(2)}
              className="w-full py-3 bg-[#00FF88] hover:brightness-110 disabled:bg-gray-700 disabled:text-white/30 text-[#050505] rounded-xl font-medium transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 3: Choose Template */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Choose a Strategy</h2>
              <p className="text-white/40">Pick a template that matches your agent&apos;s behavior. You can customize later.</p>
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-white/50">
              💡 These limits control how much your AI agent can spend. <strong className="text-white/70">Max TX</strong> = maximum per transaction. <strong className="text-white/70">Daily Cap</strong> = total spending in 24 hours. <strong className="text-white/70">Guardian Threshold</strong> = transactions above this get extra AI scrutiny. You can change all of these later in the dashboard.
            </div>

            <div className="grid grid-cols-1 gap-3">
              {TEMPLATE_BASES.map(t => {
                const limits = getChainAwareLimits(t, selectedChain);
                const token = getNativeToken(selectedChain);
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`rounded-xl border p-4 text-left transition-all ${selectedTemplate === t.id ? t.selected : t.color}`}
                  >
                    <div className="flex items-start gap-4">
                      <span className="text-2xl">{t.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{t.name}</div>
                        <div className="text-sm text-white/40 mb-2">{t.desc}</div>
                        {t.id !== "custom" && (
                          <div className="flex gap-4 text-xs text-white/30">
                            <span>Max TX: {limits.maxTx} {token}</span>
                            <span>Daily: {limits.daily} {token}</span>
                            <span>Guardian: {limits.guardianThreshold} {token}</span>
                          </div>
                        )}
                        {TEMPLATE_BUNDLE_MAP[t.id] && (
                          <div className="mt-2 space-y-1">
                            {getTemplateBundles(t.id, selectedChain).map(b => (
                              <div key={b.id}>
                                <div className="flex gap-1 flex-wrap">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00FF88]/10 text-[#00FF88]/60 font-medium">
                                    {b.icon} {b.name}
                                  </span>
                                </div>
                                <div className="flex gap-1 flex-wrap mt-0.5">
                                  {b.targets.map(tgt => (
                                    <span key={tgt.address} className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-white/25 font-mono">
                                      {tgt.label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {isCustom && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
                <div className="text-sm font-medium text-white/60">Custom Limits <span className="text-white/30">({getNativeToken(selectedChain)})</span></div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Max per TX</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={customMaxTx}
                      onChange={e => setCustomMaxTx(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#050505] border border-white/10 text-white font-mono text-sm focus:border-[#00FF88]/50 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Daily cap</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={customDaily}
                      onChange={e => setCustomDaily(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#050505] border border-white/10 text-white font-mono text-sm focus:border-[#00FF88]/50 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 mb-1">Guardian threshold</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={customThreshold}
                      onChange={e => setCustomThreshold(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#050505] border border-white/10 text-white font-mono text-sm focus:border-[#00FF88]/50 focus:outline-none transition-colors"
                    />
                  </div>
                </div>
                <p className="text-xs text-white/25">Guardian threshold: transactions above this value require extra Guardian scrutiny. Set lower for tighter security.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 py-3 border border-white/10 text-white/40 rounded-xl font-medium transition-colors hover:border-white/20">← Back</button>
              <button disabled={!selectedTemplate || (isCustom && (!customMaxTx || !customDaily || !customThreshold))} onClick={() => setStep(4)} className="flex-1 py-3 bg-[#00FF88] hover:brightness-110 disabled:bg-gray-700 disabled:text-white/30 text-[#050505] rounded-xl font-medium transition-colors">Continue →</button>
            </div>
          </div>
        )}

        {/* Step 2: Choose Network */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Choose Network</h2>
              <p className="text-white/40">Which network will your agent operate on?</p>
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-white/50">
              💡 Your Sigil Wallet lives on <strong className="text-white/70">ONE chain</strong>. Pick the chain where your agent will operate. Most DeFi agents use Avalanche or Polygon. For prediction markets, choose Polygon.
            </div>

            <div className="grid grid-cols-1 gap-3">
              {CHAINS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedChain(c.id)}
                  className={`rounded-xl border p-5 text-left transition-all ${selectedChain === c.id ? "border-[#00FF88] bg-[#00FF88]/10 ring-2 ring-[#00FF88]/30" : "border-white/5 bg-white/[0.02] hover:border-white/10"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{c.icon}</span>
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      <div className="text-xs text-white/30 font-mono">Chain ID: {c.id}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {isMainnet(selectedChain) && (
              <div className="rounded-xl border border-[#F4A524]/30 bg-[#F4A524]/5 p-4">
                <div className="flex items-center gap-2 text-[#F4A524] font-semibold text-sm mb-1">⚠️ Mainnet Selected</div>
                <p className="text-xs text-[#F4A524]/70">This network uses real funds. Transactions are irreversible and gas fees apply. Make sure you understand the risks before deploying.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 py-3 border border-white/10 text-white/40 rounded-xl font-medium transition-colors hover:border-white/20">← Back</button>
              <button onClick={() => setStep(3)} className="flex-1 py-3 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-xl font-medium transition-colors">Continue →</button>
            </div>
          </div>
        )}

        {/* Step 4: Generate Agent Wallet */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Generate Agent Wallet</h2>
              <p className="text-white/40">This key will be used by your AI agent to sign transactions. <strong className="text-[#F4A524]">⚠️ Save the private key NOW — it is shown ONLY ONCE and cannot be recovered.</strong></p>
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-white/50">
              💡 <strong className="text-white/70">What is an Agent Wallet?</strong> This is a separate key generated for your AI agent. It can ONLY submit transactions for Guardian approval — it cannot withdraw funds, freeze, or change settings. Think of it as an employee badge, not a master key.
            </div>

            {!agentPrivateKey ? (
              <button
                onClick={generateKey}
                className="w-full py-4 rounded-xl border-2 border-dashed border-[#00FF88]/40 bg-[#00FF88]/5 hover:brightness-110/10 text-[#00FF88] font-medium transition-colors"
              >
                🔑 Generate Agent Wallet Pair
              </button>
            ) : (
              <div className="space-y-4">
                {/* Agent Address */}
                <div className="rounded-xl border border-[#00FF88]/30 bg-[#00FF88]/5 p-4">
                  <div className="text-xs text-white/40 mb-1">Agent Public Address</div>
                  <div className="font-mono text-sm text-[#00FF88] break-all">{agentAddress}</div>
                </div>

                {/* Private Key - WARNING */}
                <div className="rounded-xl border border-[#F4A524]/40 bg-[#F4A524]/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[#F4A524]">⚠️</span>
                    <span className="text-xs font-bold text-[#F4A524] uppercase">Private Key — Save This NOW</span>
                  </div>
                  <div className="font-mono text-xs text-white/60 break-all bg-[#050505]/50 rounded-lg p-3 mb-3">
                    {agentPrivateKey}
                  </div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(agentPrivateKey); setKeyCopied(true); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${keyCopied ? "bg-[#00FF88] text-white" : "bg-[#F4A524]/20 text-[#F4A524] hover:bg-[#F4A524]/30"}`}
                  >
                    {keyCopied ? "✓ Copied!" : "📋 Copy Private Key"}
                  </button>
                </div>

                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-white/50">
                  📌 <strong className="text-white/70">Where does this key go?</strong> Add it to your AI agent&apos;s local config file (e.g. <code className="text-white/60">.env</code>). The agent signs transactions locally — <strong className="text-white/70">this key is never sent to any server</strong>.
                </div>

                {/* Acknowledge */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keyAcknowledged}
                    onChange={e => setKeyAcknowledged(e.target.checked)}
                    className="mt-1 rounded border-gray-600 bg-white/5 text-[#00FF88] focus:ring-[#00FF88]"
                  />
                  <span className="text-sm text-white/40">I have saved the private key. I understand it will not be shown again.</span>
                </label>
              </div>
            )}

            {/* Deployment Summary */}
            {agentAddress && (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 space-y-3">
                <h3 className="font-semibold text-sm text-white/60">Deployment Summary</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-white/30">Origin Wallet:</span> <span className="font-mono text-xs">{address?.slice(0, 10)}...{address?.slice(-6)}</span></div>
                  <div><span className="text-white/30">Agent:</span> <span className="font-mono text-xs">{agentAddress.slice(0, 10)}...{agentAddress.slice(-6)}</span></div>
                  <div><span className="text-white/30">Chain:</span> {CHAINS.find(c => c.id === selectedChain)?.name}</div>
                  <div><span className="text-white/30">Strategy:</span> {template?.name}</div>
                  <div><span className="text-white/30">Max TX:</span> <span className="font-mono">{template?.maxTx} {getNativeToken(selectedChain)}</span></div>
                  <div><span className="text-white/30">Daily:</span> <span className="font-mono">{template?.daily} {getNativeToken(selectedChain)}</span></div>
                  <div><span className="text-white/30">Guardian:</span> <span className="font-mono text-xs">{GUARDIAN_ADDRESS.slice(0, 10)}...</span></div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="flex-1 py-3 border border-white/10 text-white/40 rounded-xl font-medium transition-colors hover:border-white/20">← Back</button>
              <button
                disabled={!agentAddress || !keyAcknowledged || !isAuthenticated}
                onClick={() => {
                  setAgentPrivateKey(""); setStep(5); handleDeploy();
                }}
                className="flex-1 py-3 bg-[#00FF88] hover:brightness-110 disabled:bg-gray-700 disabled:text-white/30 text-[#050505] rounded-xl font-medium transition-colors"
              >
                {!isAuthenticated ? "🔐 Sign in first" : "Deploy Wallet 🚀"}
              </button>

              {existingAccount && (
                <div className="rounded-xl border border-[#F4A524]/40 bg-[#F4A524]/5 p-4 mt-3">
                  <div className="flex items-center gap-2 text-[#F4A524] font-semibold text-sm mb-1">⚠️ Wallet Already Exists</div>
                  <p className="text-xs text-[#F4A524]/70 mb-2">
                    You already have a Sigil Wallet on this chain: <span className="font-mono">{existingAccount.slice(0, 14)}...{existingAccount.slice(-6)}</span>
                  </p>
                  <p className="text-xs text-white/40 mb-3">Free tier is limited to 1 Sigil Wallet per Origin Wallet. Go to your dashboard or switch to a different chain.</p>
                  <div className="flex gap-2">
                    <button onClick={() => router.push("/dashboard")} className="px-4 py-2 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-lg text-xs font-medium">
                      Go to Dashboard →
                    </button>
                    <button onClick={() => setExistingAccount(null)} className="px-4 py-2 border border-white/10 text-white/40 rounded-lg text-xs font-medium hover:border-white/20">
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Deploy */}
        {step === 5 && (
          <div className="space-y-6">
            {(writeError || deployError) && (() => {
              const rawError = writeError?.message || deployError || "";
              // Log full error for debugging
              // Deployment error occurred - rawError contains details
              return (
                <div className="rounded-xl border border-[#F04452]/30 bg-[#F04452]/5 p-4">
                  <div className="text-[#F04452] text-sm font-medium mb-1">Deployment Failed</div>
                  <div className="text-xs text-white/40">{decodeErrorMessage(rawError || undefined)}</div>
                  <details className="mt-2">
                    <summary className="text-xs text-white/20 cursor-pointer hover:text-white/40">Show raw error</summary>
                    <pre className="mt-1 text-[10px] text-white/20 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{rawError.slice(0, 1000)}</pre>
                  </details>
                  <button
                    onClick={() => { setDeployError(null); handleDeploy(); }}
                    className="mt-3 px-4 py-2 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-lg text-sm font-medium"
                  >
                    Retry Deploy
                  </button>
                </div>
              );
            })()}

            {isDeploying && !writeError && (
              <div className="text-center py-16">
                <img src="/sigil-loading.gif" alt="Loading" className="w-16 h-16 mx-auto mb-6" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <div className="animate-spin h-12 w-12 border-4 border-[#00FF88] border-t-transparent rounded-full mx-auto mb-6" />
                <h2 className="text-2xl font-bold mb-2">
                  {isWritePending ? "Confirm in Wallet..." : "Waiting for Confirmation..."}
                </h2>
                <p className="text-white/40">
                  {isWritePending
                    ? "Please confirm the transaction in your wallet"
                    : "Transaction submitted. Waiting for block confirmation..."}
                </p>
                {txHash && (
                  <div className="mt-4 font-mono text-xs text-white/30 break-all">
                    TX: {txHash}
                  </div>
                )}
              </div>
            )}

            {registering && (
              <div className="text-center py-8">
                <div className="animate-spin h-8 w-8 border-3 border-[#00FF88] border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-white/40">Registering with Guardian API...</p>
              </div>
            )}

            {applyingWhitelist && (
              <div className="text-center py-8">
                <div className="animate-spin h-8 w-8 border-3 border-[#00FF88] border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-white/40">Applying whitelist bundle — confirm each transaction in your wallet...</p>
              </div>
            )}

            {whitelistError && (
              <div className="rounded-xl border border-[#F4A524]/30 bg-[#F4A524]/5 p-4 text-sm">
                <span className="text-[#F4A524]">⚠️ Whitelist partially applied:</span>{" "}
                <span className="text-white/40">{whitelistError}</span>
                <p className="text-xs text-white/30 mt-1">You can apply bundles later from the Policy page.</p>
              </div>
            )}

            {effectiveConfirmed && deployedAddress && !registering && (
              <div className="py-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-full bg-[#00FF88]/10 flex items-center justify-center">
                    <span className="text-[#00FF88] text-lg">✓</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">Wallet Deployed</h2>
                    <p className="text-white/30 text-sm">On-chain and Guardian-registered</p>
                  </div>
                </div>

                {/* Deployment details */}
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 mb-6 space-y-2 text-sm">
                  <div className="flex justify-between items-start">
                    <span className="text-white/30 shrink-0">Sigil Wallet</span>
                    <span className="font-mono text-[#00FF88] text-xs break-all text-right ml-4">{deployedAddress}</span>
                  </div>
                  <div className="flex justify-between items-start">
                    <span className="text-white/30 shrink-0">TX</span>
                    <span className="font-mono text-white/40 text-xs break-all text-right ml-4">{txHash}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/30">Chain</span>
                    <span>{CHAINS.find(c => c.id === selectedChain)?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/30">Strategy</span>
                    <span>{template?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/30">Guardian</span>
                    <span className="text-[#00FF88]">● Protected</span>
                  </div>
                </div>

                {/* Setup checklist */}
                <div className="space-y-1 mb-6">
                  <div className="text-xs text-white/20 uppercase tracking-wider mb-3">Setup Checklist</div>

                  {/* Done items */}
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#00FF88]/5">
                    <span className="text-[#00FF88] text-sm">✓</span>
                    <span className="text-sm text-white/50">Sigil Wallet deployed on-chain</span>
                  </div>
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#00FF88]/5">
                    <span className="text-[#00FF88] text-sm">✓</span>
                    <span className="text-sm text-white/50">Guardian registered &amp; active</span>
                  </div>
                  {whitelistApplied && (
                    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#00FF88]/5">
                      <span className="text-[#00FF88] text-sm">✓</span>
                      <span className="text-sm text-white/50">Whitelist bundle applied</span>
                    </div>
                  )}
                  {whitelistError && (
                    <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#F4A524]/5">
                      <span className="text-[#F4A524] text-sm">⚠</span>
                      <span className="text-sm text-white/50">Whitelist partially applied — finish in Policies</span>
                    </div>
                  )}

                  {/* Pending items */}
                  <div className="mt-3 space-y-3">
                    {/* Step: Fund Sigil Wallet */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="h-6 w-6 rounded-full border border-white/20 flex items-center justify-center text-xs text-white/30">1</span>
                        <span className="text-sm font-medium">Fund your Sigil Wallet</span>
                      </div>
                      <p className="text-xs text-white/30 ml-9 mb-2">
                        This is your on-chain smart account — all agent transactions execute from this address.
                        Send {getNativeToken(selectedChain)} and any tokens your agent will trade to:
                      </p>
                      <div className="ml-9 mb-2 rounded-lg bg-[#050505] border border-white/5 p-3 flex items-center justify-between gap-2">
                        <code className="text-xs text-[#00FF88] break-all">{deployedAddress}</code>
                        <button
                          onClick={() => navigator.clipboard.writeText(deployedAddress)}
                          className="shrink-0 px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 rounded text-white/40 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Step 2: Fund Agent Wallet */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="h-6 w-6 rounded-full border border-white/20 flex items-center justify-center text-xs text-white/30">2</span>
                        <span className="text-sm font-medium">Fund Agent Wallet (gas)</span>
                      </div>
                      <p className="text-xs text-white/30 ml-9 mb-2">
                        Your agent&apos;s EOA wallet needs a small amount of {getNativeToken(selectedChain)} to pay gas when submitting UserOps. A few dollars worth is enough to start.
                      </p>
                      <div className="ml-9 mb-2 rounded-lg bg-[#050505] border border-white/5 p-3 flex items-center justify-between gap-2">
                        <code className="text-xs text-white/50 break-all">{agentAddress || "Agent address from Step 4"}</code>
                        {agentAddress && (
                          <button
                            onClick={() => navigator.clipboard.writeText(agentAddress)}
                            className="shrink-0 px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 rounded text-white/40 transition-colors"
                          >
                            Copy
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-white/20 ml-9">
                        Without gas, your agent cannot submit transactions even if the Sigil Wallet is funded.
                      </p>
                    </div>

                    {/* Step 3: Generate API Key */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="h-6 w-6 rounded-full border border-white/20 flex items-center justify-center text-xs text-white/30">3</span>
                        <span className="text-sm font-medium">Generate an API Key</span>
                      </div>
                      <p className="text-xs text-white/30 ml-9 mb-2">
                        Your agent needs an API key to authenticate with the Guardian and submit transactions for evaluation.
                      </p>
                      <div className="ml-9">
                        <button
                          onClick={() => router.push("/dashboard/agent-access")}
                          className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-lg text-white/50 transition-colors"
                        >
                          Go to Agent Access →
                        </button>
                      </div>
                    </div>

                    {/* Step 4: Share Private Key — THE CRITICAL STEP */}
                    <div className="rounded-xl border border-[#F4A524]/30 bg-[#F4A524]/5 p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="h-6 w-6 rounded-full border border-[#F4A524]/40 bg-[#F4A524]/10 flex items-center justify-center text-xs text-[#F4A524] font-bold">4</span>
                        <span className="text-sm font-medium text-[#F4A524]">Share Agent Private Key with Your AI</span>
                      </div>
                      <p className="text-xs text-white/40 ml-9 mb-3">
                        This is the most important step. Your AI agent needs the <strong className="text-white/60">private key from Step 4</strong> to sign transactions locally.
                        Without it, the agent can authenticate but <strong className="text-white/60">cannot execute any trades</strong>.
                      </p>
                      <div className="ml-9 rounded-lg bg-[#050505] border border-[#F4A524]/20 p-3 space-y-2">
                        <p className="text-[10px] text-[#F4A524]/80 font-medium">Add these to your agent&apos;s environment / config:</p>
                        <div className="font-mono text-[10px] text-white/40 space-y-0.5">
                          <div><span className="text-white/20"># Agent signs transactions locally with this key</span></div>
                          <div>SIGIL_AGENT_PRIVATE_KEY=<span className="text-[#F4A524]">0x_your_agent_private_key_from_step_4</span></div>
                          <div><span className="text-white/20"># API key for Guardian authentication</span></div>
                          <div>SIGIL_API_KEY=<span className="text-[#F4A524]">sgil_your_key_from_step_3</span></div>
                          <div><span className="text-white/20"># Your Sigil smart wallet address</span></div>
                          <div>SIGIL_WALLET_ADDRESS={deployedAddress}</div>
                          <div><span className="text-white/20"># Chain</span></div>
                          <div>SIGIL_CHAIN_ID={selectedChain}</div>
                          <div><span className="text-white/20"># API endpoint</span></div>
                          <div>SIGIL_API_URL=https://api.sigil.codes</div>
                        </div>
                      </div>
                      <div className="ml-9 mt-3 rounded-lg bg-white/[0.02] border border-white/5 p-3">
                        <p className="text-[10px] text-white/30">
                          <strong className="text-white/50">🔐 Security:</strong> The agent key can ONLY submit transactions for Guardian approval — it cannot withdraw funds, change policies, or freeze the wallet.
                          Even if the key is compromised, the Guardian&apos;s 3-layer evaluation pipeline (rules → simulation → AI) protects your funds.
                          You can revoke the agent key instantly from the dashboard.
                        </p>
                      </div>
                    </div>

                    {/* Step 5: Review policy */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="h-6 w-6 rounded-full border border-white/20 flex items-center justify-center text-xs text-white/30">5</span>
                        <span className="text-sm font-medium">Review Policies &amp; Whitelists</span>
                      </div>
                      <p className="text-xs text-white/30 ml-9 mb-2">
                        Check spending limits, whitelisted contracts, and allowed functions. Add or remove targets as needed.
                        Your agent can only interact with contracts you explicitly allow.
                      </p>
                      <div className="ml-9">
                        <button
                          onClick={() => router.push("/dashboard/policy")}
                          className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-lg text-white/50 transition-colors"
                        >
                          Go to Policies →
                        </button>
                      </div>
                    </div>

                    {/* Step 6: First transaction */}
                    <div className="rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/5 p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="h-6 w-6 rounded-full border border-[#00FF88]/30 bg-[#00FF88]/10 flex items-center justify-center text-xs text-[#00FF88] font-bold">6</span>
                        <span className="text-sm font-medium text-[#00FF88]">Start Trading</span>
                      </div>
                      <p className="text-xs text-white/30 ml-9 mb-2">
                        Your agent is ready. Tell it to submit a transaction — the Guardian will evaluate it through all 3 layers (Rules → Simulation → AI Risk Scoring) and co-sign if approved.
                        You can also test manually using the Evaluate tab.
                      </p>
                      <div className="ml-9">
                        <button
                          onClick={() => router.push("/dashboard/evaluate")}
                          className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-lg text-white/50 transition-colors"
                        >
                          Go to Evaluate →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="flex-1 py-3 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-xl font-medium transition-colors"
                  >
                    Go to Dashboard
                  </button>
                  <button
                    onClick={() => router.push("/docs")}
                    className="py-3 px-6 border border-white/10 text-white/40 rounded-xl font-medium transition-colors hover:border-white/20"
                  >
                    Read Docs
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
