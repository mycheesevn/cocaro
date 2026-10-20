import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts, getPost } from "@/lib/blog";

const SITE_URL = "https://cocaro.synerworlds.com";

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: `${post.title} — Caro Online`,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.date,
    },
  };
}

function formatDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    inLanguage: "vi",
    author: { "@type": "Organization", name: "PacClone", url: SITE_URL },
    publisher: { "@type": "Organization", name: "PacClone", url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  };

  return (
    <main className="xq-blog-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="xq-blog-header">
        <Link href="/blog" className="xq-blog-home">
          ← Tất cả bài viết
        </Link>
        <h1>{post.title}</h1>
        <div className="xq-blog-meta">
          <span>{formatDate(post.date)}</span>
          <span>·</span>
          <span>{post.readingMinutes} phút đọc</span>
        </div>
      </header>
      <article
        className="xq-blog-article"
        dangerouslySetInnerHTML={{ __html: post.html }}
      />
      <footer className="xq-blog-cta">
        <p>Đọc xong rồi — vào thực hành ngay!</p>
        <Link href="/" className="xq-blog-cta-btn">
          ♟️ Chơi caro miễn phí
        </Link>
      </footer>
    </main>
  );
}
