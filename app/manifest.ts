import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zenvyra – Test és lélek harmóniában",
    short_name: "Zenvyra",
    description:
      "Személyre szabott támogatás táplálkozáshoz, mozgáshoz és a mindennapi jólléthez.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffdfc",
    theme_color: "#23473a",
    lang: "hu",
    icons: [
      {
        src: "/zenvyra-internal-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/zenvyra-internal-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
