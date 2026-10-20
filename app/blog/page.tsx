import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";

const SITE_URL = "https://cocaro.synerworlds.com";

export const metadata: Metadata = {
  title: "Caro guides — Caro Online",
  description:
    "Bài hướng dẫn chơi caro cho người mới, khai cuộc, chiến thuật và mẹo tàn cuộc. Học caro miễn phí, song ngữ Việt - Anh.",
  keywords: ["hướng dẫn caro", "học chơi caro", "khai cuộc caro", "mẹo caro"],
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: "Caro guides — Caro Online",
    description:
      "Bài hướng dẫn chơi caro cho người mới, khai cuộc, chiến thuật và mẹo tàn cuộc.",
    url: `${SITE_URL}/blog`,
    type: "website",
  },
};

function formatDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default function BlogIndex() {
  const posts = getAllPosts();
  return (
    <main className="xq-blog-page">
      <header className="xq-blog-header">
        <Link href="/" className="xq-blog-home">
          ← Caro Online
        </Link>
        <h1>📖 Caro guides</h1>
        <p>
          Bài viết hướng dẫn từ cơ bản đến nâng cao — đọc xong vào{" "}
          <Link href="/">chơi ngay</Link> để luyện tập.
        </p>
      </header>
      <div className="xq-blog-list">
        {posts.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="xq-blog-card">
            <h2>{p.title}</h2>
            <p>{p.description}</p>
            <div className="xq-blog-meta">
              <span>{formatDate(p.date)}</span>
              <span>·</span>
              <span>{p.readingMinutes} phút đọc</span>
            </div>
          </Link>
        ))}
        {posts.length === 0 && <p>Chưa có bài viết nào.</p>}
      </div>
    </main>
  );
}
