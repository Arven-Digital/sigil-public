"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet } from "@/lib/wallet";
import ChainSelector from "@/components/ChainSelector";
import { ViewChainProvider, useViewChain } from "@/lib/view-chain";

const NEON = "#00FF88";

const NAV_ITEMS = [
  { label: "Overview", href: "/dashboard" },
  { label: "Evaluate", href: "/dashboard/evaluate" },
  { label: "Activity", href: "/dashboard/activity" },
  { label: "Policies", href: "/dashboard/policy" },
  { label: "Agent Access", href: "/dashboard/agent-access" },
  { label: "Emergency", href: "/dashboard/emergency" },
  { label: "Pricing", href: "/pricing" },
];

function DashboardNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { googleUser } = useWallet();
  const { viewChainId, setViewChainId } = useViewChain();

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Top Nav */}
      <nav className="border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-3">
              <Image src="/sigil-symbol.svg" alt="Sigil" width={44} height={44} />
              <span className="font-display text-[28px] tracking-[0.25em] uppercase">SIGIL</span>
            </Link>
            <ChainSelector chainId={viewChainId} onChange={setViewChainId} />
            <div className="flex items-center gap-1">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                    pathname === item.href
                      ? "text-[#050505] font-medium"
                      : "text-white/40 hover:text-white/70"
                  }`}
                  style={pathname === item.href ? { backgroundColor: NEON } : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{ backgroundColor: `${NEON}10`, border: `1px solid ${NEON}30`, color: NEON }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: NEON }} />
              Guardian Online
            </div>
            {googleUser && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5">
                {googleUser.avatar_url && (
                  <img src={googleUser.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                )}
                <span className="text-sm text-white/40 truncate max-w-[120px]">{googleUser.name || googleUser.email}</span>
              </div>
            )}
            <ConnectButton accountStatus="address" chainStatus="none" showBalance={false} />
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewChainProvider>
      <DashboardNav>{children}</DashboardNav>
    </ViewChainProvider>
  );
}
