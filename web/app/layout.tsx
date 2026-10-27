import type { Metadata } from "next";
import { Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";

// Montserrat: same type feel as the reference site, but sourced from Google
// Fonts under the SIL Open Font License and self-hosted by next/font — no
// licensed brand asset enters the bundle.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Coverage Decision Reviewer",
  description:
    "Prior-authorization coverage review: Pydantic AI agent over AG-UI, streamed through a Next.js BFF.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${montserrat.variable} ${geistMono.variable} antialiased`}>
        {children}
        <footer className="mt-10 border-t border-slate-300 py-6">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-xs leading-5 text-slate-600">
              Independent engineering proof of concept. Not an Evolent Health product and not
              affiliated with, endorsed by, or sponsored by Evolent Health, Inc.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
