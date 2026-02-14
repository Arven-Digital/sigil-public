"use client";

import Link from "next/link";
import Image from "next/image";

const NEON = "#00FF88";

const INCLUDED = [
  "ERC-4337 smart account deployment",
  "3-layer transaction validation pipeline",
  "AI risk scoring on every transaction",
  "Session key management",
  "Emergency freeze & withdrawal",
  "Social recovery (N-of-M guardians)",
  "Token allowance policies",
  "DeFi whitelist bundles",
  "UUPS upgradeable architecture",
  "Eliza plugin + TypeScript SDK",
  "REST API access",
  "Guardian co-signing service",
];

const CHAIN_FEES = [
  { chain: "Avalanche", token: "AVAX", fee: "0.2", icon: "🔺" },
  { chain: "Base", token: "ETH", fee: "0.00006", icon: "🔵" },
  { chain: "Arbitrum", token: "ETH", fee: "0.00006", icon: "🔷" },
  { chain: "0G Mainnet", token: "A0GI", fee: "2.0", icon: "⚡" },
];

const COST_BREAKDOWN = [
  {
    label: "Contract Deployment",
    cost: "Gas + Fee",
    note: "One-time gas cost + protocol fee to deploy your smart account via CREATE2. Fee varies by chain.",
  },
  {
    label: "Session Key Creation",
    cost: "Small fee",
    note: "Per session key — prevents spam creation of ephemeral keys. Covers infrastructure costs",
  },
  {
    label: "Recovery Initiation",
    cost: "Small fee",
    note: "Per recovery request — prevents griefing attacks on the recovery system. Refunded if cancelled",
  },
  {
    label: "Transaction Validation",
    cost: "~$0.003/tx",
    note: "Simulation (~$0.002) + AI scoring (~$0.001) — paid by protocol, not you",
  },
  {
    label: "Ongoing Costs",
    cost: "Gas only",
    note: "Standard gas fees for your transactions. No subscriptions, no hidden fees",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/sigil-symbol.svg" alt="Sigil" width={36} height={36} />
            <span className="font-display text-[22px] tracking-[0.25em] uppercase">SIGIL</span>
          </Link>
          <Link
            href="/onboarding"
            className="px-4 py-1.5 rounded-md text-[#050505] font-medium text-sm transition-all hover:brightness-110"
            style={{ backgroundColor: NEON }}
          >
            Deploy Wallet
          </Link>
        </div>
      </nav>

      <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: NEON }}>Pricing</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            One fee. Full access.
            <br />
            <span style={{ color: NEON }}>No subscriptions.</span>
          </h1>
          <p className="text-white/40 text-lg max-w-xl mx-auto leading-relaxed">
            Pay once when you deploy. Every feature included. Your wallet, your keys, your rules — we just keep it safe.
          </p>
        </div>

        {/* Chain Fees */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {CHAIN_FEES.map(c => (
            <div key={c.chain} className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center hover:border-white/10 transition-colors">
              <div className="text-2xl mb-2">{c.icon}</div>
              <div className="font-semibold text-sm mb-1">{c.chain}</div>
              <div className="font-mono text-xl font-bold mb-1" style={{ color: NEON }}>{c.fee}</div>
              <div className="text-[11px] text-white/30">{c.token} · one-time</div>
            </div>
          ))}
        </div>

        {/* Main Pricing Card */}
        <div className="rounded-xl border bg-gradient-to-b from-[#00FF88]/5 to-white/[0.01] p-10 mb-8 text-center relative" style={{ borderColor: `${NEON}20` }}>
          <div
            className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-[#050505] text-xs rounded-full font-medium"
            style={{ backgroundColor: NEON }}
          >
            One-time deployment · No subscriptions
          </div>

          <div className="flex items-baseline justify-center gap-2 mb-1 mt-4">
            <span className="text-4xl md:text-5xl font-bold">Pay once.</span>
          </div>
          <p className="text-white/30 text-sm mb-8">Deploy fee varies by chain. Every feature included forever.</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-left max-w-2xl mx-auto mb-8">
            {INCLUDED.map(f => (
              <div key={f} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 shrink-0" style={{ color: NEON }}>✓</span>
                <span className="text-white/60">{f}</span>
              </div>
            ))}
          </div>

          <Link
            href="/onboarding"
            className="inline-flex px-8 py-3.5 rounded-lg text-[#050505] font-semibold text-[15px] transition-all hover:brightness-110 hover:scale-[1.02]"
            style={{ backgroundColor: NEON }}
          >
            Deploy Your Wallet →
          </Link>
        </div>

        {/* Why on-chain */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 mb-8">
          <h2 className="text-xl font-bold mb-6">Why on-chain fees, not subscriptions?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-[14px] mb-2" style={{ color: NEON }}>You already have a wallet</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                You&apos;re deploying an on-chain smart account. You already have AVAX. Why add Stripe, credit cards, and subscription management to the mix?
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[14px] mb-2" style={{ color: NEON }}>Zero recurring costs</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                Deploy once, use forever. No monthly billing, no annual renewals, no &quot;your card expired&quot; emails. The smart account is yours permanently.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[14px] mb-2" style={{ color: NEON }}>Transparent & verifiable</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                The fee is enforced by the factory contract on-chain. You can verify it yourself — no hidden charges, no price changes without your consent.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[14px] mb-2" style={{ color: NEON }}>Guardian validation is on us</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                The 3-layer validation pipeline (rules, simulation, AI scoring) costs ~$0.003/tx to run. We absorb that cost — it&apos;s included in your deployment fee.
              </p>
            </div>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 mb-8">
          <h2 className="text-xl font-bold mb-6">Cost breakdown</h2>
          <div className="space-y-4">
            {COST_BREAKDOWN.map(item => (
              <div key={item.label} className="flex items-start justify-between gap-4 py-3 border-b border-white/5 last:border-0">
                <div>
                  <div className="font-medium text-[14px]">{item.label}</div>
                  <div className="text-[12px] text-white/30 mt-0.5">{item.note}</div>
                </div>
                <div className="font-mono text-[14px] shrink-0" style={{ color: NEON }}>{item.cost}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
            <div>
              <div className="font-bold text-[15px]">Total to get started</div>
              <div className="text-[12px] text-white/30">Deploy fee + gas, one-time per chain</div>
            </div>
            <div className="font-mono font-bold text-xl" style={{ color: NEON }}>Fee + Gas</div>
          </div>
        </div>

        {/* FAQ-style */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8">
          <h2 className="text-xl font-bold mb-6">Common questions</h2>
          <div className="space-y-5">
            {[
              {
                q: "Can the deployment fee change?",
                a: "The fee is set by the factory contract owner per chain and has a hard cap enforced on-chain. Any changes are publicly visible on the blockchain.",
              },
              {
                q: "Are there per-transaction fees?",
                a: "No. You only pay standard Avalanche gas fees for your own transactions. Guardian validation costs are absorbed by the protocol.",
              },
              {
                q: "What if I deploy on multiple chains?",
                a: "Each chain deployment is a separate one-time fee. Deploy on Avalanche now, add Base or Arbitrum later — each is independent.",
              },
              {
                q: "Is there a free tier?",
                a: "The first 100 users with a valid referral code get free deployment (protocol fee waived). Gas costs still apply.",
              },
            ].map(item => (
              <div key={item.q}>
                <h3 className="font-semibold text-[14px] mb-1.5">{item.q}</h3>
                <p className="text-[13px] text-white/40 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Non-Custodial */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 mt-8">
          <h2 className="text-xl font-bold mb-4">🔐 Non-custodial by design</h2>
          <p className="text-[13px] text-white/40 leading-relaxed mb-4">
            Your owner key, agent key, session keys, and recovery guardians are generated and stored entirely on your side. We never see, store, or have access to any of your private keys.
          </p>
          <p className="text-[13px] text-white/40 leading-relaxed">
            The only key we operate is the <strong className="text-white/70">Guardian co-signer</strong> — a validation key that can only co-sign transactions <em>after</em> they pass all three security layers. It cannot initiate transactions, move funds, change ownership, or act unilaterally. If our servers go offline, your wallet still works — emergency controls are owner-only on-chain functions.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <p className="text-white/30 text-sm mb-6">Ready to secure your agent&apos;s wallet?</p>
          <Link
            href="/onboarding"
            className="inline-flex px-8 py-3.5 rounded-lg text-[#050505] font-semibold text-[15px] transition-all hover:brightness-110 hover:scale-[1.02]"
            style={{ backgroundColor: NEON }}
          >
            Deploy Your Wallet →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-[12px] text-white/25">
          <div className="flex items-center gap-3">
            <Image src="/sigil-symbol.svg" alt="Sigil" width={20} height={20} className="opacity-50" />
            <span className="font-display tracking-[0.2em] uppercase">SIGIL</span>
            <span>— Arven Digital</span>
          </div>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
            <a href="mailto:hello@efe.observer" className="hover:text-white/60 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
