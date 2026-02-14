"use client";

import { useState, useEffect, useCallback } from "react";
import { useChainId, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { useWallet } from "@/lib/wallet";
import { useAccount } from "@/lib/hooks";
import { mockAccount } from "@/lib/mock";
import { api, DEMO_ADDRESS } from "@/lib/api";
import { getStoredAccount, SIGIL_ACCOUNT_ABI, getNativeToken } from "@/lib/contracts";
import Card from "@/components/Card";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1";

interface BundleContract { address: string; label: string; }
interface Bundle { id: string; name: string; icon: string; description: string; contracts: BundleContract[]; }

export default function PolicyPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useWallet();
  const chainId = useChainId();
  const accountAddress = mounted ? getStoredAccount(chainId) : null;
  const hasAccount = !!accountAddress;

  const { data: account, error: accountError, isLoading, mutate, isDemoMode: apiDemoMode } = useAccount(address);
  const isDemo = !isConnected || !hasAccount;

  // Read policy from contract
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

  const { data: guardianThreshold } = useReadContract({
    address: accountAddress as `0x${string}`,
    abi: SIGIL_ACCOUNT_ABI,
    functionName: "guardianThreshold",
    query: { enabled: !!accountAddress },
  });

  const { data: agentKeyAddr } = useReadContract({
    address: accountAddress as `0x${string}`,
    abi: SIGIL_ACCOUNT_ABI,
    functionName: "agentKey",
    query: { enabled: !!accountAddress },
  });

  const { data: ownerAddr } = useReadContract({
    address: accountAddress as `0x${string}`,
    abi: SIGIL_ACCOUNT_ABI,
    functionName: "owner",
    query: { enabled: !!accountAddress },
  });

  // Use contract data if available, fall back to API/mock
  const policy = isDemo
    ? mockAccount.policy
    : account?.policy || null;

  const [maxPerTx, setMaxPerTx] = useState("");
  const [dailyLimitVal, setDailyLimitVal] = useState("");
  const [weeklyLimit, setWeeklyLimit] = useState("");
  const [guardianThresholdVal, setGuardianThresholdVal] = useState("");
  const [ownerThreshold, setOwnerThreshold] = useState("");
  const [allowedTargets, setAllowedTargets] = useState<string[]>([]);
  const [allowedFunctions, setAllowedFunctions] = useState<string[]>([]);
  const [blockedAddresses, setBlockedAddresses] = useState<string[]>([]);
  const [newTarget, setNewTarget] = useState("");
  const [newFunction, setNewFunction] = useState("");
  const [newBlocked, setNewBlocked] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Bundle state
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [enabledBundles, setEnabledBundles] = useState<Set<string>>(new Set());

  // Fetch available bundles
  useEffect(() => {
    if (!chainId) return;
    fetch(`${API_BASE}/bundles?chainId=${chainId}`)
      .then(r => r.json())
      .then(d => setBundles(d.bundles || []))
      .catch(() => {});
  }, [chainId]);

  // Detect which bundles are already enabled based on allowedTargets
  useEffect(() => {
    if (!allowedTargets.length || !bundles.length) return;
    const targetsLower = new Set(allowedTargets.map(t => t.toLowerCase()));
    const enabled = new Set<string>();
    for (const bundle of bundles) {
      const allIncluded = bundle.contracts.every(c => targetsLower.has(c.address.toLowerCase()));
      if (allIncluded && bundle.contracts.length > 0) enabled.add(bundle.id);
    }
    setEnabledBundles(enabled);
  }, [allowedTargets, bundles]);

  const toggleBundle = useCallback((bundleId: string) => {
    const bundle = bundles.find(b => b.id === bundleId);
    if (!bundle) return;
    const bundleAddresses = bundle.contracts.map(c => c.address);

    setEnabledBundles(prev => {
      const next = new Set(prev);
      if (next.has(bundleId)) {
        next.delete(bundleId);
        // Remove bundle addresses from allowed targets
        setAllowedTargets(prev => prev.filter(t => !bundleAddresses.some(a => a.toLowerCase() === t.toLowerCase())));
      } else {
        next.add(bundleId);
        // Add bundle addresses to allowed targets (dedup)
        setAllowedTargets(prev => {
          const existing = new Set(prev.map(t => t.toLowerCase()));
          const toAdd = bundleAddresses.filter(a => !existing.has(a.toLowerCase()));
          return [...prev, ...toAdd];
        });
      }
      return next;
    });
  }, [bundles]);

  // Sync from contract data first, then API
  useEffect(() => {
    if (maxTxValue) setMaxPerTx(parseFloat(formatEther(maxTxValue as bigint)).toString());
    if (dailyLimit) setDailyLimitVal(parseFloat(formatEther(dailyLimit as bigint)).toString());
    if (guardianThreshold) setGuardianThresholdVal(parseFloat(formatEther(guardianThreshold as bigint)).toString());
  }, [maxTxValue, dailyLimit, guardianThreshold]);

  useEffect(() => {
    if (policy && !maxTxValue) {
      setMaxPerTx(policy.maxPerTx);
      setDailyLimitVal(policy.dailyLimit);
      setWeeklyLimit(policy.weeklyLimit);
      setGuardianThresholdVal(policy.guardianThreshold);
      setOwnerThreshold(policy.ownerThreshold);
      setAllowedTargets(policy.allowedTargets);
      setAllowedFunctions(policy.allowedFunctions);
      setBlockedAddresses(policy.blockedAddresses);
    }
  }, [policy, maxTxValue]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.updatePolicy(address || DEMO_ADDRESS, {
        maxPerTx: maxPerTx, dailyLimit: dailyLimitVal, weeklyLimit, guardianThreshold: guardianThresholdVal, ownerThreshold,
        allowedTargets, allowedFunctions, blockedAddresses,
      });
      mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(`Failed to save: ${err instanceof Error ? err.message : 'API unreachable'}`);
    }
    setSaving(false);
  }

  function ListEditor({ items, setItems, newVal, setNewVal, placeholder }: {
    items: string[]; setItems: (v: string[]) => void;
    newVal: string; setNewVal: (v: string) => void; placeholder: string;
  }) {
    return (
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-[#050505] px-3 py-1.5 rounded font-mono">{item}</code>
            <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-[#F04452] hover:text-[#F04452] text-xs px-2">Remove</button>
          </div>
        ))}
        <div className="flex gap-2">
          <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder={placeholder}
            className="flex-1 bg-[#050505] border border-white/5 rounded px-3 py-1.5 text-xs font-mono focus:border-[#00FF88] outline-none" />
          <button onClick={() => { if (newVal.trim()) { setItems([...items, newVal.trim()]); setNewVal(""); } }}
            className="px-3 py-1.5 bg-[#00FF88] hover:brightness-110 text-[#050505] text-xs rounded">Add</button>
        </div>
      </div>
    );
  }

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Policy Editor</h1>
        <button onClick={handleSave} disabled={saving || isDemo}
          className="px-4 py-2 bg-[#00FF88] hover:brightness-110 text-[#050505] rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Policy"}
        </button>
      </div>

      {isDemo && (
        <div className="p-3 bg-[#00FF88]/10 border border-[#00FF88]/20 rounded-lg text-sm text-[#00FF88]">
          📋 Demo mode — showing sample policy. Connect wallet & deploy to see real on-chain data.
        </div>
      )}

      {!isDemo && accountAddress && (
        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg text-sm space-y-1">
          <div className="text-xs text-white/40">On-chain policy for <span className="font-mono">{accountAddress.slice(0, 10)}...{accountAddress.slice(-6)}</span></div>
          {ownerAddr && <div className="text-xs"><span className="text-white/40">Owner:</span> <span className="font-mono">{(ownerAddr as string).slice(0, 10)}...</span></div>}
          {agentKeyAddr && <div className="text-xs"><span className="text-white/40">Agent Key:</span> <span className="font-mono">{(agentKeyAddr as string).slice(0, 10)}...</span></div>}
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-[#F04452]/10 border border-[#F04452]/30 rounded-lg text-sm text-[#F04452]">⚠ {saveError}</div>
      )}

      {/* Spending Limits */}
      <Card title="Spending Limits (On-Chain)">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: `Per Transaction (${getNativeToken(chainId)})`, value: maxPerTx, set: setMaxPerTx },
            { label: `Daily Limit (${getNativeToken(chainId)})`, value: dailyLimitVal, set: setDailyLimitVal },
            { label: `Weekly Limit (${getNativeToken(chainId)})`, value: weeklyLimit, set: setWeeklyLimit },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-white/40 block mb-1">{f.label}</label>
              <input type="text" value={f.value} onChange={e => f.set(e.target.value)} disabled={isDemo}
                className="w-full bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-sm font-mono focus:border-[#00FF88] outline-none disabled:opacity-50" />
            </div>
          ))}
        </div>
      </Card>

      {/* Thresholds */}
      <Card title="Signature Thresholds (On-Chain)">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-white/40 block mb-1">Guardian Co-sign Threshold ({getNativeToken(chainId)})</label>
            <input type="text" value={guardianThresholdVal} onChange={e => setGuardianThresholdVal(e.target.value)} disabled={isDemo}
              className="w-full bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-sm font-mono focus:border-[#00FF88] outline-none disabled:opacity-50" />
            <p className="text-xs text-white/40 mt-1">Transactions above this require guardian co-signature</p>
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Owner Override Threshold ({getNativeToken(chainId)})</label>
            <input type="text" value={ownerThreshold} onChange={e => setOwnerThreshold(e.target.value)} disabled={isDemo}
              className="w-full bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-sm font-mono focus:border-[#00FF88] outline-none disabled:opacity-50" />
            <p className="text-xs text-white/40 mt-1">Transactions above this require owner signature</p>
          </div>
        </div>
      </Card>

      {/* DeFi Bundles */}
      {bundles.length > 0 && (
        <Card title="DeFi Whitelist Bundles">
          <p className="text-xs text-white/40 mb-4">Enable pre-verified protocol bundles to allow your AI agent to interact with popular DeFi protocols. Each bundle adds verified contract addresses to your whitelist.</p>
          <div className="grid grid-cols-2 gap-3">
            {bundles.map(bundle => {
              const isEnabled = enabledBundles.has(bundle.id);
              return (
                <button
                  key={bundle.id}
                  onClick={() => !isDemo && toggleBundle(bundle.id)}
                  disabled={isDemo}
                  className={`flex items-start gap-3 p-4 rounded-xl border transition-all text-left ${
                    isEnabled
                      ? "border-[#00FF88]/50 bg-[#00FF88]/5"
                      : "border-white/5 bg-[#050505] hover:border-[#00FF88]/30"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span className="text-2xl">{bundle.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{bundle.name}</span>
                      {isEnabled && <span className="text-xs px-1.5 py-0.5 rounded bg-[#00FF88]/20 text-[#00FF88]">Enabled</span>}
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{bundle.description}</p>
                    <p className="text-xs text-white/40 mt-1 font-mono">{bundle.contracts.length} contract{bundle.contracts.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                    isEnabled ? "border-[#00FF88] bg-[#00FF88]" : "border-white/5"
                  }`}>
                    {isEnabled && <span className="text-white text-xs">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
          {enabledBundles.size > 0 && (
            <div className="mt-3 text-xs text-white/40">
              {enabledBundles.size} bundle{enabledBundles.size !== 1 ? 's' : ''} enabled — {allowedTargets.length} total whitelisted addresses. Click &quot;Save Policy&quot; to apply.
            </div>
          )}
        </Card>
      )}

      {/* Lists */}
      <Card title="Allowed Targets">
        <ListEditor items={allowedTargets} setItems={setAllowedTargets} newVal={newTarget} setNewVal={setNewTarget} placeholder="0x..." />
      </Card>

      <Card title="Allowed Functions">
        <ListEditor items={allowedFunctions} setItems={setAllowedFunctions} newVal={newFunction} setNewVal={setNewFunction} placeholder="transfer(address,uint256)" />
      </Card>

      <Card title="Blocked Addresses">
        <ListEditor items={blockedAddresses} setItems={setBlockedAddresses} newVal={newBlocked} setNewVal={setNewBlocked} placeholder="0x..." />
      </Card>
    </div>
  );
}
