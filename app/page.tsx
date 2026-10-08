import type { Metadata } from "next";
import HomeApp from "@/components/HomeApp";
import LandingContent from "@/components/LandingContent";

export const metadata: Metadata = {
  alternates: { canonical: "https://www.zenvyra.hu/" },
  openGraph: {
    title: "Zenvyra – Táplálkozás, mozgás és jóllét egy alkalmazásban",
    description: "Ha életmódot váltanál, a Zenvyra segít megtenni az első lépéseket. Tudatosabb mindennapi szokások a saját tempódban.",
    url: "https://www.zenvyra.hu/",
    type: "website",
    locale: "hu_HU",
    siteName: "Zenvyra",
    images: [{ url: "/zenvyra-hero.webp", width: 1536, height: 1024, alt: "Zenvyra – táplálkozás, mozgás és jóllét" }],
  },
};

export default function HomePage() {
  return <HomeApp><LandingContent /></HomeApp>;
}
