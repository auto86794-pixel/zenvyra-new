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
    icon: "/zenvyra-internal-logo.png",
    apple: "/zenvyra-internal-logo.png",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
