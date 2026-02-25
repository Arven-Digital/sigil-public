import fs from "fs";
import path from "path";

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  author: string;
  tags: string[];
  content: string;
  readingTime: number;
}

const BLOG_DIR = path.join(process.cwd(), "src/content/blog");

function parseFrontmatter(raw: string): { meta: Record<string, any>; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };

  const meta: Record<string, any> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("[")) {
      try { meta[key] = JSON.parse(val); } catch { meta[key] = val; }
    } else {
      meta[key] = val;
    }
  }
  return { meta, content: match[2].trim() };
}

function estimateReadingTime(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 230));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Strip raw HTML tags (script, iframe, event handlers) from markdown content
function stripDangerousHtml(s: string): string {
  return s
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s>][\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s>][\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s>][\s\S]*?>/gi, '')
    .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript\s*:/gi, '');
}

// Simple markdown to HTML
function markdownToHtml(md: string): string {
  let html = stripDangerousHtml(md)
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre class="code-block"><code class="language-${lang}">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim()}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="rounded-lg my-6" />')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[#00FF88] hover:underline">$1</a>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    // Tables
    .replace(/\n\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, (_m, header, body) => {
      const ths = header.split("|").map((h: string) => `<th class="px-4 py-2 text-left text-white/60 text-[13px] border-b border-white/10">${h.trim()}</th>`).join("");
      const rows = body.trim().split("\n").map((row: string) => {
        const tds = row.replace(/^\||\|$/g, "").split("|").map((c: string) => `<td class="px-4 py-2 text-[13px] text-white/50 border-b border-white/5">${c.trim()}</td>`).join("");
        return `<tr>${tds}</tr>`;
      }).join("");
      return `<table class="w-full my-6 border-collapse"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    });

  // Process line by line for headings, lists, paragraphs
  const lines = html.split("\n");
  const result: string[] = [];
  let inList = false;
  let listType = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip if already HTML block
    if (line.startsWith("<pre") || line.startsWith("<table") || line.startsWith("<img")) {
      if (inList) { result.push(`</${listType}>`); inList = false; }
      result.push(line);
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      if (inList) { result.push(`</${listType}>`); inList = false; }
      const level = hMatch[1].length;
      const cls = level === 1 ? "text-3xl md:text-4xl font-bold mb-6 mt-8" :
                  level === 2 ? "text-2xl font-bold mb-4 mt-10" :
                  level === 3 ? "text-xl font-semibold mb-3 mt-8" :
                  "text-lg font-semibold mb-2 mt-6";
      result.push(`<h${level} class="${cls}">${hMatch[2]}</h${level}>`);
      continue;
    }

    // Unordered list
    if (line.match(/^[-*]\s+/)) {
      if (!inList || listType !== "ul") {
        if (inList) result.push(`</${listType}>`);
        result.push('<ul class="list-disc list-inside space-y-2 my-4 text-white/50">');
        inList = true; listType = "ul";
      }
      result.push(`<li>${line.replace(/^[-*]\s+/, "")}</li>`);
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      if (!inList || listType !== "ol") {
        if (inList) result.push(`</${listType}>`);
        result.push('<ol class="list-decimal list-inside space-y-2 my-4 text-white/50">');
        inList = true; listType = "ol";
      }
      result.push(`<li>${line.replace(/^\d+\.\s+/, "")}</li>`);
      continue;
    }

    if (inList) { result.push(`</${listType}>`); inList = false; }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      result.push('<hr class="border-white/10 my-8" />');
      continue;
    }

    // Empty line
    if (line.trim() === "") continue;

    // Paragraph
    result.push(`<p class="text-white/50 leading-relaxed mb-4">${line}</p>`);
  }

  if (inList) result.push(`</${listType}>`);
  return result.join("\n");
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  const files = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith(".md"));
  return files.map(file => {
    const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    return {
      slug: file.replace(/\.md$/, ""),
      title: meta.title || "Untitled",
      date: meta.date || "2026-01-01",
      excerpt: meta.excerpt || "",
      author: meta.author || "Sigil Team",
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      content: markdownToHtml(content),
      readingTime: estimateReadingTime(content),
    };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return getAllPosts().find(p => p.slug === slug);
}
