import Link from "next/link";
import { Fraunces } from "next/font/google";
import { getAllPosts } from "@/lib/blog";
import type { Metadata } from "next";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["800"], display: "swap" });
const NEON = "#00FF88";

export const metadata: Metadata = {
  title: "Blog — Sigil Protocol",
  description: "Technical articles on AI agent wallet security, smart account architecture, and the Sigil Protocol ecosystem.",
  alternates: { canonical: "https://sigil.codes/blog" },
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen bg-[#050505] text-white antialiased">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src="/sigil-symbol.svg" alt="Sigil" className="w-14 h-14" />
            <span className={`${fraunces.className} text-[30px] tracking-[0.25em] uppercase`}>SIGIL</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-[13px] text-white/50">
            <Link href="/#how-it-works" className="hover:text-white transition-colors">How It Works</Link>
            <Link href="/#security" className="hover:text-white transition-colors">Security</Link>
            <Link href="/#pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/blog" className="text-white transition-colors">Blog</Link>
            <a href="https://github.com/Arven-Digital/sigil-public" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <Link href="/login" className="px-4 py-1.5 rounded-md text-black font-medium transition-all hover:brightness-110" style={{ backgroundColor: NEON }}>
              Launch App
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-32 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-[11px] font-mono uppercase tracking-widest mb-3" style={{ color: NEON }}>Blog</div>
          <h1 className={`${fraunces.className} text-4xl md:text-5xl font-bold tracking-tight mb-4`}>
            Insights & Updates
          </h1>
          <p className="text-[15px] text-white/40 max-w-xl leading-relaxed">
            Technical deep-dives on AI agent security, smart account architecture, and building trust in autonomous systems.
          </p>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto grid gap-6">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="group">
              <article className="rounded-xl border border-white/5 bg-white/[0.02] p-6 md:p-8 transition-all hover:border-white/10 hover:bg-white/[0.04]">
                <div className="flex items-center gap-3 mb-3 text-[12px] text-white/30">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </time>
                  <span>·</span>
                  <span>{post.readingTime} min read</span>
                  {post.tags.length > 0 && (
                    <>
                      <span>·</span>
                      <div className="flex gap-2">
                        {post.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] border" style={{ borderColor: `${NEON}20`, color: `${NEON}90` }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-2 group-hover:text-[#00FF88] transition-colors">
                  {post.title}
                </h2>
                <p className="text-[14px] text-white/40 leading-relaxed line-clamp-2">
                  {post.excerpt}
                </p>
                <div className="mt-4 text-[13px] font-medium transition-colors" style={{ color: NEON }}>
                  Read more →
                </div>
              </article>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-[12px] text-white/25">
          <div className="flex items-center gap-2">
            <img src="/sigil-symbol.svg" alt="Sigil" className="w-5 h-5 opacity-50" />
            <span className={`${fraunces.className} tracking-[0.2em] uppercase`}>SIGIL</span>
            <span>— Arven Digital</span>
          </div>
          <div className="flex gap-6">
            <a href="https://github.com/Arven-Digital/sigil-public" target="_blank" rel="noreferrer" className="hover:text-white/60 transition-colors">GitHub</a>
            <Link href="/blog" className="hover:text-white/60 transition-colors">Blog</Link>
            <Link href="/docs" className="hover:text-white/60 transition-colors">Docs</Link>
            <Link href="/pricing" className="hover:text-white/60 transition-colors">Pricing</Link>
            <Link href="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
