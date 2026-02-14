"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

function parseMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-xl font-semibold text-white mt-8 mb-3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold text-white mt-10 mb-4">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-3xl font-bold text-white mt-6 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 text-white/40">• $1</li>')
    .replace(/^(?!<[hl]|<li|<str)(.+)$/gm, '<p class="text-white/40 mb-3 leading-relaxed">$1</p>')
    .replace(/<\/li>\n<li/g, '</li><li')
    .replace(new RegExp('(<li.*?<\\/li>)', 'gs'), '<ul class="mb-4 space-y-1">$1</ul>')
    .replace(/(<\/ul>\s*<ul[^>]*>)/g, '')
    .replace(/<p class="text-white\/40 mb-3 leading-relaxed"><\/p>/g, '');
}

export default function MarkdownPage({ file, title }: { file: string; title: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    fetch(file)
      .then((r) => r.text())
      .then((md) => setHtml(parseMarkdown(md)));
  }, [file]);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5 max-w-4xl mx-auto">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Image src="/sigil-symbol.svg" alt="Sigil" width={36} height={36} />
          <span className="font-display text-[22px] tracking-[0.25em] uppercase">SIGIL</span>
        </Link>
        <Link href="/" className="text-sm text-white/40 hover:text-white transition-colors">
          ← Back to Home
        </Link>
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </main>
      <footer className="py-8 px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-white/25">
          <div className="flex items-center gap-3">
            <Image src="/sigil-symbol.svg" alt="Sigil" width={20} height={20} className="opacity-50" />
            <span className="font-display tracking-[0.2em] uppercase text-[13px]">SIGIL</span>
            <span>— Arven Digital</span>
          </div>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-white/60 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
