"use client";
import { useState } from "react";
import { useRecoveryConfig, useActiveRecoveries } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";
import { mockRecoveryConfig, mockActiveRecoveries } from "@/lib/mock";
import { api, DEMO_ADDRESS } from "@/lib/api";
import Card from "@/components/Card";

function shortenAddr(a: string) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function LoadingSpinner() {
  return <div className="animate-spin h-4 w-4 border-2 border-[#00FF88] border-t-transparent rounded-full inline-block" />;
}

function formatDelay(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rem = hours % 24;
    return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
  }
  return `${hours}h`;
}

function formatCountdown(executeAfter: number): string {
  const remaining = executeAfter - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return "Ready to execute";
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  return `${h}h ${m}m remaining`;
}

export default function RecoveryPage() {
  const { address, isConnected } = useWallet();
  const { data: config, error: configError, isLoading: configLoading, mutate: mutateConfig, isDemoMode } = useRecoveryConfig(address);
  const { data: recoveries, error: recError, mutate: mutateRecoveries } = useActiveRecoveries(address);
  const addr = address || DEMO_ADDRESS;

  const recoveryConfig = isDemoMode ? mockRecoveryConfig : config;
  const activeRecoveries = isDemoMode ? mockActiveRecoveries : (recoveries || []);

  const [newGuardian, setNewGuardian] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number | "">("");
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [delayHours, setDelayHours] = useState<number | "">("");
  const [delayLoading, setDelayLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isValidAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

  async function handleAddGuardian() {
    if (!isValidAddress(newGuardian)) {
      setActionError("Invalid Ethereum address format");
      return;
    }
    setAddLoading(true);
    setActionError(null);
    try {
      await api.addGuardian(addr, newGuardian);
      setNewGuardian("");
      mutateConfig();
    } catch (err) {
      setActionError(`Failed to add guardian: ${err instanceof Error ? err.message : "API error"}`);
    }
    setAddLoading(false);
  }

  async function handleRemoveGuardian(guardian: string) {
    if (removeConfirm !== guardian) {
      setRemoveConfirm(guardian);
      return;
    }
    setRemoveConfirm(null);
    setRemoveLoading(guardian);
    setActionError(null);
    try {
      await api.removeGuardian(addr, guardian);
      mutateConfig();
    } catch (err) {
      setActionError(`Failed to remove guardian: ${err instanceof Error ? err.message : "API error"}`);
    }
    setRemoveLoading(null);
  }

  async function handleSetThreshold() {
    if (!threshold || threshold < 1) return;
    setThresholdLoading(true);
    setActionError(null);
    try {
      await api.setRecoveryThreshold(addr, threshold);
      setThreshold("");
      mutateConfig();
    } catch (err) {
      setActionError(`Failed to set threshold: ${err instanceof Error ? err.message : "API error"}`);
    }
    setThresholdLoading(false);
  }

  async function handleSetDelay() {
    if (!delayHours || delayHours < 48) {
      setActionError("Minimum recovery delay is 48 hours");
      return;
    }
    setDelayLoading(true);
    setActionError(null);
    try {
      await api.setRecoveryDelay(addr, Number(delayHours) * 3600);
      setDelayHours("");
      mutateConfig();
    } catch (err) {
      setActionError(`Failed to set delay: ${err instanceof Error ? err.message : "API error"}`);
    }
    setDelayLoading(false);
  }

  async function handleCancelRecovery(recoveryId: string) {
    if (cancelConfirm !== recoveryId) {
      setCancelConfirm(recoveryId);
      return;
    }
    setCancelConfirm(null);
    setCancelLoading(recoveryId);
    setActionError(null);
    try {
      await api.cancelRecovery(addr, recoveryId);
      mutateRecoveries();
    } catch (err) {
      setActionError(`Failed to cancel recovery: ${err instanceof Error ? err.message : "API error"}`);
    }
    setCancelLoading(null);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">🛡️ Recovery Management</h1>
      <p className="text-sm text-white/40">
        Manage guardians for social recovery. If you lose access to your owner key, guardians can recover your account.
      </p>

      {isDemoMode && (
        <div className="p-3 bg-[#00FF88]/10 border border-[#00FF88]/20 rounded-lg text-sm text-[#00FF88]">
          📋 Demo mode — showing sample data. Connect your wallet for live data.
        </div>
      )}

      {!isDemoMode && configError && (
        <div className="p-3 bg-[#F04452]/10 border border-[#F04452]/30 rounded-lg text-sm text-[#F04452]">
          ⚠ Failed to load recovery config: {configError.message || "API unreachable"}
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-[#F04452]/10 border border-[#F04452]/30 rounded-lg text-sm text-[#F04452]">
          ⚠ {actionError}
        </div>
      )}

      {!isDemoMode && configLoading && (
        <div className="flex items-center gap-2 py-4">
          <LoadingSpinner /> <span className="text-sm text-white/40">Loading recovery config…</span>
        </div>
      )}

      {/* Config Overview */}
      {recoveryConfig && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <div className="text-xs text-white/40">Threshold</div>
            <div className="text-2xl font-bold">{recoveryConfig.threshold} of {recoveryConfig.guardianCount}</div>
          </Card>
          <Card>
            <div className="text-xs text-white/40">Guardians</div>
            <div className="text-2xl font-bold">{recoveryConfig.guardianCount}</div>
          </Card>
          <Card>
            <div className="text-xs text-white/40">Recovery Delay</div>
            <div className="text-2xl font-bold">{formatDelay(recoveryConfig.delay)}</div>
          </Card>
        </div>
      )}

      {/* Guardian List */}
      <Card title="Guardians">
        {recoveryConfig && recoveryConfig.guardians.length > 0 ? (
          <div className="space-y-2">
            {recoveryConfig.guardians.map((g: string) => (
              <div key={g} className="flex items-center justify-between py-2 px-3 bg-[#050505]/50 rounded-lg">
                <span className="font-mono text-sm">{shortenAddr(g)}</span>
                <span className="font-mono text-xs text-white/40 hidden md:inline">{g}</span>
                <button
                  onClick={() => handleRemoveGuardian(g)}
                  disabled={removeLoading === g || isDemoMode}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    removeConfirm === g
                      ? "bg-[#F04452] text-white animate-pulse"
                      : "bg-[#F04452]/10 text-[#F04452] border border-[#F04452]/20 hover:bg-[#F04452] hover:text-white"
                  } disabled:opacity-30`}
                >
                  {removeLoading === g ? <LoadingSpinner /> : removeConfirm === g ? "Confirm Remove" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/40">No guardians configured</p>
        )}

        {/* Add Guardian */}
        <div className="mt-4 pt-4 border-t border-white/5/50">
          <label className="text-xs text-white/40 block mb-1">Add Guardian</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={newGuardian}
              onChange={(e) => setNewGuardian(e.target.value)}
              placeholder="Guardian address (0x...)"
              className="flex-1 bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-sm font-mono focus:border-[#00FF88] outline-none"
            />
            <button
              onClick={handleAddGuardian}
              disabled={!newGuardian || addLoading || isDemoMode}
              className="px-4 py-2 bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20 rounded-lg text-sm font-medium hover:bg-[#00FF88] hover:text-[#050505] transition-colors disabled:opacity-30"
            >
              {addLoading ? <LoadingSpinner /> : "Add"}
            </button>
          </div>
        </div>
      </Card>

      {/* Threshold & Delay Config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Threshold">
          <p className="text-xs text-white/40 mb-3">
            Set M-of-N — how many guardians must approve a recovery.
          </p>
          <div className="flex gap-3">
            <select
              value={threshold}
              onChange={(e) => setThreshold(e.target.value ? Number(e.target.value) : "")}
              className="flex-1 bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-sm focus:border-[#00FF88] outline-none"
            >
              <option value="">Select threshold</option>
              {recoveryConfig && Array.from({ length: recoveryConfig.guardianCount }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n} of {recoveryConfig.guardianCount}</option>
              ))}
            </select>
            <button
              onClick={handleSetThreshold}
              disabled={!threshold || thresholdLoading || isDemoMode}
              className="px-4 py-2 bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20 rounded-lg text-sm font-medium hover:bg-[#00FF88] hover:text-[#050505] transition-colors disabled:opacity-30"
            >
              {thresholdLoading ? <LoadingSpinner /> : "Update"}
            </button>
          </div>
        </Card>

        <Card title="Recovery Delay">
          <p className="text-xs text-white/40 mb-3">
            Delay before recovery can execute. Minimum 48 hours.
          </p>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="number"
                min={48}
                value={delayHours}
                onChange={(e) => setDelayHours(e.target.value ? Number(e.target.value) : "")}
                placeholder="48"
                className="w-full bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-sm focus:border-[#00FF88] outline-none pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">hours</span>
            </div>
            <button
              onClick={handleSetDelay}
              disabled={!delayHours || delayLoading || isDemoMode}
              className="px-4 py-2 bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20 rounded-lg text-sm font-medium hover:bg-[#00FF88] hover:text-[#050505] transition-colors disabled:opacity-30"
            >
              {delayLoading ? <LoadingSpinner /> : "Update"}
            </button>
          </div>
        </Card>
      </div>

      {/* Active Recoveries */}
      <Card title="Active Recoveries">
        {activeRecoveries.length > 0 ? (
          <div className="space-y-3">
            {activeRecoveries.map((r: any) => {
              const isReady = r.executeAfter <= Math.floor(Date.now() / 1000);
              return (
                <div key={r.id} className={`p-4 rounded-lg border ${isReady ? "bg-[#F4A524]/5 border-[#F4A524]/30" : "bg-[#050505]/50 border-white/5/50"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${isReady ? "bg-[#F4A524]/20 text-[#F4A524]" : "bg-[#00FF88]/10 text-[#00FF88]"}`}>
                      {isReady ? "Ready to Execute" : "Pending"}
                    </span>
                    <span className="text-xs text-white/40 font-mono">{r.id}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-white/40">New Owner</div>
                      <div className="font-mono text-xs">{shortenAddr(r.newOwner)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-white/40">Votes</div>
                      <div className="font-medium">{r.supportCount} / {recoveryConfig?.threshold || "?"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-white/40">Time Remaining</div>
                      <div className={`text-xs ${isReady ? "text-[#F4A524]" : ""}`}>{formatCountdown(r.executeAfter)}</div>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => handleCancelRecovery(r.id)}
                        disabled={cancelLoading === r.id || isDemoMode}
                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                          cancelConfirm === r.id
                            ? "bg-[#F04452] text-white animate-pulse"
                            : "bg-[#F04452]/10 text-[#F04452] border border-[#F04452]/20 hover:bg-[#F04452] hover:text-white"
                        } disabled:opacity-30`}
                      >
                        {cancelLoading === r.id ? <LoadingSpinner /> : cancelConfirm === r.id ? "Confirm Cancel" : "Cancel Recovery"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-white/40">No active recovery requests</p>
        )}
      </Card>
    </div>
  );
}
