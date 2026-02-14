"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount as useWagmiAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, usePublicClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FACTORY_ABI, FACTORY_ADDRESSES, GUARDIAN_ADDRESS, isMainnet, setStoredAccount, getNativeToken } from "@/lib/contracts";
import { api } from "@/lib/api";
import { decodeErrorMessage } from "@/lib/errors";
import { useWallet } from "@/lib/wallet";

// Chain-aware limit multipliers: native token amounts differ per chain
// Base values are in "units" — multiplied by chain factor to get native token amounts
const CHAIN_MULTIPLIERS: Record<number, number> = {
  43114: 1,      // AVAX ~$9 — base unit
  8453: 0.003,   // ETH ~$3000 — 0.003 ETH ≈ $9
  42161: 0.003,  // ETH ~$3000
  16661: 10,     // A0GI ~$0.90 — 10 A0GI ≈ $9
  43113: 1,      // Fuji testnet — same as AVAX
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
];

const CHAINS = [
  { id: 43114, name: "Avalanche C-Chain", icon: "🔺", mainnet: true },
  { id: 8453, name: "Base", icon: "🔵", mainnet: true },
  { id: 42161, name: "Arbitrum One", icon: "🔷", mainnet: true },
  { id: 16661, name: "0G Mainnet", icon: "⚡", mainnet: true },
  { id: 43113, name: "Avalanche Fuji (Testnet)", icon: "🔺", mainnet: false },
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
  const [selectedChain, setSelectedChain] = useState<number>(43114);
  const [agentPrivateKey, setAgentPrivateKey] = useState("");
  const [agentAddress, setAgentAddress] = useState("");
  const [keyCopied, setKeyCopied] = useState(false);
  const [keyAcknowledged, setKeyAcknowledged] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedAddress, setDeployedAddress] = useState("");
  const [registering, setRegistering] = useState(false);
  const [existingAccount, setExistingAccount] = useState<string | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  const publicClient = usePublicClient();
  const { writeContract, data: txHash, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });
  const [manualReceipt, setManualReceipt] = useState<typeof receipt | null>(null);
  const effectiveReceipt = receipt || manualReceipt;
  const effectiveConfirmed = isConfirmed || !!manualReceipt;

  const templateBase = TEMPLATE_BASES.find(t => t.id === selectedTemplate);
  const chainLimits = templateBase ? getChainAwareLimits(templateBase, selectedChain) : null;
  // Compose a "template" object with chain-aware values for backward compat
  const template = templateBase && chainLimits ? { ...templateBase, ...chainLimits } : null;

  // Check for existing account on selected chain
  const checkExistingAccount = useCallback(async () => {
    if (!address || !publicClient) return false;
    setCheckingExisting(true);
    try {
      const factoryAddress = FACTORY_ADDRESSES[selectedChain];
      if (!factoryAddress) return false;

      const FACTORY_DEPLOY_BLOCK: Record<number, bigint> = { 43114: BigInt(77869160), 43113: BigInt(40000000) };
      const startBlock = FACTORY_DEPLOY_BLOCK[selectedChain] || BigInt(0);
      const currentBlock = await publicClient.getBlockNumber();
      const chunkSize = BigInt(2000);

      for (let from = startBlock; from <= currentBlock; from += chunkSize) {
        let to = from + chunkSize - BigInt(1);
        if (to > currentBlock) to = currentBlock;
        try {
          const { parseAbiItem } = await import("viem");
          const logs = await publicClient.getLogs({
            address: factoryAddress as `0x${string}`,
            event: parseAbiItem("event AccountCreated(address indexed account, address indexed owner, address indexed agentKey, address guardianKey)"),
            args: { owner: address as `0x${string}` },
            fromBlock: from,
            toBlock: to,
          });
          if (logs.length > 0) {
            const existing = logs[0].args.account;
            if (existing) {
              setExistingAccount(existing);
              setCheckingExisting(false);
              return true;
            }
          }
        } catch { /* chunk failed */ }
      }
    } catch { /* scan failed */ }
    setCheckingExisting(false);
    return false;
  }, [address, selectedChain, publicClient]);

  // Generate agent key
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

    // Switch chain if needed
    if (currentChainId !== selectedChain) {
      switchChain({ chainId: selectedChain });
      return;
    }

    const salt = BigInt(Date.now());

    // Read deploy fee from factory, then send tx
    (async () => {
      try {
        const fee = await publicClient!.readContract({
          address: factoryAddress,
          abi: FACTORY_ABI,
          functionName: "deployFee",
        }) as bigint;

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
      } catch (err: unknown) {
        setDeployError(`Failed to read deploy fee: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  }, [address, template, agentAddress, selectedChain, currentChainId, switchChain, writeContract]);

  // Fallback: if wagmi's receipt hook doesn't resolve in 10s, poll manually
  useEffect(() => {
    if (!txHash || isConfirmed || manualReceipt || !publicClient) return;

    let cancelled = false;
    const pollInterval = setInterval(async () => {
      if (cancelled) return;
      try {
        const r = await publicClient.getTransactionReceipt({ hash: txHash });
        if (r && !cancelled) {
          setManualReceipt(r as typeof receipt);
          clearInterval(pollInterval);
        }
      } catch {
        // tx not yet mined or hash not found — keep polling
      }
    }, 3000);

    // Stop after 2 minutes
    const timeout = setTimeout(() => {
      cancelled = true;
      clearInterval(pollInterval);
    }, 120000);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [txHash, isConfirmed, manualReceipt, publicClient]);

  // After tx confirmed, extract deployed address and register
  useEffect(() => {
    if (!effectiveConfirmed || !effectiveReceipt || deployedAddress) return;

    // The createAccount function returns the address — extract from logs
    // The first log topic is usually the event, and the deployed address is in the event data
    // For CREATE2, we can also read from the transaction receipt logs
    const logs = effectiveReceipt.logs;
    let accountAddr = "";

    // Look for the AccountCreated event or similar
    for (const log of logs) {
      // The factory emits an event with the new account address
      // Typically the address is in topic[1] or data
      if (log.topics.length >= 2) {
        // Account address is usually in the second topic (padded to 32 bytes)
        const raw = log.topics[1];
        if (raw) {
          accountAddr = "0x" + raw.slice(26);
          break;
        }
      }
    }

    // Fallback: if contractAddress is set (unlikely for factory pattern)
    if (!accountAddr && effectiveReceipt.contractAddress) {
      accountAddr = effectiveReceipt.contractAddress;
    }

    // Fallback: use getAddress to compute it (we'd need to call the contract)
    // For now, if we can't find it in logs, show the tx hash
    if (!accountAddr) {
      // Try to find any address-like data in the first log
      if (logs.length > 0 && logs[0].data && logs[0].data.length >= 66) {
        accountAddr = "0x" + logs[0].data.slice(26, 66);
      }
    }

    if (accountAddr) {
      setDeployedAddress(accountAddr);
      setStoredAccount(selectedChain, accountAddr);

      // Register with API
      setRegistering(true);
      api.createAccount({
        address: accountAddr,
        agentKey: agentAddress,
        guardianKey: GUARDIAN_ADDRESS,
        chainId: selectedChain,
        factoryTx: txHash,
      }).catch(() => {
        // Non-fatal: account is deployed on-chain even if API registration fails
        console.warn("API registration failed — account is still deployed on-chain");
      }).finally(() => setRegistering(false));
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
            <h1 className="text-xl font-bold">Deploy Sigil Account</h1>
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
              <p className="text-white/40">This is the <strong>owner</strong> wallet — the human. Hardware wallet recommended.</p>
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
                    <p className="text-sm text-white/60 mb-3">Sign a message to prove wallet ownership. Required for account registration.</p>
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

            <button
              disabled={!isConnected || !isAuthenticated}
              onClick={() => setStep(2)}
              className="w-full py-3 bg-[#00FF88] hover:brightness-110 disabled:bg-gray-700 disabled:text-white/30 text-[#050505] rounded-xl font-medium transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2: Choose Template */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Choose a Strategy</h2>
              <p className="text-white/40">Pick a template that matches your agent&apos;s behavior. You can customize later.</p>
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
                        <div className="flex gap-4 text-xs text-white/30">
                          <span>Max TX: {limits.maxTx} {token}</span>
                          <span>Daily: {limits.daily} {token}</span>
                          <span>Guardian: {limits.guardianThreshold} {token}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 py-3 border border-white/10 text-white/40 rounded-xl font-medium transition-colors hover:border-white/20">← Back</button>
              <button disabled={!selectedTemplate} onClick={() => setStep(3)} className="flex-1 py-3 bg-[#00FF88] hover:brightness-110 disabled:bg-gray-700 disabled:text-white/30 text-[#050505] rounded-xl font-medium transition-colors">Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3: Choose Chain */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Choose Network</h2>
              <p className="text-white/40">Which network will your agent operate on?</p>
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
              <button onClick={() => setStep(2)} className="flex-1 py-3 border border-white/10 text-white/40 rounded-xl font-medium transition-colors hover:border-white/20">← Back</button>
              <button onClick={() => setStep(4)} className="flex-1 py-3 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-xl font-medium transition-colors">Continue →</button>
            </div>
          </div>
        )}

        {/* Step 4: Generate Agent Key */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Generate Agent Key</h2>
              <p className="text-white/40">This key will be used by your AI agent to sign transactions. <strong className="text-[#F4A524]">⚠️ Save the private key NOW — it is shown ONLY ONCE and cannot be recovered.</strong></p>
            </div>

            {!agentPrivateKey ? (
              <button
                onClick={generateKey}
                className="w-full py-4 rounded-xl border-2 border-dashed border-[#00FF88]/40 bg-[#00FF88]/5 hover:brightness-110/10 text-[#00FF88] font-medium transition-colors"
              >
                🔑 Generate Agent Key Pair
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
                  <div><span className="text-white/30">Owner:</span> <span className="font-mono text-xs">{address?.slice(0, 10)}...{address?.slice(-6)}</span></div>
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
                disabled={!agentAddress || !keyAcknowledged || checkingExisting}
                onClick={async () => {
                  const hasExisting = await checkExistingAccount();
                  if (hasExisting) return; // Will show warning via existingAccount state
                  setAgentPrivateKey(""); setStep(5); handleDeploy();
                }}
                className="flex-1 py-3 bg-[#00FF88] hover:brightness-110 disabled:bg-gray-700 disabled:text-white/30 text-[#050505] rounded-xl font-medium transition-colors"
              >
                {checkingExisting ? "Checking..." : "Deploy Account 🚀"}
              </button>

              {existingAccount && (
                <div className="rounded-xl border border-[#F4A524]/40 bg-[#F4A524]/5 p-4 mt-3">
                  <div className="flex items-center gap-2 text-[#F4A524] font-semibold text-sm mb-1">⚠️ Account Already Exists</div>
                  <p className="text-xs text-[#F4A524]/70 mb-2">
                    You already have a Sigil account on this chain: <span className="font-mono">{existingAccount.slice(0, 14)}...{existingAccount.slice(-6)}</span>
                  </p>
                  <p className="text-xs text-white/40 mb-3">Free tier is limited to 1 account per wallet. Go to your dashboard or switch to a different chain.</p>
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
            {(writeError || deployError) && (
              <div className="rounded-xl border border-[#F04452]/30 bg-[#F04452]/5 p-4">
                <div className="text-[#F04452] text-sm font-medium mb-1">Deployment Failed</div>
                <div className="text-xs text-white/40">{decodeErrorMessage(writeError?.message || deployError || undefined)}</div>
                <button
                  onClick={() => { setDeployError(null); handleDeploy(); }}
                  className="mt-3 px-4 py-2 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-lg text-sm font-medium"
                >
                  Retry Deploy
                </button>
              </div>
            )}

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

            {effectiveConfirmed && deployedAddress && !registering && (
              <div className="text-center py-8">
                <div className="text-6xl mb-6">🎉</div>
                <h2 className="text-2xl font-bold mb-2">Account Deployed!</h2>
                <p className="text-white/40 mb-6">Your AI agent is now protected by Sigil Protocol.</p>

                <div className="rounded-xl border border-[#00FF88]/30 bg-[#00FF88]/5 p-5 mb-6 text-left">
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-white/30">Account Address:</span>
                      <div className="font-mono text-[#00FF88] text-xs mt-1 break-all">{deployedAddress}</div>
                    </div>
                    <div>
                      <span className="text-white/30">TX Hash:</span>
                      <div className="font-mono text-white/40 text-xs mt-1 break-all">{txHash}</div>
                    </div>
                    <div><span className="text-white/30">Chain:</span> {CHAINS.find(c => c.id === selectedChain)?.name}</div>
                    <div><span className="text-white/30">Strategy:</span> {template?.name} {template?.emoji}</div>
                    <div><span className="text-white/30">Guardian:</span> <span className="text-[#00FF88]">● Active</span></div>
                  </div>
                </div>

                <div className="space-y-3 text-left mb-8">
                  <h3 className="font-semibold">Next Steps:</h3>
                  <div className="space-y-2 text-sm text-white/40">
                    <div className="flex items-center gap-2"><span className="text-[#00FF88]">✓</span> Account deployed on-chain</div>
                    <div className="flex items-center gap-2"><span className="text-[#00FF88]">✓</span> Guardian registered</div>
                    <div className="flex items-center gap-2"><span className="text-yellow-400">→</span> Fund your account with {getNativeToken(selectedChain)}</div>
                    <div className="flex items-center gap-2"><span className="text-yellow-400">→</span> Configure your agent with an API key</div>
                  </div>
                </div>

                <button
                  onClick={() => router.push("/dashboard")}
                  className="inline-flex px-8 py-3 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-xl font-medium transition-colors"
                >
                  Go to Dashboard →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
