"use client";

import { useState, useEffect } from "react";
import { useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useWallet } from "@/lib/wallet";
import { getStoredAccount, SIGIL_ACCOUNT_ABI } from "@/lib/contracts";
import Card from "@/components/Card";

function LoadingSpinner() {
  return <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block" />;
}

export default function EmergencyPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useWallet();
  const chainId = useChainId();
  const accountAddress = mounted ? getStoredAccount(chainId) : null;
  const hasAccount = !!accountAddress;

  const [newAgentKey, setNewAgentKey] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Read frozen status from contract
  const { data: isFrozen, refetch: refetchFrozen } = useReadContract({
    address: accountAddress as `0x${string}`,
    abi: SIGIL_ACCOUNT_ABI,
    functionName: "isFrozen",
    query: { enabled: !!accountAddress },
  });

  // Write contract hooks
  const { writeContract: freezeWrite, data: freezeTxHash, isPending: freezePending, error: freezeError } = useWriteContract();
  const { writeContract: unfreezeWrite, data: unfreezeTxHash, isPending: unfreezePending, error: unfreezeError } = useWriteContract();
  const { writeContract: rotateWrite, data: rotateTxHash, isPending: rotatePending, error: rotateError } = useWriteContract();
  const { writeContract: withdrawWrite, data: withdrawTxHash, isPending: withdrawPending, error: withdrawError } = useWriteContract();

  // Wait for confirmations
  const { isSuccess: freezeSuccess } = useWaitForTransactionReceipt({ hash: freezeTxHash });
  const { isSuccess: unfreezeSuccess } = useWaitForTransactionReceipt({ hash: unfreezeTxHash });
  const { isSuccess: rotateSuccess } = useWaitForTransactionReceipt({ hash: rotateTxHash });
  const { isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawTxHash });

  // Handle tx confirmations
  useEffect(() => {
    if (freezeSuccess) { setSuccessMsg("Account frozen successfully"); refetchFrozen(); }
  }, [freezeSuccess, refetchFrozen]);
  useEffect(() => {
    if (unfreezeSuccess) { setSuccessMsg("Account unfrozen successfully"); refetchFrozen(); }
  }, [unfreezeSuccess, refetchFrozen]);
  useEffect(() => {
    if (rotateSuccess) { setSuccessMsg("Agent key rotated successfully"); setNewAgentKey(""); }
  }, [rotateSuccess]);
  useEffect(() => {
    if (withdrawSuccess) { setSuccessMsg("Emergency withdrawal completed"); }
  }, [withdrawSuccess]);

  // Show errors
  useEffect(() => {
    const err = freezeError || unfreezeError || rotateError || withdrawError;
    if (err) setActionError(err.message);
  }, [freezeError, unfreezeError, rotateError, withdrawError]);

  // Clear messages after delay
  useEffect(() => {
    if (successMsg) { const t = setTimeout(() => setSuccessMsg(null), 5000); return () => clearTimeout(t); }
  }, [successMsg]);

  function handleAction(action: string, fn: () => void) {
    if (confirmAction !== action) {
      setConfirmAction(action);
      return;
    }
    setConfirmAction(null);
    setActionError(null);
    fn();
  }

  function handleFreeze() {
    if (!accountAddress) return;
    freezeWrite({
      address: accountAddress as `0x${string}`,
      abi: SIGIL_ACCOUNT_ABI,
      functionName: "freeze",
    });
  }

  function handleUnfreeze() {
    if (!accountAddress) return;
    unfreezeWrite({
      address: accountAddress as `0x${string}`,
      abi: SIGIL_ACCOUNT_ABI,
      functionName: "unfreeze",
    });
  }

  function handleRotateKey() {
    if (!accountAddress || !/^0x[0-9a-fA-F]{40}$/.test(newAgentKey)) {
      setActionError("Invalid Ethereum address format");
      return;
    }
    rotateWrite({
      address: accountAddress as `0x${string}`,
      abi: SIGIL_ACCOUNT_ABI,
      functionName: "rotateAgentKey",
      args: [newAgentKey as `0x${string}`],
    });
  }

  function handleWithdraw() {
    if (!accountAddress || !/^0x[0-9a-fA-F]{40}$/.test(withdrawTo)) {
      setActionError("Invalid Ethereum address");
      return;
    }
    withdrawWrite({
      address: accountAddress as `0x${string}`,
      abi: SIGIL_ACCOUNT_ABI,
      functionName: "emergencyWithdraw",
      args: [withdrawTo as `0x${string}`],
    });
  }

  if (!mounted) return null;

  const frozen = isFrozen as boolean | undefined;
  const isDemo = !isConnected || !hasAccount;
  const anyPending = freezePending || unfreezePending || rotatePending || withdrawPending;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#F04452]">⚠ Emergency Controls</h1>
      <p className="text-sm text-white/40">These actions interact directly with your smart contract. Use with caution.</p>

      {isDemo && (
        <div className="p-3 bg-[#00FF88]/10 border border-[#00FF88]/20 rounded-lg text-sm text-[#00FF88]">
          📋 {!isConnected ? "Demo mode — connect wallet to use emergency controls." : "No Sigil account found on this chain."}{" "}
          {!hasAccount && isConnected && <a href="/onboarding" className="underline">Deploy one →</a>}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-[#00FF88]/10 border border-[#00FF88]/30 rounded-lg text-sm text-[#00FF88]">
          ✅ {successMsg}
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-[#F04452]/10 border border-[#F04452]/30 rounded-lg text-sm text-[#F04452]">
          ⚠ {actionError}
          <button onClick={() => setActionError(null)} className="ml-2 underline text-xs">Dismiss</button>
        </div>
      )}

      {/* Freeze/Unfreeze */}
      <Card title="Account Freeze">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">
              Current status:{" "}
              <span className={frozen ? "text-[#F04452] font-bold" : "text-[#00FF88] font-bold"}>
                {frozen === undefined ? "Loading..." : frozen ? "🔒 FROZEN" : "✅ ACTIVE"}
              </span>
            </p>
            <p className="text-xs text-white/40 mt-1">
              {frozen ? "Account is frozen. All transactions are blocked." : "Freezing will immediately block all agent transactions."}
            </p>
          </div>
          <button
            onClick={() => handleAction("freeze", frozen ? handleUnfreeze : handleFreeze)}
            disabled={anyPending || isDemo || frozen === undefined}
            className={`px-6 py-2 rounded-lg font-medium text-sm transition-colors ${
              confirmAction === "freeze"
                ? "bg-[#F04452] hover:bg-[#F04452]/80 animate-pulse"
                : frozen
                ? "bg-[#00FF88] hover:bg-[#00FF88]/80 text-[#050505]"
                : "bg-[#F04452]/20 text-[#F04452] border border-[#F04452]/30 hover:bg-[#F04452] hover:text-white"
            } disabled:opacity-30`}
          >
            {freezePending || unfreezePending
              ? <span className="flex items-center gap-2"><LoadingSpinner /> Processing…</span>
              : confirmAction === "freeze"
              ? "Click again to confirm"
              : frozen ? "Unfreeze Account" : "Freeze Account"}
          </button>
        </div>
      </Card>

      {/* Rotate Agent Key */}
      <Card title="Rotate Agent Key">
        <p className="text-xs text-white/40 mb-3">Replace the current agent signing key. The old key is immediately invalidated on-chain.</p>
        <div className="flex gap-3">
          <input
            type="text"
            value={newAgentKey}
            onChange={e => setNewAgentKey(e.target.value)}
            placeholder="New agent public key (0x...)"
            disabled={isDemo}
            className="flex-1 bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-sm font-mono focus:border-[#00FF88] outline-none disabled:opacity-50"
          />
          <button
            onClick={() => handleAction("rotate", handleRotateKey)}
            disabled={!newAgentKey || anyPending || isDemo}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              confirmAction === "rotate"
                ? "bg-[#F4A524] hover:bg-[#F4A524]/80 animate-pulse text-black"
                : "bg-[#F4A524]/20 text-[#F4A524] border border-[#F4A524]/30 hover:bg-[#F4A524] hover:text-black"
            } disabled:opacity-30`}
          >
            {rotatePending
              ? <span className="flex items-center gap-2"><LoadingSpinner /> Rotating…</span>
              : confirmAction === "rotate" ? "Confirm Rotate" : "Rotate Key"}
          </button>
        </div>
      </Card>

      {/* Emergency Withdraw */}
      <Card title="Emergency Withdraw">
        <p className="text-xs text-white/40 mb-3">Withdraw <strong>ALL funds</strong> to a safe address. Owner-only contract call.</p>
        <div className="p-3 bg-[#F04452]/5 border border-[#F04452]/20 rounded-lg mb-3">
          <p className="text-xs text-[#F04452]">⚠ This withdraws the entire account balance. There is no partial withdrawal.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/40 block mb-1">Recipient Address</label>
            <input
              type="text"
              value={withdrawTo}
              onChange={e => setWithdrawTo(e.target.value)}
              placeholder="0x..."
              disabled={isDemo}
              className="w-full bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-sm font-mono focus:border-[#00FF88] outline-none disabled:opacity-50"
            />
          </div>
          <button
            onClick={() => handleAction("withdraw", handleWithdraw)}
            disabled={!withdrawTo || anyPending || isDemo}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
              confirmAction === "withdraw"
                ? "bg-[#F04452] hover:bg-[#F04452]/80 animate-pulse"
                : "bg-[#F04452]/20 text-[#F04452] border border-[#F04452]/30 hover:bg-[#F04452] hover:text-white"
            } disabled:opacity-30`}
          >
            {withdrawPending
              ? <span className="flex items-center gap-2"><LoadingSpinner /> Withdrawing…</span>
              : confirmAction === "withdraw" ? "⚠ Confirm Emergency Withdraw" : "Emergency Withdraw"}
          </button>
        </div>
      </Card>
    </div>
  );
}
