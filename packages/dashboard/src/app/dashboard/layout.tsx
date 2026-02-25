"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet } from "@/lib/wallet";
import ChainSelector from "@/components/ChainSelector";
import WalletSelector from "@/components/WalletSelector";
import { ViewChainProvider, useViewChain } from "@/lib/view-chain";

const NEON = "#00FF88";

const NAV_ITEMS = [
  { label: "Overview", href: "/dashboard", icon: "📊" },
  { label: "Evaluate", href: "/dashboard/evaluate", icon: "🔍" },
  { label: "Activity", href: "/dashboard/activity", icon: "📋" },
  { label: "Policies", href: "/dashboard/policy", icon: "🛡️" },
  { label: "Agent Access", href: "/dashboard/agent-access", icon: "🤖" },
  { label: "Recovery", href: "/dashboard/recovery", icon: "🔄" },
  { label: "Upgrades", href: "/dashboard/upgrades", icon: "⬆️" },
  { label: "Emergency", href: "/dashboard/emergency", icon: "🚨" },
];

const BOTTOM_NAV = [
  { label: "Pricing", href: "/pricing", icon: "💰" },
  { label: "Docs", href: "/docs", icon: "📖" },
  { label: "Home", href: "/", icon: "🏠" },
];

function SigilConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="relative px-5 py-2.5 rounded-xl text-sm font-semibold text-[#050505] transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: `linear-gradient(135deg, #00CC6A 0%, ${NEON} 100%)`,
                      boxShadow: `0 0 20px ${NEON}40, 0 0 40px ${NEON}20`,
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span>⚡</span>
                      Connect Wallet
                    </span>
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button onClick={openChainModal} type="button"
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30"
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all hover:bg-white/[0.04]"
                  style={{ borderColor: `${NEON}30`, color: NEON }}
                >
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: NEON }} />
                  {account.displayName}
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

function DashboardNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { googleUser } = useWallet();
  const { viewChainId, setViewChainId } = useViewChain();

  return (
    <div className="min-h-screen bg-[#050505] flex">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 h-full w-56 border-r border-white/5 bg-[#050505] flex flex-col z-40">
        {/* Logo */}
        <div className="px-5 h-16 flex items-center border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <Image src="/sigil-symbol.svg" alt="Sigil" width={32} height={32} />
            <span className="font-display text-[20px] tracking-[0.25em] uppercase">SIGIL</span>
          </Link>
        </div>

        {/* Chain Selector */}
        <div className="px-3 py-3 border-b border-white/5">
          <ChainSelector chainId={viewChainId} onChange={setViewChainId} />
        </div>

        {/* Sigil Wallet Selector */}
        <div className="px-3 py-3 border-b border-white/5">
          <WalletSelector chainId={viewChainId} />
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  isActive
                    ? "text-[#050505] font-medium"
                    : "text-white/50 hover:text-white/80 hover:bg-white/[0.03]"
                }`}
                style={isActive ? { backgroundColor: NEON } : undefined}
              >
                <span className="text-sm">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Links */}
        <div className="px-3 py-3 border-t border-white/5 space-y-0.5">
          {BOTTOM_NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white/30 hover:text-white/60 hover:bg-white/[0.03] transition-colors"
            >
              <span className="text-sm">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-56">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
          <div className="px-6 h-16 flex items-center justify-end gap-3">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
              style={{ backgroundColor: `${NEON}10`, border: `1px solid ${NEON}30`, color: NEON }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: NEON }} />
              Guardian Online
            </div>
            {googleUser && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/5">
                {googleUser.avatar_url && (
                  <img src={googleUser.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                )}
                <span className="text-xs text-white/40 truncate max-w-[120px]">{googleUser.name || googleUser.email}</span>
              </div>
            )}
            <SigilConnectButton />
          </div>
        </header>

        {/* Page Content */}
        <main className="px-6 py-6">
          {children}
        </main>
      </div>
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
