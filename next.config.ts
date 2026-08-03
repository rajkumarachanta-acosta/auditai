import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // pdfkit loads .afm font files relative to its own __dirname at runtime;
  // bundling it breaks that path resolution, so it must stay external.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
