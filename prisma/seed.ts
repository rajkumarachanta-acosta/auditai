import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/reachy/db";
import { Prisma } from "../lib/reachy/generated/prisma/client";
import { CONNECTOR_DEFINITIONS } from "../lib/reachy/connectors/registry";

const CATEGORIES: { name: string; slug: string; subcategories: string[] }[] = [
  { name: "Fees & Reimbursements", slug: "fees-reimbursements", subcategories: ["FBA Fees", "Low Inventory Fee", "Reimbursement Delays"] },
  { name: "Advertising Performance", slug: "advertising-performance", subcategories: ["ACOS/TACOS", "Bid Management", "Search Term Waste"] },
  { name: "Account Health", slug: "account-health", subcategories: ["Suspensions", "Policy Violations", "ODR"] },
  { name: "Inventory & Logistics", slug: "inventory-logistics", subcategories: ["FBA Inbound", "Storage Limits", "Stranded Inventory"] },
  { name: "Listings & Catalog", slug: "listings-catalog", subcategories: ["Hijackers", "Listing Suppression", "A+ Content"] },
  { name: "Reporting & Analytics", slug: "reporting-analytics", subcategories: ["Data Latency", "Attribution", "Bulk Exports"] },
];

const COMPETITORS: { name: string; slug: string; website: string; strengths: string; weaknesses: string; marketGaps: string }[] = [
  { name: "Pacvue", slug: "pacvue", website: "https://www.pacvue.com", strengths: "Enterprise footprint, multi-retailer support", weaknesses: "Complex onboarding, expensive for mid-market", marketGaps: "Weak self-serve tier for small sellers" },
  { name: "Quartile", slug: "quartile", website: "https://quartile.com", strengths: "AI bidding automation, agency partnerships", weaknesses: "Limited transparency into bidding logic", marketGaps: "Little support for DSP creative testing" },
  { name: "Perpetua", slug: "perpetua", website: "https://www.perpetua.io", strengths: "Clean UI, goal-based campaign automation", weaknesses: "Reporting depth lags larger platforms", marketGaps: "No native market-research / pain-point intelligence" },
  { name: "Helium 10", slug: "helium-10", website: "https://www.helium10.com", strengths: "Broad toolset, strong brand with sellers", weaknesses: "Tool sprawl, inconsistent data freshness", marketGaps: "No AI employee / continuous research automation" },
  { name: "Scale Insights", slug: "scale-insights", website: "https://scaleinsights.com", strengths: "Automated bid rules, PPC-focused", weaknesses: "Smaller ecosystem, fewer integrations", marketGaps: "Little competitor intelligence tooling" },
  { name: "Teikametrics", slug: "teikametrics", website: "https://www.teikametrics.com", strengths: "AI Flywheel automation, retail media focus", weaknesses: "Pricing opaque, steep learning curve", marketGaps: "No proactive pain-point discovery across forums/social" },
];

async function main() {
  const adminEmail = "admin@a-one.local";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Reachy Admin",
        role: "ADMIN",
        password: await bcrypt.hash("ChangeMe123!", 10),
      },
    });
    console.log(`Seeded admin user: ${adminEmail} / ChangeMe123! (change immediately)`);
  }

  for (const cat of CATEGORIES) {
    const parent = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: { name: cat.name, slug: cat.slug },
    });
    for (const sub of cat.subcategories) {
      const subSlug = `${cat.slug}--${sub.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      await prisma.category.upsert({
        where: { slug: subSlug },
        update: { name: sub, parentId: parent.id },
        create: { name: sub, slug: subSlug, parentId: parent.id },
      });
    }
  }

  for (const competitor of COMPETITORS) {
    await prisma.competitor.upsert({
      where: { slug: competitor.slug },
      update: {},
      create: {
        name: competitor.name,
        slug: competitor.slug,
        website: competitor.website,
        strengths: competitor.strengths,
        weaknesses: competitor.weaknesses,
        marketGaps: competitor.marketGaps,
        features: [],
        pricing: [],
        latestUpdates: [],
      },
    });
  }

  for (const def of CONNECTOR_DEFINITIONS) {
    await prisma.source.upsert({
      where: { key: def.key },
      update: { name: def.name },
      create: {
        key: def.key,
        name: def.name,
        enabled: def.enabledByDefault,
        config: (def.defaultConfig ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
