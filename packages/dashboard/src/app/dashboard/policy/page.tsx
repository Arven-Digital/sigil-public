"use client";

import { useState, useEffect, useCallback } from "react";
import { useReadContract } from "wagmi";
import { formatEther, parseEther, encodeFunctionData, toFunctionSelector } from "viem";
import { useWallet } from "@/lib/wallet";
import { getStoredAccount, SIGIL_ACCOUNT_ABI, getNativeToken, getRpcUrl, getKnownERC1271Callers } from "@/lib/contracts";
import { api } from "@/lib/api";
import { useViewChain } from "@/lib/view-chain";
import Card from "@/components/Card";

import { getBundlesForChain, type PolicyBundle } from "@/lib/bundles";

export default function PolicyPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useWallet();
  const { viewChainId: chainId } = useViewChain();
  const accountAddress = mounted ? getStoredAccount(chainId) : null;
  const hasAccount = !!accountAddress;

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

  const { data: ownerThresholdVal_raw } = useReadContract({
    address: accountAddress as `0x${string}`,
    abi: SIGIL_ACCOUNT_ABI,
    functionName: "ownerThreshold",
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

  // Bundle state — hardcoded, no API
  const bundles = getBundlesForChain(chainId);
  const [applyingBundle, setApplyingBundle] = useState<string | null>(null);
  const [bundleSuccess, setBundleSuccess] = useState<Set<string>>(new Set());
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [bundleProgress, setBundleProgress] = useState<string | null>(null);

  // ERC-1271 Scoped Signing (V12)
  const [erc1271Callers, setErc1271Callers] = useState<string[]>([]);
  const [newErc1271Caller, setNewErc1271Caller] = useState("");
  const [erc1271Adding, setErc1271Adding] = useState(false);
  const [erc1271Error, setErc1271Error] = useState<string | null>(null);

  // Check which bundles are already active
  const enabledBundles = new Set<string>();
  if (allowedTargets.length > 0) {
    const targetsLower = new Set(allowedTargets.map(t => t.toLowerCase()));
    for (const bundle of bundles) {
      if (bundle.targets.every(t => targetsLower.has(t.address.toLowerCase()))) {
        enabledBundles.add(bundle.id);
      }
    }
  }

  // Count how many new txs a bundle needs (skip already-whitelisted)
  const getBundleTxCount = useCallback((bundle: PolicyBundle) => {
    const existingTargets = new Set(allowedTargets.map(t => t.toLowerCase()));
    const existingFns = new Set(allowedFunctions.map(f => f.toLowerCase().slice(0, 10)));
    const newTargets = bundle.targets.filter(t => !existingTargets.has(t.address.toLowerCase()));
    const newFns = bundle.functions.filter(f => !existingFns.has(f.selector.toLowerCase()));
    return newTargets.length + newFns.length;
  }, [allowedTargets, allowedFunctions]);

  // Wait for tx receipt helper
  const waitForReceipt = useCallback(async (txHash: string, maxAttempts = 30): Promise<boolean> => {
    const rpc = getRpcUrl(chainId);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(rpc, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
          signal: AbortSignal.timeout(8000),
        });
        const json = await res.json();
        if (json.result) {
          return json.result.status === "0x1";
        }
      } catch { /* retry */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;
  }, [chainId]);

  // Apply bundle: use multicall to batch all whitelist additions into 1 tx
  const applyBundle = useCallback(async (bundle: PolicyBundle) => {
    if (!accountAddress || !address || isDemo) return;

    const existingTargets = new Set(allowedTargets.map(t => t.toLowerCase()));
    const existingFns = new Set(allowedFunctions.map(f => f.toLowerCase().slice(0, 10)));
    const newTargets = bundle.targets.filter(t => !existingTargets.has(t.address.toLowerCase()));
    const newFns = bundle.functions.filter(f => !existingFns.has(f.selector.toLowerCase()));
    const totalItems = newTargets.length + newFns.length;

    if (totalItems === 0) return;

    const confirmed = window.confirm(
      `Apply "${bundle.name}" bundle?\n\n${totalItems} whitelist addition${totalItems > 1 ? 's' : ''} batched into 1 transaction:\n• ${newTargets.length} target${newTargets.length !== 1 ? 's' : ''}\n• ${newFns.length} function${newFns.length !== 1 ? 's' : ''}\n\nOne MetaMask signature required.`
    );
    if (!confirmed) return;

    setApplyingBundle(bundle.id);
    setBundleError(null);
    setBundleProgress(`Preparing ${totalItems} operations...`);
    const addr = accountAddress as `0x${string}`;

    try {
      // Build calldata array for multicall
      const calls: `0x${string}`[] = [];

      for (const target of newTargets) {
        calls.push(encodeFunctionData({
          abi: SIGIL_ACCOUNT_ABI,
          functionName: "setAllowedTarget",
          args: [target.address as `0x${string}`, true],
        }));
      }

      for (const fn of newFns) {
        calls.push(encodeFunctionData({
          abi: SIGIL_ACCOUNT_ABI,
          functionName: "setAllowedFunction",
          args: [fn.selector as `0x${string}`, true],
        }));
      }

      // Batch into multicall (max 20 per call)
      const BATCH_SIZE = 20;
      let allSuccess = true;

      for (let i = 0; i < calls.length; i += BATCH_SIZE) {
        const batch = calls.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(calls.length / BATCH_SIZE);
        const batchLabel = totalBatches > 1 ? ` (batch ${batchNum}/${totalBatches})` : '';

        setBundleProgress(`Sign ${batch.length} operations in MetaMask${batchLabel}...`);

        const data = encodeFunctionData({
          abi: SIGIL_ACCOUNT_ABI,
          functionName: "multicall",
          args: [batch],
        });

        const txHash = await window.ethereum?.request({
          method: "eth_sendTransaction",
          params: [{ from: address, to: addr, data, value: "0x0" }],
        });

        if (!txHash) {
          allSuccess = false;
          setBundleError(`Transaction rejected${batchLabel}`);
          break;
        }

        setBundleProgress(`Confirming on-chain${batchLabel}...`);
        const success = await waitForReceipt(txHash as string);

        if (!success) {
          allSuccess = false;
          setBundleError(`Transaction reverted on-chain${batchLabel}`);
          break;
        }
      }

      if (allSuccess) {
        // Update local state
        const landedTargets = newTargets.map(t => t.address);
        const landedFns = newFns.map(f => f.selector);
        setAllowedTargets(prev => [...prev, ...landedTargets]);
        setAllowedFunctions(prev => [...prev, ...landedFns]);

        // Sync to DB
        try {
          await api.updatePolicy(accountAddress, {
            allowedTargets: [...allowedTargets, ...landedTargets],
            allowedFunctions: [...allowedFunctions, ...landedFns],
          });
        } catch { /* best-effort */ }

        setBundleSuccess(prev => new Set(prev).add(bundle.id));
        setBundleProgress(`✅ ${totalItems} operations applied in ${Math.ceil(calls.length / BATCH_SIZE)} transaction${calls.length > BATCH_SIZE ? 's' : ''}`);
        setTimeout(() => {
          setBundleSuccess(prev => { const n = new Set(prev); n.delete(bundle.id); return n; });
          setBundleProgress(null);
        }, 5000);
      }
    } catch (err) {
      setBundleError(`${bundle.name}: ${err instanceof Error ? err.message : "Transaction rejected"}`);
    }
    setApplyingBundle(null);
  }, [accountAddress, address, isDemo, chainId, allowedTargets, allowedFunctions, waitForReceipt]);

  // Sync from contract data first, then API
  useEffect(() => {
    if (maxTxValue) setMaxPerTx(parseFloat(formatEther(maxTxValue as bigint)).toString());
    if (dailyLimit) setDailyLimitVal(parseFloat(formatEther(dailyLimit as bigint)).toString());
    if (guardianThreshold) setGuardianThresholdVal(parseFloat(formatEther(guardianThreshold as bigint)).toString());
    if (ownerThresholdVal_raw) {
      const raw = ownerThresholdVal_raw as bigint;
      // type(uint256).max means "disabled" — show as empty or very large
      const MAX_UINT256 = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");
      if (raw >= MAX_UINT256) {
        setOwnerThreshold(""); // max uint256 = disabled
      } else {
        setOwnerThreshold(parseFloat(formatEther(raw)).toString());
      }
    }
  }, [maxTxValue, dailyLimit, guardianThreshold, ownerThresholdVal_raw]);


  // ─── ERC-1271: Check known callers on-chain ───
  const knownCallers = getKnownERC1271Callers(chainId);
  useEffect(() => {
    if (!mounted || !accountAddress || isDemo) return;
    const rpc = getRpcUrl(chainId);
    // allowedERC1271Callers(address) — check all known callers
    const allToCheck = [...knownCallers.map(c => c.address), ...erc1271Callers].filter((v, i, a) => a.indexOf(v) === i);
    if (allToCheck.length === 0) return;

    (async () => {
      const enabled: string[] = [];
      for (const addr of allToCheck) {
        const padded = addr.replace('0x', '').toLowerCase().padStart(64, '0');
        try {
          const res = await fetch(rpc, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: accountAddress, data: '0x3cd48cfe' + padded }, 'latest'] }),
            signal: AbortSignal.timeout(8000),
          });
          const json = await res.json();
          if (json.result && json.result.endsWith('1')) enabled.push(addr.toLowerCase());
        } catch { /* skip */ }
      }
      setErc1271Callers(enabled);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, accountAddress, chainId, isDemo]);

  const handleAddERC1271Caller = useCallback(async (callerAddr: string) => {
    if (!accountAddress || !address || isDemo) return;
    setErc1271Adding(true);
    setErc1271Error(null);
    try {
      const data = encodeFunctionData({
        abi: SIGIL_ACCOUNT_ABI,
        functionName: "setAllowedERC1271Caller",
        args: [callerAddr as `0x${string}`, true],
      });
      const txHash = await window.ethereum?.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: accountAddress, data, value: "0x0" }],
      });
      if (txHash) {
        // Wait for receipt
        const rpc = getRpcUrl(chainId);
        for (let i = 0; i < 30; i++) {
          try {
            const res = await fetch(rpc, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
            });
            const json = await res.json();
            if (json.result) {
              if (json.result.status === '0x1') {
                setErc1271Callers(prev => [...prev, callerAddr.toLowerCase()]);
              } else {
                setErc1271Error('Transaction reverted on-chain');
              }
              break;
            }
          } catch { /* retry */ }
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    } catch (err) {
      setErc1271Error(err instanceof Error ? err.message : 'Failed');
    }
    setErc1271Adding(false);
  }, [accountAddress, address, chainId, isDemo]);

  const handleRemoveERC1271Caller = useCallback(async (callerAddr: string) => {
    if (!accountAddress || !address || isDemo) return;
    setErc1271Adding(true);
    setErc1271Error(null);
    try {
      const data = encodeFunctionData({
        abi: SIGIL_ACCOUNT_ABI,
        functionName: "setAllowedERC1271Caller",
        args: [callerAddr as `0x${string}`, false],
      });
      const txHash = await window.ethereum?.request({
        method: "eth_sendTransaction",
        params: [{ from: address, to: accountAddress, data, value: "0x0" }],
      });
      if (txHash) {
        const rpc = getRpcUrl(chainId);
        for (let i = 0; i < 30; i++) {
          try {
            const res = await fetch(rpc, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
            });
            const json = await res.json();
            if (json.result) {
              if (json.result.status === '0x1') {
                setErc1271Callers(prev => prev.filter(c => c.toLowerCase() !== callerAddr.toLowerCase()));
              }
              break;
            }
          } catch { /* retry */ }
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    } catch (err) {
      setErc1271Error(err instanceof Error ? err.message : 'Failed');
    }
    setErc1271Adding(false);
  }, [accountAddress, address, chainId, isDemo]);

  // Load on-chain whitelisted targets & functions from all bundles
  const [onChainLoaded, setOnChainLoaded] = useState(false);
  useEffect(() => {
    if (!accountAddress || isDemo || onChainLoaded) return;
    const rpcUrl = getRpcUrl(chainId);
    if (!rpcUrl) return;

    (async () => {
      try {
        // Collect all unique targets and functions from bundles
        const allTargets = new Set<string>();
        const allFunctions = new Set<string>();
        for (const b of bundles) {
          for (const t of b.targets) allTargets.add(t.address);
          for (const f of b.functions) allFunctions.add(f.selector);
        }

        // Also add well-known selectors not in bundles
        const knownSelectors = [
          "0xd0e30db0", "0x2e1a7d4d", "0x095ea7b3", "0xa9059cbb", "0x23b872dd",
          "0x04e45aaf", "0xb858183f", "0x5023b4df", "0x09b81346",
          "0x5ae401dc", "0xac9650d8", "0x472b43f3", "0x38ed1739", "0x8803dbee",
          "0x42712a67", "0x617ba037", "0x69328dec", "0xa415bcad", "0x573ade81",
          "0xe8e33700", "0xbaa2abde", "0x88316456", "0x219f5d17", "0x0c49ccbe",
          "0xfc6f7865", "0x2ed3c100", "0x36c78516", "0xfe729aaf", "0xd798eff6", "0xe60f0c05",
        ];
        for (const s of knownSelectors) allFunctions.add(s);

        const addr = accountAddress.toLowerCase();
        // allowedTargets(address) selector and allowedFunctions(bytes4) selector
        const targetSig = "0xb8fe8d5f";
        const fnSig = "0x649f3df2";

        const whitelistedTargets: string[] = [];
        const whitelistedFns: string[] = [];

        // Batch check targets
        for (const target of allTargets) {
          const data = targetSig + target.slice(2).toLowerCase().padStart(64, "0");
          try {
            const resp = await fetch(rpcUrl, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: addr, data }, "latest"] }),
            });
            const result = await resp.json();
            if (result.result && result.result !== "0x" && BigInt(result.result) === BigInt(1)) {
              whitelistedTargets.push(target);
            }
          } catch { /* skip */ }
        }

        // Batch check functions
        for (const sel of allFunctions) {
          const padded = (sel.slice(2) + "0".repeat(56)).slice(0, 64);
          const data = fnSig + padded;
          try {
            const resp = await fetch(rpcUrl, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: addr, data }, "latest"] }),
            });
            const result = await resp.json();
            if (result.result && result.result !== "0x" && BigInt(result.result) === BigInt(1)) {
              whitelistedFns.push(sel);
            }
          } catch { /* skip */ }
        }

        if (whitelistedTargets.length > 0 || whitelistedFns.length > 0) {
          setAllowedTargets(whitelistedTargets);
          // Store selectors as-is — FunctionSelector handles both formats
          setAllowedFunctions(whitelistedFns);
        }
        setOnChainLoaded(true);
      } catch (err) {
        console.error("Failed to load on-chain whitelist:", err);
        setOnChainLoaded(true);
      }
    })();
  }, [accountAddress, isDemo, chainId, bundles, onChainLoaded]);

  // Track on-chain values so we know what actually changed
  const [onChainValues, setOnChainValues] = useState<{
    maxTxValue: string; dailyLimit: string; guardianThreshold: string; ownerThreshold: string;
  } | null>(null);

  useEffect(() => {
    if (maxTxValue && dailyLimit && guardianThreshold) {
      const vals = {
        maxTxValue: parseFloat(formatEther(maxTxValue as bigint)).toString(),
        dailyLimit: parseFloat(formatEther(dailyLimit as bigint)).toString(),
        guardianThreshold: parseFloat(formatEther(guardianThreshold as bigint)).toString(),
        ownerThreshold: ownerThresholdVal_raw ? parseFloat(formatEther(ownerThresholdVal_raw as bigint)).toString() : "0",
      };
      setOnChainValues(vals);
    }
  }, [maxTxValue, dailyLimit, guardianThreshold]);

  async function handleSave() {
    if (!accountAddress || isDemo) return;
    setSaving(true);
    setSaveError(null);
    try {
      const toWei = (v: string) => {
        const cleaned = v.trim();
        if (!cleaned || cleaned === "0") return parseEther("0");
        return parseEther(cleaned);
      };

      const addr = accountAddress as `0x${string}`;
      const calls: `0x${string}`[] = [];

      // Validate before sending
      const maxVal = toWei(maxPerTx);
      const dailyVal = toWei(dailyLimitVal);
      const guardianVal = toWei(guardianThresholdVal);
      // Empty ownerThreshold = disabled (max uint256)
      const ownerVal = ownerThreshold.trim() ? toWei(ownerThreshold) : BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");

      if (maxVal === BigInt(0)) { setSaveError("Per Transaction limit cannot be 0"); setSaving(false); return; }
      if (dailyVal === BigInt(0)) { setSaveError("Daily Limit cannot be 0"); setSaving(false); return; }
      if (maxVal > dailyVal) { setSaveError("Per Transaction limit cannot exceed Daily Limit"); setSaving(false); return; }
      if (guardianVal > ownerVal) { setSaveError("Guardian threshold cannot exceed Owner threshold"); setSaving(false); return; }

      // Always send updatePolicy with all current values (atomic — all 4 params in one call)
      calls.push(encodeFunctionData({
        abi: SIGIL_ACCOUNT_ABI,
        functionName: "updatePolicy",
        args: [maxVal, dailyVal, guardianVal, ownerVal],
      }));

      // If there's only 1 call, send directly (no multicall overhead)
      let txHash: string | null = null;
      if (calls.length === 1) {
        txHash = await window.ethereum?.request({
          method: "eth_sendTransaction",
          params: [{ from: address, to: addr, data: calls[0], value: "0x0" }],
        }) as string | null;
      } else {
        const data = encodeFunctionData({
          abi: SIGIL_ACCOUNT_ABI,
          functionName: "multicall",
          args: [calls],
        });
        txHash = await window.ethereum?.request({
          method: "eth_sendTransaction",
          params: [{ from: address, to: addr, data, value: "0x0" }],
        }) as string | null;
      }

      if (!txHash) throw new Error("Transaction rejected");

      // Wait for receipt
      const success = await waitForReceipt(txHash);
      if (!success) throw new Error("Transaction reverted on-chain");

      // Sync policy to DB so Guardian reads correct values
      try {
        await api.updatePolicy(accountAddress, {
          maxTxValue: maxVal.toString(),
          dailyLimit: dailyVal.toString(),
          guardianThreshold: guardianVal.toString(),
          ownerThreshold: ownerVal.toString(),
          allowedTargets: allowedTargets,
          allowedFunctions: allowedFunctions,
        });
      } catch { /* DB sync is best-effort — on-chain is source of truth */ }

      // Update tracked on-chain values
      setOnChainValues({
        maxTxValue: maxPerTx,
        dailyLimit: dailyLimitVal,
        guardianThreshold: guardianThresholdVal,
        ownerThreshold: ownerThreshold,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveError(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setSaving(false);
  }

  const KNOWN_FUNCTIONS: { sig: string; label: string; category: string }[] = [
    // ERC-20
    { sig: "transfer(address,uint256)", label: "Transfer tokens", category: "ERC-20" },
    { sig: "approve(address,uint256)", label: "Approve spender", category: "ERC-20" },
    { sig: "transferFrom(address,address,uint256)", label: "Transfer from", category: "ERC-20" },
    // ERC-721
    { sig: "safeTransferFrom(address,address,uint256)", label: "Transfer NFT", category: "ERC-721" },
    { sig: "setApprovalForAll(address,bool)", label: "Approve all NFTs", category: "ERC-721" },
    // DEX / Swap
    { sig: "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)", label: "Swap exact tokens", category: "DEX" },
    { sig: "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)", label: "Swap for exact tokens", category: "DEX" },
    { sig: "swapExactETHForTokens(uint256,address[],address,uint256)", label: "Swap native → tokens", category: "DEX" },
    { sig: "swapExactTokensForETH(uint256,uint256,address[],address,uint256)", label: "Swap tokens → native", category: "DEX" },
    { sig: "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))", label: "V3 Router exactInputSingle", category: "DEX" },
    { sig: "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))", label: "Router02 exactInputSingle", category: "DEX" },
    { sig: "exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))", label: "Router02 exactOutputSingle", category: "DEX" },
    { sig: "exactInput((bytes,address,uint256,uint256))", label: "Router02 exactInput", category: "DEX" },
    { sig: "multicall(uint256,bytes[])", label: "Multicall (with deadline)", category: "DEX" },
    { sig: "multicall(bytes[])", label: "Multicall (no deadline)", category: "DEX" },
    { sig: "execute(bytes,bytes[],uint256)", label: "UniversalRouter execute", category: "DEX" },
    { sig: "wrapETH(uint256)", label: "Router02 wrapETH", category: "DEX" },
    { sig: "unwrapWETH9(uint256,address)", label: "Router02 unwrapWETH9", category: "DEX" },
    { sig: "refundETH()", label: "Refund ETH", category: "DEX" },
    { sig: "sweepToken(address,uint256,address)", label: "Sweep token", category: "DEX" },
    // Lending
    { sig: "supply(address,uint256,address,uint16)", label: "Supply / deposit", category: "Lending" },
    { sig: "borrow(address,uint256,uint256,uint16,address)", label: "Borrow", category: "Lending" },
    { sig: "repay(address,uint256,uint256,address)", label: "Repay", category: "Lending" },
    { sig: "withdraw(address,uint256,address)", label: "Withdraw", category: "Lending" },
    // Staking
    { sig: "stake(uint256)", label: "Stake", category: "Staking" },
    { sig: "unstake(uint256)", label: "Unstake", category: "Staking" },
    { sig: "claimRewards()", label: "Claim rewards", category: "Staking" },
    // Wrapping
    { sig: "deposit()", label: "Wrap native (WMATIC/WETH/WAVAX)", category: "Wrapping" },
    { sig: "withdraw(uint256)", label: "Unwrap native", category: "Wrapping" },
    // Liquidity
    { sig: "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)", label: "Add liquidity (V2)", category: "Liquidity" },
    { sig: "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)", label: "Add liquidity + native", category: "Liquidity" },
    { sig: "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)", label: "Remove liquidity (V2)", category: "Liquidity" },
    { sig: "removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)", label: "Remove liquidity + native", category: "Liquidity" },
    { sig: "mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))", label: "Create V3 LP position", category: "Liquidity" },
    { sig: "increaseLiquidity((uint256,uint256,uint256,uint256,uint256,uint256))", label: "Add to V3 position", category: "Liquidity" },
    { sig: "decreaseLiquidity((uint256,uint128,uint256,uint256,uint256))", label: "Remove from V3 position", category: "Liquidity" },
    { sig: "collect((uint256,address,uint128,uint128))", label: "Collect V3 LP fees", category: "Liquidity" },
    // Staking
    { sig: "stake(uint256)", label: "Stake", category: "Staking" },
    { sig: "unstake(uint256)", label: "Unstake", category: "Staking" },
    { sig: "claimRewards()", label: "Claim rewards", category: "Staking" },
    { sig: "getReward()", label: "Get reward", category: "Staking" },
    { sig: "exit()", label: "Exit (unstake + claim)", category: "Staking" },
    // Aave extended
    { sig: "setUserUseReserveAsCollateral(address,bool)", label: "Toggle collateral", category: "Lending" },
    { sig: "repayWithATokens(address,uint256,uint256)", label: "Repay with aTokens", category: "Lending" },
    // ERC-20 extended
    { sig: "increaseAllowance(address,uint256)", label: "Increase allowance", category: "ERC-20" },
    { sig: "decreaseAllowance(address,uint256)", label: "Decrease allowance", category: "ERC-20" },
    { sig: "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", label: "Permit (EIP-2612)", category: "ERC-20" },
    // 1inch
    { sig: "swap(address,(address,address,address,address,uint256,uint256,uint256),bytes,bytes)", label: "1inch V6 swap", category: "DEX" },
    // Curve
    { sig: "exchange(int128,int128,uint256,uint256)", label: "Curve swap", category: "DEX" },
    { sig: "exchange_underlying(int128,int128,uint256,uint256)", label: "Curve underlying swap", category: "DEX" },
    // Polymarket
    { sig: "fillOrder((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes),uint256)", label: "Fill order", category: "Polymarket" },
    { sig: "fillOrders((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes)[],uint256[])", label: "Fill orders (batch)", category: "Polymarket" },
    { sig: "matchOrders((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes),(uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes)[],uint256,uint256[])", label: "Match orders", category: "Polymarket" },
    // Permit2
    { sig: "permitTransferFrom(((address,uint256),uint256,uint256),(address,uint256),address,bytes)", label: "Permit2 transfer", category: "Permit2" },
    { sig: "permitBatchTransferFrom(((address,uint256)[],uint256,uint256),(address,uint256)[],address,bytes)", label: "Permit2 batch transfer", category: "Permit2" },
  ];

  function FunctionSelector({ items, setItems, disabled }: {
    items: string[]; setItems: (v: string[]) => void; disabled: boolean;
  }) {
    const [customSig, setCustomSig] = useState("");

    // Build selector↔sig lookup for matching on-chain selectors to known functions
    const sigToSelector = new Map<string, string>();
    const selectorToSig = new Map<string, string>();
    for (const fn of KNOWN_FUNCTIONS) {
      try {
        const sel = toFunctionSelector(`function ${fn.sig}`);
        sigToSelector.set(fn.sig.toLowerCase(), sel.toLowerCase());
        selectorToSig.set(sel.toLowerCase(), fn.sig);
      } catch { /* skip invalid sigs */ }
    }

    // Items can be full sigs OR 4-byte selectors — normalize to a set of selectors for matching
    const itemSelectors = new Set<string>();
    for (const item of items) {
      const lower = item.toLowerCase();
      if (lower.startsWith("0x") && lower.length <= 10) {
        itemSelectors.add(lower.slice(0, 10)); // 4-byte selector
      } else if (sigToSelector.has(lower)) {
        itemSelectors.add(sigToSelector.get(lower)!);
      } else {
        // Try computing selector from sig
        try {
          const sel = toFunctionSelector(`function ${item}`);
          itemSelectors.add(sel.toLowerCase());
        } catch {
          itemSelectors.add(lower); // fallback
        }
      }
    }

    const isFnEnabled = (sig: string): boolean => {
      const sel = sigToSelector.get(sig.toLowerCase());
      return sel ? itemSelectors.has(sel) : false;
    };

    const categories = [...new Set(KNOWN_FUNCTIONS.map(f => f.category))];

    const toggleFunction = (sig: string) => {
      const sel = sigToSelector.get(sig.toLowerCase());
      if (!sel) return;

      if (itemSelectors.has(sel)) {
        // Remove — filter out both the sig and the selector form
        setItems(items.filter(i => {
          const iLower = i.toLowerCase();
          if (iLower === sig.toLowerCase()) return false;
          if (iLower.startsWith("0x") && iLower.slice(0, 10) === sel) return false;
          try {
            return toFunctionSelector(`function ${i}`).toLowerCase() !== sel;
          } catch { return iLower !== sel; }
        }));
      } else {
        setItems([...items, sig]);
      }
    };

    // Custom items not in KNOWN_FUNCTIONS (neither as sig nor selector)
    const customItems = items.filter(item => {
      const lower = item.toLowerCase();
      // Check if it matches any known function (by sig or selector)
      return !KNOWN_FUNCTIONS.some(f => {
        if (f.sig.toLowerCase() === lower) return true;
        const sel = sigToSelector.get(f.sig.toLowerCase());
        return sel && lower.startsWith("0x") && lower.slice(0, 10) === sel;
      });
    });

    return (
      <div className="space-y-4">
        {categories.map(cat => {
          const fns = KNOWN_FUNCTIONS.filter(f => f.category === cat);
          const enabledCount = fns.filter(f => isFnEnabled(f.sig)).length;
          return (
            <div key={cat} className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">{cat}</span>
                  {enabledCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#00FF88]/10 text-[#00FF88]">
                      {enabledCount}/{fns.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    const allEnabled = fns.every(f => isFnEnabled(f.sig));
                    if (allEnabled) {
                      // Deselect all in category — remove both sig and selector forms
                      const catSelectors = new Set(fns.map(f => sigToSelector.get(f.sig.toLowerCase())).filter(Boolean));
                      setItems(items.filter(i => {
                        const iLower = i.toLowerCase();
                        if (fns.some(f => f.sig.toLowerCase() === iLower)) return false;
                        if (iLower.startsWith("0x") && catSelectors.has(iLower.slice(0, 10))) return false;
                        return true;
                      }));
                    } else {
                      // Select all in category
                      const newSigs = fns.filter(f => !isFnEnabled(f.sig)).map(f => f.sig);
                      setItems([...items, ...newSigs]);
                    }
                  }}
                  disabled={disabled}
                  className="text-[10px] text-white/30 hover:text-[#00FF88] transition-colors disabled:opacity-50"
                >
                  {fns.every(f => isFnEnabled(f.sig)) ? "Deselect all" : "Select all"}
                </button>
              </div>
              <div className="p-2 space-y-0.5">
                {fns.map(fn => {
                  const isEnabled = isFnEnabled(fn.sig);
                  return (
                    <label
                      key={fn.sig}
                      className={`flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                        isEnabled ? "bg-[#00FF88]/5" : "hover:bg-white/[0.03]"
                      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => !disabled && toggleFunction(fn.sig)}
                        disabled={disabled}
                        className="rounded border-white/10 bg-[#050505] text-[#00FF88] focus:ring-[#00FF88] cursor-pointer"
                      />
                      <span className="text-xs font-medium flex-1">{fn.label}</span>
                      <code className="text-[10px] text-white/20 font-mono truncate max-w-[240px]">{fn.sig}</code>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Custom functions */}
        {customItems.length > 0 && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <div className="px-3 py-2 bg-white/[0.02] border-b border-white/5">
              <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">Custom</span>
            </div>
            <div className="p-2 space-y-0.5">
              {customItems.map(item => (
                <div key={item} className="flex items-center gap-3 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={true}
                    onChange={() => toggleFunction(item)}
                    disabled={disabled}
                    className="rounded border-white/10 bg-[#050505] text-[#00FF88] focus:ring-[#00FF88] cursor-pointer"
                  />
                  <code className="text-xs font-mono truncate flex-1">{item}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add custom */}
        <div className="flex gap-2">
          <input
            value={customSig}
            onChange={e => setCustomSig(e.target.value)}
            placeholder="Custom: myFunction(address,uint256)"
            disabled={disabled}
            className="flex-1 bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-xs font-mono focus:border-[#00FF88] outline-none disabled:opacity-50"
          />
          <button
            onClick={() => { if (customSig.trim()) { setItems([...items, customSig.trim()]); setCustomSig(""); } }}
            disabled={disabled || !customSig.trim()}
            className="px-3 py-2 bg-[#00FF88] hover:brightness-110 text-[#050505] text-xs rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    );
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
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <p className="text-white/40">{isConnected ? "Deploy a Sigil Wallet to configure policies" : "Connect wallet to view policies"}</p>
        </div>
      )}

      {!isDemo && accountAddress && (
        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-lg text-sm space-y-1">
          <div className="text-xs text-white/40">On-chain policy for <span className="font-mono">{accountAddress.slice(0, 10)}...{accountAddress.slice(-6)}</span></div>
          {ownerAddr && <div className="text-xs"><span className="text-white/40">Origin Wallet:</span> <span className="font-mono">{(ownerAddr as string).slice(0, 10)}...</span></div>}
          {agentKeyAddr && <div className="text-xs"><span className="text-white/40">Agent Wallet:</span> <span className="font-mono">{(agentKeyAddr as string).slice(0, 10)}...</span></div>}
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
            <label className="text-xs text-white/40 block mb-1">Origin Wallet Override Threshold ({getNativeToken(chainId)})</label>
            <input type="text" value={ownerThreshold} onChange={e => setOwnerThreshold(e.target.value)} disabled={isDemo}
              className="w-full bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-sm font-mono focus:border-[#00FF88] outline-none disabled:opacity-50" />
            <p className="text-xs text-white/40 mt-1">Transactions above this require owner signature</p>
          </div>
        </div>
      </Card>

      {/* Quick Setup Bundles */}
      {bundles.length > 0 && (
        <Card title="⚡ Quick Setup Bundles">
          <p className="text-xs text-white/40 mb-4">One-click whitelist packages for popular protocols. All operations are batched via <code className="text-[#00FF88]">multicall</code> — one signature, one transaction.</p>
          {bundleProgress && (
            <div className="mb-4 p-3 bg-[#00FF88]/10 border border-[#00FF88]/30 rounded-lg text-xs text-[#00FF88] font-mono animate-pulse">
              {bundleProgress}
            </div>
          )}
          {bundleError && (
            <div className="mb-4 p-3 bg-[#F04452]/10 border border-[#F04452]/30 rounded-lg text-xs text-[#F04452]">⚠ {bundleError}</div>
          )}
          <div className="space-y-3">
            {bundles.map(bundle => {
              const isEnabled = enabledBundles.has(bundle.id);
              const isApplying = applyingBundle === bundle.id;
              const justApplied = bundleSuccess.has(bundle.id);
              return (
                <div
                  key={bundle.id}
                  className={`rounded-xl border p-4 transition-all ${
                    isEnabled
                      ? "border-[#00FF88]/50 bg-[#00FF88]/5"
                      : "border-white/5 bg-[#050505]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{bundle.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{bundle.name}</span>
                        {isEnabled && <span className="text-xs px-1.5 py-0.5 rounded bg-[#00FF88]/20 text-[#00FF88]">✓ Active</span>}
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">{bundle.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {bundle.targets.map(t => (
                          <span key={t.address} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 font-mono">
                            {t.label}
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {bundle.functions.map(f => (
                          <span key={f.selector} className="text-[10px] px-1.5 py-0.5 rounded bg-[#00FF88]/5 text-[#00FF88]/40 font-mono">
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => applyBundle(bundle)}
                      disabled={isDemo || isApplying || isEnabled}
                      className={`shrink-0 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isEnabled
                          ? "bg-[#00FF88]/20 text-[#00FF88] cursor-default"
                          : justApplied
                          ? "bg-[#00FF88] text-[#050505]"
                          : isApplying
                          ? "bg-white/10 text-white/40 animate-pulse"
                          : "bg-[#00FF88] hover:brightness-110 text-[#050505]"
                      } disabled:opacity-60`}
                    >
                      {isEnabled ? "✓ Active" : justApplied ? "✓ Applied!" : isApplying ? "Applying..." : `Apply (${getBundleTxCount(bundle)} ops, 1 tx)`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] text-white/20">All whitelist operations are batched into a single multicall transaction (max 20 per tx). Already-whitelisted items are skipped automatically.</p>
        </Card>
      )}

      {/* Lists */}
      <Card title="Allowed Targets">
        <ListEditor items={allowedTargets} setItems={setAllowedTargets} newVal={newTarget} setNewVal={setNewTarget} placeholder="0x..." />
      </Card>

      <Card title="Allowed Functions">
        <FunctionSelector items={allowedFunctions} setItems={setAllowedFunctions} disabled={isDemo} />
      </Card>

      <Card title="Blocked Addresses">
        <ListEditor items={blockedAddresses} setItems={setBlockedAddresses} newVal={newBlocked} setNewVal={setNewBlocked} placeholder="0x..." />
      </Card>

      {/* ERC-1271: Scoped Agent Signing (V12 only) */}
      {!isDemo && (
        <Card title="🔏 Agent Signing Permissions (ERC-1271)">
          <p className="text-xs text-white/40 mb-4">
            Allow your agent to sign messages for specific protocols. When enabled, the protocol can verify your agent&apos;s signature as if it came from your Sigil Wallet.
            This is required for protocols like Polymarket (order signing) and Permit2 (gasless approvals).
          </p>

          {erc1271Error && (
            <div className="mb-4 p-3 bg-[#F04452]/10 border border-[#F04452]/30 rounded-lg text-xs text-[#F04452]">⚠ {erc1271Error}</div>
          )}

          {/* Known protocols */}
          {knownCallers.length > 0 && (
            <div className="space-y-2 mb-4">
              <div className="text-xs text-white/30 uppercase tracking-wide mb-2">Supported Protocols</div>
              {knownCallers.map(caller => {
                const isEnabled = erc1271Callers.includes(caller.address.toLowerCase());
                return (
                  <div key={caller.address} className="flex items-center justify-between p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                    <div>
                      <div className="text-sm font-medium">{caller.name}</div>
                      <div className="text-xs text-white/30 mt-0.5">{caller.description}</div>
                      <code className="text-[10px] text-white/20 mt-1 block">{caller.address}</code>
                    </div>
                    <button
                      onClick={() => isEnabled ? handleRemoveERC1271Caller(caller.address) : handleAddERC1271Caller(caller.address)}
                      disabled={erc1271Adding}
                      className={`shrink-0 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isEnabled
                          ? "bg-[#00FF88]/20 text-[#00FF88] hover:bg-[#F04452]/20 hover:text-[#F04452]"
                          : "bg-[#00FF88] text-[#050505] hover:brightness-110"
                      } disabled:opacity-50`}
                    >
                      {erc1271Adding ? "..." : isEnabled ? "✓ Enabled" : "Enable"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Custom caller */}
          <div className="pt-3 border-t border-white/[0.06]">
            <div className="text-xs text-white/30 uppercase tracking-wide mb-2">Custom Protocol Address</div>
            <div className="flex gap-2">
              <input
                value={newErc1271Caller}
                onChange={e => setNewErc1271Caller(e.target.value)}
                placeholder="0x..."
                className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm font-mono placeholder:text-white/20 focus:outline-none focus:border-[#00FF88]/30"
              />
              <button
                onClick={() => {
                  if (newErc1271Caller.match(/^0x[0-9a-fA-F]{40}$/)) {
                    handleAddERC1271Caller(newErc1271Caller);
                    setNewErc1271Caller("");
                  }
                }}
                disabled={erc1271Adding || !newErc1271Caller.match(/^0x[0-9a-fA-F]{40}$/)}
                className="px-4 py-2 rounded-lg bg-[#00FF88] text-[#050505] text-xs font-medium hover:brightness-110 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Currently enabled custom callers (not in known list) */}
          {erc1271Callers.filter(c => !knownCallers.some(k => k.address.toLowerCase() === c)).length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-xs text-white/30">Custom callers:</div>
              {erc1271Callers
                .filter(c => !knownCallers.some(k => k.address.toLowerCase() === c))
                .map(addr => (
                  <div key={addr} className="flex items-center justify-between py-1.5">
                    <code className="text-xs text-white/50 font-mono">{addr}</code>
                    <button
                      onClick={() => handleRemoveERC1271Caller(addr)}
                      disabled={erc1271Adding}
                      className="text-xs text-[#F04452] hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
