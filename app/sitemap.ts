import type { MetadataRoute } from "next";

// The blog lives on the SynerWorlds hub — no local /blog URLs here.
const SITE_URL = "https://cocaro.synerworlds.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
