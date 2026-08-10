import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acosta Retail Media Toolkit",
  description: "Bulk Campaign Generator, Campaign Audit Engine and Keyword Harvesting in one workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
