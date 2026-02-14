"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet } from "@/lib/wallet";

const links = [
  { href: "/dashboard", label: "Overview", icon: "📊" },
  { href: "/dashboard/activity", label: "Activity", icon: "📋" },
  { href: "/dashboard/policy", label: "Policy", icon: "⚙️" },
  { href: "/dashboard/recovery", label: "Recovery", icon: "🛡️" },
  { href: "/dashboard/upgrades", label: "Upgrades", icon: "⬆️" },
  { href: "/dashboard/emergency", label: "Emergency", icon: "🚨" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { isAuthenticated } = useWallet();

  return (
    <aside className="w-64 min-h-screen bg-gray-950 border-r border-gray-800 p-4 flex flex-col">
      <Link href="/" className="text-xl font-bold gradient-text mb-6 block">
        <img src="/sigil-symbol.svg" alt="Sigil" style={{width:"24px",height:"24px",display:"inline"}} /> Sigil
      </Link>

      <div className="mb-6">
        <ConnectButton showBalance={false} accountStatus="address" chainStatus="icon" />
      </div>

      {isAuthenticated && (
        <div className="mb-4 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
          <div className="text-xs text-green-400">✓ Authenticated (SIWE)</div>
        </div>
      )}

      <nav className="flex flex-col gap-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              <span>{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-4 border-t border-gray-800 text-xs text-gray-600">
        Sigil Protocol v0.1.0
      </div>
    </aside>
  );
}
