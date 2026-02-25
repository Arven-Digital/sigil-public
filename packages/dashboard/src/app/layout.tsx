import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["800"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://sigil.codes"),
  title: "Sigil Protocol — AI Agent Wallet Security",
  description:
    "Sigil Protocol provides 3-layer Guardian validation for AI agent wallets. Deterministic rules, transaction simulation, and AI risk scoring on Avalanche, Base, Arbitrum, 0G & Polygon.",
  keywords: [
    "AI agent wallet",
    "smart account security",
    "ERC-4337",
    "account abstraction",
    "transaction validation",
    "Sigil Protocol",
  ],
  alternates: {
    canonical: "https://sigil.codes",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon_16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon_32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Sigil Protocol — AI Agent Wallet Security",
    description:
      "Sigil Protocol provides 3-layer Guardian validation for AI agent wallets. Deterministic rules, transaction simulation, and AI risk scoring on Avalanche, Base, Arbitrum, 0G & Polygon.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    siteName: "Sigil Protocol",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    site: "@sigilcodes",
    creator: "@sigilcodes",
    title: "Sigil Protocol — AI Agent Wallet Security",
    description:
      "Sigil Protocol provides 3-layer Guardian validation for AI agent wallets. Deterministic rules, transaction simulation, and AI risk scoring on Avalanche, Base, Arbitrum, 0G & Polygon.",
    images: ["/og-image.png"],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://sigil.codes/#organization",
      name: "Sigil Protocol",
      url: "https://sigil.codes",
      logo: "https://sigil.codes/sigil-symbol.svg",
      sameAs: [
        "https://x.com/sigilcodes",
        "https://github.com/Arven-Digital/sigil-public",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://sigil.codes/#website",
      url: "https://sigil.codes",
      name: "Sigil Protocol",
      publisher: { "@id": "https://sigil.codes/#organization" },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
