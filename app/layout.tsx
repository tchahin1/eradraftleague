import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans } from "next/font/google";
import "./globals.css";

const display = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const description =
  "Draft an XI from random club-seasons in Europe's top five leagues and win a fictional title race.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Era Draft League",
  description,
  applicationName: "Era Draft League",
  openGraph: {
    title: "Era Draft League",
    description,
    type: "website",
    siteName: "Era Draft League",
    locale: "en_GB",
    images: [
      {
        url: "/og.jpg",
        width: 1024,
        height: 558,
        alt: "EDL Era Draft League",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Era Draft League",
    description,
    images: ["/og.jpg"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-league="epl" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-emerald-50">{children}</body>
    </html>
  );
}
