import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-09-05");

  return [
    {
      url: "https://www.zenvyra.hu",
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://www.zenvyra.hu/adatkezeles",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: "https://www.zenvyra.hu/felhasznalasi-feltetelek",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
