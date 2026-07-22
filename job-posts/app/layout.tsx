import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Briefcase, LayoutGrid, UserRound } from "lucide-react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

const favicon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%232a63d6'/%3E%3Cstop offset='1' stop-color='%236d3ad6'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='8' fill='url(%23g)'/%3E%3Cpath d='M9 13h14v11a2 2 0 01-2 2H11a2 2 0 01-2-2V13z' fill='white' fill-opacity='.95'/%3E%3Cpath d='M13 13v-2a2 2 0 012-2h2a2 2 0 012 2v2' stroke='white' stroke-width='2' fill='none'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: "Job Posts — job search agent",
  description: "Matched job postings across major companies, retailers, agencies, and international/remote listings.",
  icons: [{ rel: "icon", url: favicon }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <header
          className="sticky top-0 z-10 backdrop-blur-xl"
          style={{ background: "color-mix(in srgb, var(--surface-1) 78%, transparent)", borderBottom: "1px solid var(--border)" }}
        >
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                className="accent-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white"
                style={{ boxShadow: "var(--shadow-accent)" }}
              >
                <Briefcase size={16} strokeWidth={2.25} />
              </span>
              <span className="text-[15px] font-semibold tracking-tight">Job Posts</span>
            </Link>
            <div className="flex items-center gap-1 rounded-full p-1" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <Link href="/" className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors hover:opacity-80">
                <LayoutGrid size={14} strokeWidth={2.25} />
                Dashboard
              </Link>
              <Link href="/profile" className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors hover:opacity-80">
                <UserRound size={14} strokeWidth={2.25} />
                Profile
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
