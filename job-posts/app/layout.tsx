import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Posts — job search agent",
  description: "Matched job postings across major companies, retailers, agencies, and international/remote listings.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header
          className="sticky top-0 z-10 backdrop-blur"
          style={{ background: "color-mix(in srgb, var(--surface-1) 88%, transparent)", borderBottom: "1px solid var(--border)" }}
        >
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold text-white"
                style={{ background: "var(--accent)" }}
              >
                J
              </span>
              <span className="text-[15px] font-semibold tracking-tight">Job Posts</span>
            </Link>
            <div className="flex items-center gap-1 rounded-full p-1" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <Link href="/" className="rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors hover:opacity-80">
                Dashboard
              </Link>
              <Link href="/profile" className="rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors hover:opacity-80">
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
