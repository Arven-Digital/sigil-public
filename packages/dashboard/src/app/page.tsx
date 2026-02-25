import Link from "next/link";
import { Fraunces } from "next/font/google";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["800"], display: "swap" });
const NEON = "#00FF88";

// Chain deployment fees (native token amounts)
const CHAIN_FEES = [
  { chain: "Ethereum", token: "ETH", deployFee: "0.003", icon: "🔷" },
  { chain: "Polygon", token: "POL", deployFee: "10", icon: "🟣" },
  { chain: "Avalanche", token: "AVAX", deployFee: "0.5", icon: "🔺" },
  { chain: "Base", token: "ETH", deployFee: "0.003", icon: "🔵" },
  { chain: "Arbitrum", token: "ETH", deployFee: "0.003", icon: "⚪" },
  { chain: "0G Mainnet", token: "A0GI", deployFee: "1.0", icon: "⚡" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white antialiased">
      {/* ─── Nav ─── */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src="/sigil-symbol.svg" alt="Sigil" className="w-14 h-14" />
            <span className={`${fraunces.className} text-[30px] tracking-[0.25em] uppercase`}>SIGIL</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-[13px] text-white/50">
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#security" className="hover:text-white transition-colors">Security</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
            <a href="https://github.com/Arven-Digital/sigil-public" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <Link
              href="/login"
              className="px-4 py-1.5 rounded-md text-black font-medium transition-all hover:brightness-110"
              style={{ backgroundColor: NEON }}
            >
              Launch App
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-28 pb-28 px-6 overflow-hidden">
        {/* Video background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.20]">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
            src="/hero-bg.mp4"
          />
        </div>
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-transparent to-[#050505]" />
        <div className="absolute inset-0 bg-grid opacity-30" />

        <div className="relative max-w-3xl mx-auto text-center animate-fade-in-up">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[12px] font-medium mb-8 border"
            style={{ borderColor: `${NEON}30`, color: NEON, backgroundColor: `${NEON}08` }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: NEON }} />
            Live on 6 Chains
          </div>

          {/* Chain logos */}
          <div className="flex items-center justify-center gap-4 mb-8">
            {[
              { src: "/chains/ethereum.svg", name: "Ethereum" },
              { src: "/chains/polygon.svg", name: "Polygon" },
              { src: "/chains/avalanche.svg", name: "Avalanche" },
              { src: "/chains/base.svg", name: "Base" },
              { src: "/chains/arbitrum.svg", name: "Arbitrum" },
              { src: "/chains/0g.svg", name: "0G" },
            ].map((c) => (
              <div key={c.name} className="flex items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity" title={c.name}>
                <img src={c.src} alt={c.name} className="w-6 h-6 rounded-full" />
                <span className="text-[11px] text-white/40 hidden sm:inline">{c.name}</span>
              </div>
            ))}
          </div>

          <h1 className="text-[clamp(2.5rem,6vw,5rem)] font-bold leading-[1.08] tracking-tight mb-6">
            <span className="neon-glow" style={{ color: NEON }}>Agent wallets,</span>
            <br />
            on a leash.
          </h1>

          <p className="text-lg text-white/50 mb-10 max-w-xl mx-auto leading-relaxed animate-fade-in-up animate-delay-100">
            Three-layer validation on every transaction. Deterministic rules, simulation, AI risk scoring — all before a single wei moves.
          </p>

          <div className="flex items-center justify-center gap-3 animate-fade-in-up animate-delay-200">
            <Link
              href="/login"
              className="px-7 py-3.5 rounded-lg text-black font-semibold text-[15px] transition-all hover:brightness-110 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,255,136,0.3)]"
              style={{ backgroundColor: NEON }}
            >
              Deploy Your Wallet →
            </Link>
            <a
              href="#how-it-works"
              className="px-7 py-3.5 rounded-lg border border-white/10 text-white/70 font-medium text-[15px] transition-colors hover:border-white/25 hover:text-white"
            >
              How It Works
            </a>
          </div>

          {/* Trust metrics */}
          <div className="mt-16 flex items-center justify-center gap-8 text-[13px] text-white/25 animate-fade-in-up animate-delay-300">
            <div className="text-center">
              <div className="text-2xl font-bold text-white/60 font-mono">6</div>
              <div>Chains Live</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white/60 font-mono">3</div>
              <div>Security Layers</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white/60 font-mono">~700ms</div>
              <div>Validation Time</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold text-white/60 font-mono">$0</div>
              <div>Monthly Fee</div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeader
            tag="How It Works"
            title="Secure your agent in 60 seconds"
            desc="Connect, configure, deploy. Your AI agent gets a secured Sigil Wallet with policy guardrails built in."
          />

          <div className="grid md:grid-cols-3 gap-4 mt-14">
            {[
              {
                step: "01",
                title: "Deploy Your Sigil Wallet",
                desc: "Connect your wallet and deploy an ERC-4337 Sigil Wallet. This is the on-chain wallet that holds your funds and executes transactions.",
              },
              {
                step: "02",
                title: "Set Policies & Fund It",
                desc: "Pick a strategy template with spending limits, target whitelists, and token policies. Fund the Sigil Wallet — this is where your agent's budget lives.",
              },
              {
                step: "03",
                title: "Generate Agent API Key",
                desc: "Create an API key for your agent — this is for authentication only, not a wallet. Your agent submits transactions through the Guardian API; the Sigil account executes them.",
              },
            ].map((s, i) => (
              <div key={s.step} className={`card-gradient p-6 animate-fade-in-up animate-delay-${(i + 1) * 100}`}>
                <div className="text-[13px] font-mono font-bold mb-3" style={{ color: NEON }}>{s.step}</div>
                <h3 className="font-semibold text-[15px] mb-2">{s.title}</h3>
                <p className="text-[13px] text-white/40 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Code snippet */}
          <div className="mt-8 rounded-xl border border-white/5 bg-[#0A0A0A] p-5 max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[#F04452]/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#F4A524]/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#00FF88]/60" />
              <span className="text-[11px] text-white/20 ml-2 font-mono">OpenClaw / Eliza / Any Agent</span>
            </div>
            <pre className="text-[12px] font-mono text-white/60 leading-relaxed overflow-x-auto">
{`// OpenClaw — one command, verified on ClawdHub
clawdhub install sigil-security

// Eliza — npm plugin (13 actions)
import { sigilPlugin } from '@sigil-protocol/eliza';

// Any framework — TypeScript SDK
import { SigilSDK } from '@sigil-protocol/sdk';

// Universal — REST API
POST https://api.sigil.codes/v1/evaluate`}
            </pre>
          </div>
        </div>
      </section>

      {/* ─── OpenClaw Native ─── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="card-gradient p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[120px] opacity-10" style={{ backgroundColor: NEON }} />
            <div className="relative flex flex-col md:flex-row items-center gap-8">
              <div className="shrink-0">
                <img src="/integrations/openclaw.png" alt="OpenClaw" className="w-20 h-20 rounded-2xl" />
              </div>
              <div className="text-center md:text-left">
                <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-widest" style={{ color: NEON }}>OpenClaw Native</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{ borderColor: `${NEON}40`, color: NEON, backgroundColor: `${NEON}10` }}>Verified on ClawdHub</span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold mb-2">First-class OpenClaw integration</h3>
                <p className="text-[14px] text-white/40 leading-relaxed mb-4">
                  One command gives your OpenClaw agent secure wallet management — deploy wallets, evaluate transactions, manage session keys, and more. All through the 3-layer Guardian pipeline.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <code className="text-[13px] font-mono px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70">
                    clawdhub install sigil-security
                  </code>
                  <a
                    href="https://clawhub.ai/skills/sigil-security"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] font-medium hover:underline"
                    style={{ color: NEON }}
                  >
                    View on ClawdHub →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Compatible With ─── */}
      <section className="py-16 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: NEON }}>Compatible With</div>
            <p className="text-[14px] text-white/40">Works with the frameworks and tools you already use.</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            {[
              { src: "/integrations/openclaw.png", name: "OpenClaw", url: "https://openclaw.ai" },
              { src: "/integrations/eliza.png", name: "Eliza", url: "https://github.com/elizaOS/eliza" },
              { src: "/integrations/langchain.png", name: "LangChain", url: "https://langchain.com" },
              { src: "/integrations/crewai.png", name: "CrewAI", url: "https://crewai.com" },
              { src: "/integrations/autogpt.png", name: "AutoGPT", url: "https://autogpt.net" },
              { src: "/integrations/openai.png", name: "OpenAI Agents", url: "https://openai.com" },
              { src: "/integrations/metamask.png", name: "MetaMask", url: "https://metamask.io" },
              { src: "/integrations/walletconnect.png", name: "WalletConnect", url: "https://walletconnect.com" },
              { src: "/integrations/erc4337.png", name: "ERC-4337", url: "https://erc4337.io" },
            ].map((i) => (
              <a
                key={i.name}
                href={i.url}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-2 opacity-40 hover:opacity-90 transition-all hover:scale-110 group"
                title={i.name}
              >
                <img src={i.src} alt={i.name} className="w-10 h-10 rounded-lg grayscale group-hover:grayscale-0 transition-all" />
                <span className="text-[10px] text-white/30 group-hover:text-white/60 transition-colors">{i.name}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ─── For AI Agents ─── */}
      <section id="agents" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <SectionHeader
            tag="For AI Agents"
            title="Built for autonomous wallets, not humans clicking buttons"
            desc="Your agent gets a leash, not a blank check. Session keys with time limits, spend caps, and target restrictions."
          />

          <div className="grid md:grid-cols-2 gap-4 mt-14">
            {[
              {
                title: "Session Keys",
                desc: "Time-limited, scope-limited ephemeral keys. Your agent gets 4 hours and a spend cap — not the master key.",
                icon: "⚡",
              },
              {
                title: "Policy Engine",
                desc: "Per-tx limits, daily caps, target whitelist, function whitelist, token allowance policies. All enforced on-chain.",
                icon: "🔒",
              },
              {
                title: "Emergency Freeze",
                desc: "One call freezes everything. Withdraw funds even while frozen. The kill switch you hope you never need.",
                icon: "🧊",
              },
              {
                title: "Social Recovery",
                desc: "Lost your key? N-of-M trusted guardians recover your Sigil Wallet after a configurable safety delay.",
                icon: "🔄",
              },
              {
                title: "ERC-4337 Native",
                desc: "Sigil Wallet with gas abstraction. No private key needed by the agent — just a session key with guardrails.",
                icon: "⛓️",
              },
              {
                title: "UUPS Upgradeable",
                desc: "Upgrade your Sigil Wallet logic with 24h timelock + guardian co-sign. Future-proof without redeploying.",
                icon: "🔧",
              },
            ].map((f) => (
              <div key={f.title} className="card-gradient flex gap-4 p-5">
                <div className="text-xl mt-0.5 shrink-0">{f.icon}</div>
                <div>
                  <h3 className="font-semibold text-[14px] mb-1.5">{f.title}</h3>
                  <p className="text-[13px] text-white/40 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Polymarket Use Case ─── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <SectionHeader
            tag="Use Case: Prediction Markets"
            title="Secure your Polymarket agent"
            desc="AI agents trading on Polymarket need guardrails. Sigil deploys on Polygon with purpose-built limits for prediction markets."
          />

          <div className="grid md:grid-cols-3 gap-4 mt-14">
            {[
              {
                title: "Bet Limits",
                desc: "Cap per-trade size and daily volume. Your agent can't YOLO your entire bankroll on a single market.",
                icon: "🎲",
              },
              {
                title: "Contract Whitelist",
                desc: "Restrict your agent to verified Polymarket contracts only. No interacting with random tokens or drainers.",
                icon: "✅",
              },
              {
                title: "Emergency Kill Switch",
                desc: "Market going sideways? Freeze your agent instantly. Withdraw funds while frozen. You stay in control.",
                icon: "🧊",
              },
            ].map((f) => (
              <div key={f.title} className="card-gradient p-6">
                <div className="text-xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-[15px] mb-2">{f.title}</h3>
                <p className="text-[13px] text-white/40 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-black font-semibold text-[14px] hover:opacity-90 transition"
              style={{ backgroundColor: NEON }}
            >
              Deploy on Polygon →
            </Link>
            <p className="text-[12px] text-white/25 mt-3">10 POL deploy fee · Verified Polymarket contracts in registry</p>
          </div>
        </div>
      </section>

      {/* ─── 3-Layer Pipeline ─── */}
      <section id="security" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <SectionHeader
            tag="Security"
            title="Three layers. Zero trust."
            desc="Every transaction passes through all three layers before your Guardian co-signs. If any layer flags it, it's blocked."
          />

          <div className="mt-14 relative">
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-y-1/2" />

            <div className="grid md:grid-cols-3 gap-6 relative">
              {[
                {
                  layer: "Layer 1",
                  title: "Deterministic Rules",
                  desc: "Spending limits, target whitelist, function whitelist, velocity checks, token allowance policies.",
                  detail: "Instant · On-chain · $0",
                  color: "#3B82F6",
                },
                {
                  layer: "Layer 2",
                  title: "Transaction Simulation",
                  desc: "Dry-run the full transaction. Catches reverts, sandwich attacks, unexpected approvals, value drain.",
                  detail: "~200ms · $0.002/tx",
                  color: "#8B5CF6",
                },
                {
                  layer: "Layer 3",
                  title: "AI Risk Scoring",
                  desc: "LLM analyzes transaction context, target reputation, historical patterns. Scores 1–100.",
                  detail: "~500ms · $0.001/tx",
                  color: "#A855F7",
                },
              ].map((l) => (
                <div key={l.layer} className="relative card-gradient p-6">
                  <div className="text-[11px] font-mono font-bold mb-1" style={{ color: l.color }}>{l.layer}</div>
                  <h3 className="font-semibold text-[16px] mb-2">{l.title}</h3>
                  <p className="text-[13px] text-white/40 leading-relaxed mb-4">{l.desc}</p>
                  <div className="text-[11px] text-white/25 font-mono">{l.detail}</div>
                </div>
              ))}
            </div>

            <div className="text-center mt-6 text-[12px] text-white/25">
              Total validation: ~700ms · ~$0.003/transaction · All layers must pass
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" className="py-24 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <SectionHeader
            tag="Pricing"
            title="One fee. No subscriptions."
            desc="Pay once when you deploy. Every feature included. No monthly bills, no hidden charges."
          />

          <div className="mt-14 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CHAIN_FEES.map(c => (
              <div key={c.chain} className="card-gradient p-5 text-center">
                <div className="text-2xl mb-2">{c.icon}</div>
                <div className="font-semibold text-sm mb-1">{c.chain}</div>
                <div className="font-mono text-xl font-bold mb-1" style={{ color: NEON }}>{c.deployFee}</div>
                <div className="text-[11px] text-white/30">{c.token} · one-time</div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-center">
            <p className="text-[13px] text-white/30 mb-4">
              Includes: Sigil Wallet deployment, 3-layer validation, session keys, recovery, upgrades, SDK, API access.
              <br />Validation costs (~$0.003/tx) absorbed by protocol. You only pay gas.
            </p>
            <Link
              href="/pricing"
              className="text-[13px] font-medium hover:underline"
              style={{ color: NEON }}
            >
              Full pricing breakdown →
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Integrations ─── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <SectionHeader
            tag="Integrations"
            title="Drop-in security for your stack"
            desc="OpenClaw skill, Eliza plugin, TypeScript SDK, REST API. Integrate in minutes, not days."
          />

          <div className="grid md:grid-cols-5 gap-4 mt-14">
            {[
              { name: "OpenClaw Skill", desc: "Verified on ClawdHub. One command install for any OpenClaw agent.", tag: "✓ verified" },
              { name: "Eliza Plugin", desc: "13 actions, evaluator, wallet provider. npm install and go.", tag: "npm" },
              { name: "TypeScript SDK", desc: "Session keys, recovery, upgrades, token policies, multicall.", tag: "sdk" },
              { name: "REST API", desc: "Evaluate transactions, manage wallets, query status.", tag: "api" },
              { name: "MCP Server", desc: "Model Context Protocol tools for any AI agent framework.", tag: "mcp" },
            ].map((i) => (
              <div key={i.name} className="card-gradient p-5">
                <div className="text-[10px] font-mono uppercase tracking-widest mb-3" style={{ color: NEON }}>{i.tag}</div>
                <h3 className="font-semibold text-[14px] mb-1.5">{i.name}</h3>
                <p className="text-[12px] text-white/35 leading-relaxed">{i.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Non-Custodial ─── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <SectionHeader
            tag="Trust Model"
            title="Your keys never touch our servers."
            desc="Sigil is non-custodial by design. We validate transactions — we don't control wallets."
          />

          <div className="grid md:grid-cols-3 gap-4 mt-14">
            <div className="card-gradient p-6">
              <div className="text-xl mb-3">🔐</div>
              <h3 className="font-semibold text-[14px] mb-2">Your keys, your control</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                Origin Wallet key, Agent Wallet key, session keys, recovery guardians — all generated and stored on your side. We never see them.
              </p>
            </div>
            <div className="card-gradient p-6">
              <div className="text-xl mb-3">🛡️</div>
              <h3 className="font-semibold text-[14px] mb-2">Guardian validates, never initiates</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                The Guardian co-signer can only approve transactions <em>after</em> they pass all three security layers. It cannot move funds or act alone.
              </p>
            </div>
            <div className="card-gradient p-6">
              <div className="text-xl mb-3">🧊</div>
              <h3 className="font-semibold text-[14px] mb-2">You can always override</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">
                Emergency freeze, withdrawal, key rotation — all Origin Wallet-only on-chain functions. If our servers go offline, your Sigil Wallet still works.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Deploy in 5 minutes.
            <br />
            <span className="neon-glow" style={{ color: NEON }}>Sleep soundly tonight.</span>
          </h2>
          <p className="text-white/40 mb-8 text-[15px]">
            Connect wallet → Choose strategy → Deploy → Done.
          </p>
          <Link
            href="/login"
            className="inline-flex px-8 py-3.5 rounded-lg text-black font-semibold text-[15px] transition-all hover:brightness-110 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,255,136,0.3)]"
            style={{ backgroundColor: NEON }}
          >
            Get Started →
          </Link>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-[12px] text-white/25">
          <div className="flex items-center gap-2">
            <img src="/sigil-symbol.svg" alt="Sigil" className="w-5 h-5 opacity-50" />
            <span className={`${fraunces.className} tracking-[0.2em] uppercase`}>SIGIL</span>
            <span>— Arven Digital</span>
          </div>
          <div className="flex gap-6">
            <a href="https://github.com/Arven-Digital/sigil-public" target="_blank" rel="noreferrer" className="hover:text-white/60 transition-colors">GitHub</a>
            <a href="https://clawhub.ai/skills/sigil-security" target="_blank" rel="noreferrer" className="hover:text-white/60 transition-colors">ClawdHub</a>
            <Link href="/blog" className="hover:text-white/60 transition-colors">Blog</Link>
            <Link href="/docs" className="hover:text-white/60 transition-colors">Docs</Link>
            <Link href="/pricing" className="hover:text-white/60 transition-colors">Pricing</Link>
            <Link href="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
            <a href="mailto:hello@efe.observer" className="hover:text-white/60 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Reusable section header ─── */
function SectionHeader({ tag, title, desc }: { tag: string; title: string; desc: string }) {
  return (
    <div className="text-center">
      <div className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: NEON }}>{tag}</div>
      <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">{title}</h2>
      <p className="text-[14px] text-white/40 max-w-xl mx-auto leading-relaxed">{desc}</p>
    </div>
  );
}
