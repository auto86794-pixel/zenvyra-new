import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const homeLastModified = new Date("2026-10-08");
  const legalLastModified = new Date("2026-09-05");

  return [
    {
      url: "https://www.zenvyra.hu/",
      lastModified: homeLastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://www.zenvyra.hu/adatkezeles",
      lastModified: legalLastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: "https://www.zenvyra.hu/felhasznalasi-feltetelek",
      lastModified: legalLastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
