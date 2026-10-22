import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Any *.vercel.app host permanently redirects to the canonical
      // host, preserving path + query (old links keep working).
      {
        source: "/:path*",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        destination: "https://cocaro.synerworlds.com/:path*",
        permanent: true,
      },
      // The blog lives on the SynerWorlds hub — permanent redirects
      // (existing /blog routes are left in place, like Chess/PacClone;
      // redirects take precedence so old links keep working). No Caro
      // guide exists on the hub yet, so every local post lands on the
      // Cờ Ca-rô category list (which renders its empty state until
      // the bilingual guides are imported there).
      {
        source: "/blog/how-to-play-caro",
        destination: "https://synerworlds.com/blog?cat=co-ca-ro",
        permanent: true,
      },
      {
        source: "/blog/huong-dan-toan-tap-cac-tinh-nang",
        destination: "https://synerworlds.com/blog?cat=co-ca-ro",
        permanent: true,
      },
      {
        source: "/blog",
        destination: "https://synerworlds.com/blog?cat=co-ca-ro",
        permanent: true,
      },
      {
        source: "/blog/:slug",
        destination: "https://synerworlds.com/blog?cat=co-ca-ro",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
