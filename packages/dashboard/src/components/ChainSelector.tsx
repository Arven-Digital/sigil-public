"use client";

import { useState, useRef, useEffect } from "react";

const CHAINS = [
  { id: 43114, name: "Avalanche C-Chain", color: "#E84142", enabled: true },
  { id: 8453, name: "Base", color: "#0052FF", enabled: true },
  { id: 42161, name: "Arbitrum", color: "#28A0F0", enabled: true },
  { id: 16661, name: "0G Mainnet", color: "#00D4AA", enabled: true },
  { id: 43113, name: "Avalanche Fuji", color: "#F4A524", enabled: true },
] as const;

interface ChainSelectorProps {
  chainId: number;
  onChange: (chainId: number) => void;
}

export default function ChainSelector({ chainId, onChange }: ChainSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = CHAINS.find((c) => c.id === chainId) ?? CHAINS[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-sm"
      >
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: current.color }} />
        <span className="text-white/70">{current.name}</span>
        <svg className={`w-3 h-3 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-white/5 bg-[#0a0a0a] shadow-xl z-50 py-1">
          {CHAINS.map((chain) => (
            <button
              key={chain.id}
              disabled={!chain.enabled}
              onClick={() => {
                if (chain.enabled) {
                  onChange(chain.id);
                  setOpen(false);
                }
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                chain.enabled
                  ? chain.id === chainId
                    ? "text-[#00FF88] bg-[#00FF88]/5"
                    : "text-white/70 hover:bg-white/[0.05]"
                  : "text-white/20 cursor-not-allowed"
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: chain.enabled ? chain.color : "#333" }} />
              <span>{chain.name}</span>
              {!chain.enabled && <span className="ml-auto text-xs text-white/20">coming</span>}
              {chain.enabled && chain.id === chainId && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
