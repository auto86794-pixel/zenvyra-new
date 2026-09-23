import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.zenvyra.hu"),
  title: {
    default: "Zenvyra – Test és lélek harmóniában",
    template: "%s | Zenvyra",
  },
  description:
    "Személyre szabott támogatás táplálkozáshoz, mozgáshoz és a mindennapi jólléthez.",
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
    title: "Zenvyra – Test és lélek harmóniában",
    description:
      "Táplálkozás, mozgás és közérzet egy könnyen követhető, személyre szabott rendszerben.",
    type: "website",
    locale: "hu_HU",
    siteName: "Zenvyra",
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
