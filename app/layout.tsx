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

export const metadata: Metadata = {
  title: "Era Draft League",
  description: "Draft an XI from random club-seasons in Europe's top five leagues and win a fictional title race.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-league="epl" className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-emerald-50">{children}</body>
    </html>
  );
}
