import Link from "next/link";
import { Fraunces } from "next/font/google";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["800"], display: "swap" });
const NEON = "#00FF88";

export async function generateStaticParams() {
  return getAllPosts().map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: `${post.title} — Sigil Protocol`,
    description: post.excerpt,
    alternates: { canonical: `https://sigil.codes/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const shareUrl = `https://sigil.codes/blog/${slug}`;
  const shareText = encodeURIComponent(`${post.title} — @sigilcodes`);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    author: { "@type": "Organization", name: "Sigil Protocol" },
    publisher: { "@type": "Organization", name: "Sigil Protocol", url: "https://sigil.codes" },
    url: shareUrl,
  };

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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Article */}
      <article className="pt-32 pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          {/* Back link */}
          <Link href="/blog" className="inline-flex items-center gap-2 text-[13px] text-white/30 hover:text-white/60 transition-colors mb-8">
            ← Back to Blog
          </Link>

          {/* Meta */}
          <div className="flex items-center gap-3 mb-4 text-[12px] text-white/30">
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </time>
            <span>·</span>
            <span>{post.readingTime} min read</span>
            <span>·</span>
            <span>{post.author}</span>
          </div>

          {/* Tags */}
          {post.tags.length > 0 && (
            <div className="flex gap-2 mb-8">
              {post.tags.map(tag => (
                <span key={tag} className="px-2.5 py-0.5 rounded-full text-[11px] border" style={{ borderColor: `${NEON}20`, color: `${NEON}90` }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Content */}
          <div
            className="prose-sigil"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* Share */}
          <div className="mt-12 pt-8 border-t border-white/10">
            <div className="flex items-center gap-4">
              <span className="text-[13px] text-white/30">Share:</span>
              <a
                href={`https://x.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-[13px] text-white/50 hover:text-white hover:border-white/20 transition-all"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                Post on X
              </a>
            </div>
          </div>

          {/* Back */}
          <div className="mt-8">
            <Link href="/blog" className="text-[13px] font-medium hover:underline" style={{ color: NEON }}>
              ← All posts
            </Link>
          </div>
        </div>
      </article>

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
