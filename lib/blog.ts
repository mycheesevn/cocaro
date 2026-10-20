import fs from "fs";
import path from "path";

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  keywords: string[];
  html: string;
  readingMinutes: number;
}

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  let body = raw;
  if (raw.startsWith("---")) {
    const end = raw.indexOf("---", 3);
    if (end > 0) {
      const fm = raw.slice(3, end).trim();
      body = raw.slice(end + 3).trim();
      for (const line of fm.split("\n")) {
        const i = line.indexOf(":");
        if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
    }
  }
  return { meta, body };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(md: string): string {
  let s = escapeHtml(md);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

// Minimal markdown → HTML: headings, lists, quotes, code blocks, paragraphs.
export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  let inCode = false;
  let codeBuf: string[] = [];

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    const t = line.trim();
    if (!t) {
      closeList();
      continue;
    }
    if (t.startsWith("> ")) {
      closeList();
      out.push(`<blockquote>${inline(t.slice(2))}</blockquote>`);
      continue;
    }
    const h3 = t.match(/^###\s+(.*)/);
    const h2 = t.match(/^##\s+(.*)/);
    const h1 = t.match(/^#\s+(.*)/);
    if (h3 || h2 || h1) {
      closeList();
      const m = (h3 || h2 || h1)!;
      const lvl = h3 ? 3 : h2 ? 2 : 1;
      out.push(`<h${lvl}>${inline(m[1])}</h${lvl}>`);
      continue;
    }
    const li = t.match(/^[-*]\s+(.*)/);
    if (li) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    const ol = t.match(/^\d+\.\s+(.*)/);
    if (ol) {
      closeList();
      out.push(`<p class="xq-blog-ol">${inline(ol[1])}</p>`);
      continue;
    }
    closeList();
    out.push(`<p>${inline(t)}</p>`);
  }
  closeList();
  return out.join("\n");
}

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"));
  const posts = files.map((f) => {
    const raw = fs.readFileSync(path.join(BLOG_DIR, f), "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    const html = markdownToHtml(body);
    const words = body.split(/\s+/).length;
    return {
      slug: f.replace(/\.md$/, ""),
      title: meta.title || f,
      description: meta.description || "",
      date: meta.date || "2026-01-01",
      keywords: (meta.keywords || "").split(",").map((k) => k.trim()).filter(Boolean),
      html,
      readingMinutes: Math.max(1, Math.round(words / 200)),
    };
  });
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): BlogPost | null {
  return getAllPosts().find((p) => p.slug === slug) || null;
}
