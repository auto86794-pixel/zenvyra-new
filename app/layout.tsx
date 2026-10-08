import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.zenvyra.hu"),
  title: {
    default: "Zenvyra – Táplálkozás, mozgás és jóllét egy alkalmazásban",
    template: "%s | Zenvyra",
  },
  description:
    "Ha életmódot váltanál, a Zenvyra segít megtenni az első lépéseket. Kövesd étkezéseidet, folyadékfogyasztásodat, mozgásodat és közérzetedet.",
  twitter: { card: "summary_large_image", images: ["/zenvyra-hero.webp"] },
  applicationName: "Zenvyra",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.png", sizes: "64x64", type: "image/png" },
      { url: "/zenvyra-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: {
      url: "/zenvyra-icon-180.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
  openGraph: {
    title: "Zenvyra – Táplálkozás, mozgás és jóllét egy alkalmazásban",
    description:
      "Táplálkozás, mozgás és közérzet egy könnyen követhető, személyre szabott rendszerben.",
    type: "website",
    locale: "hu_HU",
    siteName: "Zenvyra",
    images: [{ url: "/zenvyra-hero.webp", width: 1536, height: 1024, alt: "Zenvyra – test, lélek, egyensúly" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#23473a",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hu" className="h-full antialiased">
      <head>
        <link
          rel="preload"
          as="image"
          href="/zenvyra-welcome.webp"
          type="image/webp"
          fetchPriority="high"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
