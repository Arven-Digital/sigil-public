"use client";
import { Fragment, useState } from "react";
import { useTransactions } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";
import { mockTransactions, Transaction } from "@/lib/mock";
import Card from "@/components/Card";
import VerdictBadge from "@/components/VerdictBadge";

function shortenAddr(a: string) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function LoadingSpinner() {
  return <div className="animate-spin h-5 w-5 border-2 border-[#00FF88] border-t-transparent rounded-full" />;
}

const PAGE_SIZE = 10;

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { address } = useWallet();
  const { data: txData, error, isLoading, isDemoMode } = useTransactions(address, page, PAGE_SIZE);

  const allTxs: Transaction[] = isDemoMode ? mockTransactions : (txData?.transactions || txData || []);
  const start = (page - 1) * PAGE_SIZE;
  const txs = allTxs.slice(start, start + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(allTxs.length / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Activity Feed</h1>

      {isDemoMode && (
        <div className="p-3 bg-[#00FF88]/10 border border-[#00FF88]/20 rounded-lg text-sm text-[#00FF88]">
          📋 Showing demo data — connect your wallet for live data
        </div>
      )}

      {!isDemoMode && error && (
        <div className="p-3 bg-[#F04452]/10 border border-[#F04452]/30 rounded-lg text-sm text-[#F04452]">
          ⚠ Failed to load transactions: {error.message || "API unreachable"}
        </div>
      )}

      <Card>
        {!isDemoMode && isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <LoadingSpinner /> <span className="text-sm text-white/40">Loading transactions…</span>
          </div>
        ) : txs.length === 0 && !error ? (
          <p className="text-sm text-white/40 py-4 text-center">No transactions yet</p>
        ) : txs.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 text-xs border-b border-white/5">
                    <th className="text-left py-2">Target</th>
                    <th className="text-left py-2">Value</th>
                    <th className="text-left py-2">Function</th>
                    <th className="text-left py-2">Verdict</th>
                    <th className="text-left py-2">Risk</th>
                    <th className="text-left py-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx) => (
                    <Fragment key={tx.id}>
                      <tr
                        onClick={() => setExpanded(expanded === tx.id ? null : tx.id)}
                        className="border-b border-white/5 hover:bg-white/5/50 cursor-pointer"
                      >
                        <td className="py-2 font-mono text-xs">{shortenAddr(tx.target)}</td>
                        <td className="py-2">{tx.value}</td>
                        <td className="py-2 text-xs text-white/40">{tx.function}</td>
                        <td className="py-2"><VerdictBadge verdict={tx.verdict} /></td>
                        <td className="py-2 text-xs">{tx.riskScore.toFixed(2)}</td>
                        <td className="py-2 text-xs text-white/40">
                          {new Date(tx.timestamp).toLocaleString()}
                        </td>
                      </tr>
                      {expanded === tx.id && tx.layers && (
                        <tr key={tx.id + "-detail"} className="bg-[#050505]/50">
                          <td colSpan={6} className="p-4">
                            <div className="grid grid-cols-3 gap-4 text-xs">
                              <div className={`p-3 rounded-lg border ${tx.layers.layer1.pass ? "border-[#00FF88]/30 bg-[#00FF88]/5" : "border-[#F04452]/30 bg-[#F04452]/5"}`}>
                                <div className="font-medium mb-1">Layer 1 — Rules</div>
                                <div className={tx.layers.layer1.pass ? "text-[#00FF88]" : "text-[#F04452]"}>
                                  {tx.layers.layer1.pass ? "✓ Pass" : "✗ Fail"}: {tx.layers.layer1.reason}
                                </div>
                              </div>
                              <div className={`p-3 rounded-lg border ${tx.layers.layer2.pass ? "border-[#00FF88]/30 bg-[#00FF88]/5" : "border-[#F04452]/30 bg-[#F04452]/5"}`}>
                                <div className="font-medium mb-1">Layer 2 — Simulation</div>
                                <div className={tx.layers.layer2.pass ? "text-[#00FF88]" : "text-[#F04452]"}>
                                  {tx.layers.layer2.pass ? "✓ Pass" : "✗ Fail"}: {tx.layers.layer2.reason}
                                </div>
                              </div>
                              <div className={`p-3 rounded-lg border ${tx.layers.layer3.pass ? "border-[#00FF88]/30 bg-[#00FF88]/5" : "border-[#F04452]/30 bg-[#F04452]/5"}`}>
                                <div className="font-medium mb-1">Layer 3 — AI (Score: {tx.layers.layer3.score.toFixed(2)})</div>
                                <div className={tx.layers.layer3.pass ? "text-[#00FF88]" : "text-[#F04452]"}>
                                  {tx.layers.layer3.pass ? "✓ Pass" : "✗ Fail"}: {tx.layers.layer3.reason}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm bg-white/5 rounded disabled:opacity-30 hover:bg-white/5/80"
              >
                ← Previous
              </button>
              <span className="text-sm text-white/40">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm bg-white/5 rounded disabled:opacity-30 hover:bg-white/5/80"
              >
                Next →
              </button>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
