"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { getStoredAccounts, getActiveAccount, setActiveAccount, addStoredAccount, type StoredAccount } from "@/lib/contracts";

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  137: "Polygon",
  43114: "Avalanche",
  8453: "Base",
  42161: "Arbitrum",
  16661: "0G",
};

const CHAIN_COLORS: Record<number, string> = {
  1: "#627EEA",
  137: "#8247E5",
  43114: "#E84142",
  8453: "#0052FF",
  42161: "#28A0F0",
  16661: "#00D4AA",
};

function truncate(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

interface Props {
  chainId: number;
  onAccountChange?: (chainId: number, address: string) => void;
}

export default function WalletSelector({ chainId, onAccountChange }: Props) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeAddr, setActiveAddr] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importAddr, setImportAddr] = useState("");
  const [importError, setImportError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedDropdown, setCopiedDropdown] = useState<string | null>(null);

  const copyAddress = (e: React.MouseEvent, addr: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyDropdownAddress = (e: React.MouseEvent, addr: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(addr);
    setCopiedDropdown(addr);
    setTimeout(() => setCopiedDropdown(null), 1500);
  };
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAccounts(getStoredAccounts());
    setActiveAddr(getActiveAccount(chainId));
  }, [chainId, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (acc: StoredAccount) => {
    setActiveAccount(acc.chainId, acc.address);
    setActiveAddr(acc.address);
    setOpen(false);
    setImporting(false);
    onAccountChange?.(acc.chainId, acc.address);
  };

  const handleImport = async () => {
    const addr = importAddr.trim();
    if (!addr.match(/^0x[0-9a-fA-F]{40}$/)) {
      setImportError("Invalid address format");
      return;
    }
    setImportError("");
    // Verify it's a deployed contract on the current chain
    const RPCS: Record<number, string> = {
      1: "https://eth.drpc.org",
      137: "https://polygon-bor-rpc.publicnode.com",
      43114: "https://avalanche-c-chain-rpc.publicnode.com",
      8453: "https://base-rpc.publicnode.com",
      42161: "https://arbitrum-one-rpc.publicnode.com",
      16661: "https://0g.drpc.org",
    };
    const rpc = RPCS[chainId];
    if (!rpc) { setImportError("Unsupported chain"); return; }
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getCode", params: [addr, "latest"], id: 1 }),
      });
      const data = await res.json();
      if (!data.result || data.result === "0x" || data.result === "0x0") {
        setImportError("No contract found at this address on " + (CHAIN_NAMES[chainId] || "this chain"));
        return;
      }
    } catch {
      setImportError("RPC error — couldn't verify address");
      return;
    }
    addStoredAccount(chainId, addr);
    setActiveAccount(chainId, addr);
    setAccounts(getStoredAccounts());
    setActiveAddr(addr);
    setImporting(false);
    setImportAddr("");
    setOpen(false);
    onAccountChange?.(chainId, addr);
  };

  // Group accounts by chain
  const grouped = accounts.reduce<Record<number, StoredAccount[]>>((g, a) => {
    (g[a.chainId] ||= []).push(a);
    return g;
  }, {});

  const currentAccount = accounts.find(
    a => a.chainId === chainId && a.address.toLowerCase() === activeAddr?.toLowerCase()
  );

  if (accounts.length === 0) {
    return (
      <Link
        href="/onboarding"
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px] text-white/30 border border-dashed border-white/10 hover:border-[#00FF88]/30 hover:text-[#00FF88]/60 transition-colors"
      >
        <span>+</span>
        <span>Create Wallet</span>
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors border border-white/5 hover:border-white/10 bg-white/[0.02]"
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: "#00FF88" }}
        />
        <div className="flex-1 min-w-0">
          <div
            className="text-[12px] text-white/80 font-mono truncate cursor-pointer hover:text-[#00FF88] transition-colors flex items-center gap-1"
            onClick={(e) => activeAddr && copyAddress(e, activeAddr)}
            title="Click to copy full address"
          >
            {copied ? (
              <span className="text-[#00FF88]">✓ Copied!</span>
            ) : (
              <>
                {currentAccount?.label || (activeAddr ? truncate(activeAddr) : "No wallet")}
                {activeAddr && <span className="text-white/20 text-[10px]">📋</span>}
              </>
            )}
          </div>
          <div className="text-[10px] text-white/30">
            {currentAccount?.label && activeAddr ? truncate(activeAddr) : CHAIN_NAMES[chainId] || `Chain ${chainId}`}
          </div>
        </div>
        <span
          className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[8px]"
          style={{ backgroundColor: CHAIN_COLORS[chainId] || "#666", color: "#fff" }}
        >
          {(CHAIN_NAMES[chainId] || "?")[0]}
        </span>
        <svg className={`w-3 h-3 text-white/30 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-white/5 bg-[#0a0a0a] shadow-2xl shadow-black/50 overflow-hidden max-h-[320px] overflow-y-auto">
          {Object.entries(grouped).map(([cid, accs]) => {
            const chainId_ = Number(cid);
            return (
              <div key={cid}>
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/20 bg-white/[0.02] flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: CHAIN_COLORS[chainId_] || "#666" }}
                  />
                  {CHAIN_NAMES[chainId_] || `Chain ${cid}`}
                </div>
                {accs.map(acc => {
                  const isActive = acc.chainId === chainId && acc.address.toLowerCase() === activeAddr?.toLowerCase();
                  return (
                    <button
                      key={`${acc.chainId}-${acc.address}`}
                      onClick={() => handleSelect(acc)}
                      className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors hover:bg-white/[0.04] ${
                        isActive ? "bg-[#00FF88]/5" : ""
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: isActive ? "#00FF88" : "transparent" }}
                      />
                      <div className="flex-1 min-w-0">
                        {acc.label && (
                          <div className="text-[11px] text-white/60 truncate">{acc.label}</div>
                        )}
                        <div className="text-[11px] font-mono text-white/40 truncate flex items-center gap-1">
                          {copiedDropdown === acc.address ? (
                            <span className="text-[#00FF88]">✓ Copied!</span>
                          ) : (
                            <>
                              {truncate(acc.address)}
                              <span
                                className="text-white/20 hover:text-[#00FF88] cursor-pointer text-[9px] transition-colors"
                                onClick={(e) => copyDropdownAddress(e, acc.address)}
                                title="Copy address"
                              >📋</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {importing ? (
            <div className="p-3 border-t border-white/5 space-y-2">
              <div className="text-[10px] text-white/30">Import existing Sigil Wallet on {CHAIN_NAMES[chainId] || "this chain"}</div>
              <input
                value={importAddr}
                onChange={e => { setImportAddr(e.target.value); setImportError(""); }}
                placeholder="0x..."
                autoFocus
                className="w-full bg-[#050505] border border-white/10 rounded px-2 py-1.5 text-[11px] font-mono focus:border-[#00FF88] outline-none"
              />
              {importError && <div className="text-[10px] text-[#F04452]">{importError}</div>}
              <div className="flex gap-1.5">
                <button onClick={handleImport} className="flex-1 px-2 py-1 bg-[#00FF88] text-[#050505] text-[11px] rounded font-medium">Import</button>
                <button onClick={() => { setImporting(false); setImportError(""); }} className="px-2 py-1 text-white/30 text-[11px] hover:text-white/60">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="border-t border-white/5">
              <button
                onClick={() => setImporting(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/40 hover:text-[#00FF88] hover:bg-[#00FF88]/5 transition-colors"
              >
                <span>↓</span>
                <span>Import Wallet</span>
              </button>
              <Link
                href="/onboarding"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#00FF88]/60 hover:text-[#00FF88] hover:bg-[#00FF88]/5 transition-colors"
              >
                <span>+</span>
                <span>Create New Wallet</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
