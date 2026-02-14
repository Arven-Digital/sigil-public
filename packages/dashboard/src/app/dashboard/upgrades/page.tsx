"use client";
import { useState, useEffect } from "react";
import { useUpgradeStatus, useUpgradeHistory } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";
import { mockUpgradeStatus, mockUpgradeHistory } from "@/lib/mock";
import { api, DEMO_ADDRESS } from "@/lib/api";
import Card from "@/components/Card";

function shortenAddr(a: string) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function LoadingSpinner() {
  return <div className="animate-spin h-4 w-4 border-2 border-[#00FF88] border-t-transparent rounded-full inline-block" />;
}

function Countdown({ executeAfter }: { executeAfter: number }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = executeAfter - now;
  if (remaining <= 0) return <span className="text-[#F4A524] font-medium">Ready to execute</span>;

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;

  return (
    <span className="font-mono text-lg">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

export default function UpgradesPage() {
  const { address } = useWallet();
  const { data: upgrade, error: upgradeError, isLoading: upgradeLoading, mutate: mutateUpgrade, isDemoMode } = useUpgradeStatus(address);
  const { data: history, error: historyError } = useUpgradeHistory(address);
  const addr = address || DEMO_ADDRESS;

  const upgradeStatus = isDemoMode ? mockUpgradeStatus : upgrade;
  const upgradeHistory = isDemoMode ? mockUpgradeHistory : (history || []);
  const hasPending = upgradeStatus?.pendingImplementation && upgradeStatus.pendingImplementation !== "0x0000000000000000000000000000000000000000";

  const [newImpl, setNewImpl] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isValidAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

  async function handleRequestUpgrade() {
    if (!isValidAddress(newImpl)) {
      setActionError("Invalid Ethereum address format");
      return;
    }
    setRequestLoading(true);
    setActionError(null);
    try {
      await api.requestUpgrade(addr, newImpl);
      setNewImpl("");
      mutateUpgrade();
    } catch (err) {
      setActionError(`Failed to request upgrade: ${err instanceof Error ? err.message : "API error"}`);
    }
    setRequestLoading(false);
  }

  async function handleCancelUpgrade() {
    if (!cancelConfirm) {
      setCancelConfirm(true);
      return;
    }
    setCancelConfirm(false);
    setCancelLoading(true);
    setActionError(null);
    try {
      await api.cancelUpgrade(addr);
      mutateUpgrade();
    } catch (err) {
      setActionError(`Failed to cancel upgrade: ${err instanceof Error ? err.message : "API error"}`);
    }
    setCancelLoading(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">⬆️ Upgrade Management</h1>
      <p className="text-sm text-white/40">
        Manage UUPS proxy upgrades for your account implementation.
      </p>

      {isDemoMode && (
        <div className="p-3 bg-[#00FF88]/10 border border-[#00FF88]/20 rounded-lg text-sm text-[#00FF88]">
          📋 Demo mode — showing sample data. Connect your wallet for live data.
        </div>
      )}

      {!isDemoMode && upgradeError && (
        <div className="p-3 bg-[#F04452]/10 border border-[#F04452]/30 rounded-lg text-sm text-[#F04452]">
          ⚠ Failed to load upgrade status: {upgradeError.message || "API unreachable"}
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-[#F04452]/10 border border-[#F04452]/30 rounded-lg text-sm text-[#F04452]">
          ⚠ {actionError}
        </div>
      )}

      {!isDemoMode && upgradeLoading && (
        <div className="flex items-center gap-2 py-4">
          <LoadingSpinner /> <span className="text-sm text-white/40">Loading upgrade status…</span>
        </div>
      )}

      {/* Current Implementation */}
      <Card title="Current Implementation">
        {upgradeStatus?.currentImplementation ? (
          <div>
            <div className="font-mono text-sm break-all">{upgradeStatus.currentImplementation}</div>
            <div className="text-xs text-white/40 mt-1">Active contract implementation</div>
          </div>
        ) : (
          <p className="text-sm text-white/40">Not available</p>
        )}
      </Card>

      {/* Pending Upgrade */}
      {hasPending && (
        <Card className="border-[#F4A524]/30 bg-[#F4A524]/5">
          <h3 className="text-sm font-medium text-[#F4A524] mb-3">⏳ Pending Upgrade</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-white/40">New Implementation</div>
              <div className="font-mono text-sm break-all">{upgradeStatus!.pendingImplementation}</div>
            </div>
            <div>
              <div className="text-xs text-white/40">Requested At</div>
              <div className="text-sm">{new Date(upgradeStatus!.requestedAt * 1000).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-white/40">Execute After</div>
              <div className="text-sm">{new Date(upgradeStatus!.executeAfter * 1000).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-white/40">Countdown</div>
              <Countdown executeAfter={upgradeStatus!.executeAfter} />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#F4A524]/20">
            <button
              onClick={handleCancelUpgrade}
              disabled={cancelLoading || isDemoMode}
              className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                cancelConfirm
                  ? "bg-[#F04452] text-white animate-pulse"
                  : "bg-[#F04452]/10 text-[#F04452] border border-[#F04452]/20 hover:bg-[#F04452] hover:text-white"
              } disabled:opacity-30`}
            >
              {cancelLoading ? <LoadingSpinner /> : cancelConfirm ? "Confirm Cancel Upgrade" : "Cancel Upgrade"}
            </button>
          </div>
        </Card>
      )}

      {/* Request Upgrade */}
      {!hasPending && (
        <Card title="Request Upgrade">
          <p className="text-xs text-white/40 mb-3">
            Submit a new implementation address. There will be a mandatory delay before the upgrade can be executed.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={newImpl}
              onChange={(e) => setNewImpl(e.target.value)}
              placeholder="New implementation address (0x...)"
              className="flex-1 bg-[#050505] border border-white/5 rounded-lg px-3 py-2 text-sm font-mono focus:border-[#00FF88] outline-none"
            />
            <button
              onClick={handleRequestUpgrade}
              disabled={!newImpl || requestLoading || isDemoMode}
              className="px-4 py-2 bg-[#00FF88]/10 text-[#00FF88] border border-[#00FF88]/20 rounded-lg text-sm font-medium hover:bg-[#00FF88] hover:text-[#050505] transition-colors disabled:opacity-30"
            >
              {requestLoading ? <LoadingSpinner /> : "Request Upgrade"}
            </button>
          </div>
        </Card>
      )}

      {/* Upgrade History */}
      <Card title="Upgrade History">
        {upgradeHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/40 text-xs border-b border-white/5">
                  <th className="text-left py-2">From</th>
                  <th className="text-left py-2">To</th>
                  <th className="text-left py-2">Executed</th>
                  <th className="text-left py-2">Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {upgradeHistory.map((h: any, i: number) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5/50">
                    <td className="py-2 font-mono text-xs">{shortenAddr(h.fromImplementation)}</td>
                    <td className="py-2 font-mono text-xs">{shortenAddr(h.toImplementation)}</td>
                    <td className="py-2 text-xs text-white/40">{new Date(h.executedAt * 1000).toLocaleDateString()}</td>
                    <td className="py-2 font-mono text-xs text-white/40">{shortenAddr(h.txHash)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !historyError ? (
          <p className="text-sm text-white/40">No previous upgrades</p>
        ) : (
          <p className="text-sm text-[#F04452]">Failed to load history</p>
        )}
      </Card>
    </div>
  );
}
