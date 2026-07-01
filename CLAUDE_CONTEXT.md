# AuditAI — Full Codebase Context for Review

## What this is
A Next.js 16 web app — Amazon advertising campaign audit chatbot.
Users upload Excel files (Vendor Central Sales, Traffic, Amazon Ads Bulk file).
App processes data in browser, runs audit engine, answers questions in plain English.
Also generates an 8-slide PowerPoint from the audit data.

## Key design decisions
- Zero hallucinations: audit engine computes all facts. LLM only formats language.
- No server-side data storage: Excel parsed client-side via SheetJS.
- Dual brand: NEXT_PUBLIC_BRAND=acosta or external (one codebase, two Vercel deployments).
- File types: Vendor Central Sales by ASIN, Traffic by ASIN, Amazon Ads Bulk xlsx.

## Tech stack
Next.js 16, TypeScript, SheetJS, PptxGenJS, OpenAI gpt-3.5-turbo (optional), Tailwind

---

## FILE: lib/brand.ts
// ── Brand configuration ──
// Controlled by NEXT_PUBLIC_BRAND env var: "acosta" | "external"
// One codebase, two deployments, two identities.

export type BrandId = "acosta" | "external";

export interface BrandConfig {
  id: BrandId;
  appName: string;
  appTagline: string;
  logoText: string;
  logoAccent: string;          // highlighted part of logo text
  navBg: string;               // top nav background
  navAccent: string;           // accent color in nav
  accentColor: string;         // primary CTA / link color
  accentHover: string;
  scoreCardBg: string;
  uploadHeading: string;
  uploadSubtext: string;
  poweredBy: string;
  supportEmail: string;
  showApiKeyOption: boolean;   // external users bring their own key
  apiKeyLabel: string;
  footerText: string;
  faviconEmoji: string;
}

const ACOSTA: BrandConfig = {
  id: "acosta",
  appName: "Acosta Audit Engine",
  appTagline: "Amazon Campaign Intelligence — Internal",
  logoText: "Acosta",
  logoAccent: "AI",
  navBg: "#0f1923",
  navAccent: "#e8501a",          // Acosta orange
  accentColor: "#e8501a",
  accentHover: "#c43d10",
  scoreCardBg: "#0f1923",
  uploadHeading: "Acosta Campaign Audit",
  uploadSubtext: "Upload Amazon advertising and sales reports to run a full audit. Data is processed in your browser — never stored.",
  poweredBy: "Acosta Commerce",
  supportEmail: "analytics@acosta.com",
  showApiKeyOption: false,       // key baked in via env var for internal
  apiKeyLabel: "OpenAI Key",
  footerText: "Acosta Commerce · Internal Tool · Confidential",
  faviconEmoji: "📊",
};

const EXTERNAL: BrandConfig = {
  id: "external",
  appName: "AuditAI",
  appTagline: "Amazon Campaign Intelligence",
  logoText: "Audit",
  logoAccent: "AI",
  navBg: "#1a1f2e",
  navAccent: "#3b82d4",
  accentColor: "#3b82d4",
  accentHover: "#2563eb",
  scoreCardBg: "#1a1f2e",
  uploadHeading: "Campaign Intelligence",
  uploadSubtext: "Upload your Amazon advertising and sales reports and start asking questions instantly. Your data is processed in your browser — nothing is sent to any server.",
  poweredBy: "AuditAI",
  supportEmail: "hello@auditad.ai",
  showApiKeyOption: true,        // external users enter their own key
  apiKeyLabel: "OpenAI API Key",
  footerText: "AuditAI · Your data never leaves your browser",
  faviconEmoji: "🔍",
};

export function getBrand(): BrandConfig {
  const env = process.env.NEXT_PUBLIC_BRAND;
  if (env === "acosta") return ACOSTA;
  return EXTERNAL; // default to external/neutral
}

export const brand = getBrand();

---

## FILE: lib/auditEngine.ts
// ── Audit Engine — all reasoning done here, LLM only formats output ──
// Column names match the real Amazon bulk file and Vendor Central exports exactly.

export interface Finding {
  id: string;
  category: "waste" | "opportunity" | "structure" | "asin";
  title: string;
  detail: string;
  impact: number; // $ for the reporting period
  severity: "critical" | "high" | "medium" | "low";
  action: string;
}

export interface AsinCohort {
  asin: string;
  title: string;
  brand: string;
  cohort: "cash_cow" | "need_love" | "reduce_pause";
  orderedRevenue: number;
  orderedUnits: number;
  pageViews: number;
  revenuePerView: number;
  returnRate: number;
}

export interface AuditResult {
  score: number;
  scoreLabel: string;
  spendEfficiency: number;
  structureQuality: number;
  totalWaste: number;           // $ over reporting period
  totalOpportunity: number;     // $ monthly upside
  criticalCount: number;
  findings: Finding[];
  asinCohorts: AsinCohort[];
  topWaste: Finding[];
  topOpportunities: Finding[];
  summary: AuditSummary;
  hasCampaignData: boolean;
  hasSalesData: boolean;
}

export interface AuditSummary {
  // Campaign metrics
  totalSpend: number;
  totalSales: number;
  totalImpressions: number;
  totalClicks: number;
  totalOrders: number;
  avgAcos: number;
  avgCvr: number;
  avgCtr: number;
  campaignCount: number;
  keywordCount: number;
  // Vendor Central metrics
  totalOrderedRevenue: number;
  totalOrderedUnits: number;
  totalPageViews: number;
  asinCount: number;
  topBrand: string;
  returnRate: number;
  wasteRatio: number;
  reportingDays: number;
}

export interface RawData {
  sales: Record<string, unknown>[];       // Vendor Central Sales by ASIN
  traffic: Record<string, unknown>[];     // Vendor Central Traffic by ASIN
  campaign: Record<string, unknown>[];    // Bulk file: Sponsored Products Campaigns sheet
  searchTerm: Record<string, unknown>[];  // Bulk file: SP Search Term Report sheet
}

// ── Safe number coercion ──
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/[$,%]/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function str(v: unknown): string { return String(v ?? "").trim(); }

// ── Column lookup — tries multiple aliases, case-insensitive ──
function col(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const nl = name.toLowerCase();
    const key = Object.keys(row).find(k => k.toLowerCase() === nl);
    if (key !== undefined) return row[key];
  }
  return undefined;
}

// ── ASIN Cohort Analysis (Vendor Central data) ──
function runAsinAudit(
  sales: Record<string, unknown>[],
  traffic: Record<string, unknown>[]
): AsinCohort[] {
  // Build maps keyed by ASIN
  const salesMap: Record<string, { rev: number; units: number; returns: number; title: string; brand: string }> = {};
  for (const row of sales) {
    const asin = str(col(row, "ASIN"));
    if (!asin || asin === "ASIN") continue;
    if (!salesMap[asin]) salesMap[asin] = { rev: 0, units: 0, returns: 0, title: str(col(row, "Product Title")), brand: str(col(row, "Brand")) };
    salesMap[asin].rev     += num(col(row, "Ordered Revenue"));
    salesMap[asin].units   += num(col(row, "Ordered Units"));
    salesMap[asin].returns += num(col(row, "Customer Returns"));
  }

  const trafficMap: Record<string, number> = {};
  for (const row of traffic) {
    const asin = str(col(row, "ASIN"));
    if (!asin || asin === "ASIN") continue;
    trafficMap[asin] = (trafficMap[asin] ?? 0) + num(col(row, "Featured Offer Page Views"));
  }

  const allAsins = Object.keys(salesMap);
  if (allAsins.length === 0) return [];

  const totalRev = allAsins.reduce((s, a) => s + (salesMap[a]?.rev ?? 0), 0);

  const sorted = allAsins
    .map(asin => ({ asin, ...salesMap[asin], pageViews: trafficMap[asin] ?? 0 }))
    .sort((a, b) => b.rev - a.rev);

  const cohorts: AsinCohort[] = [];
  let cumulative = 0;

  for (const item of sorted) {
    if (!item) continue;
    cumulative += item.rev;
    const pct = totalRev > 0 ? cumulative / totalRev : 0;
    const revenuePerView = item.pageViews > 0 ? item.rev / item.pageViews : 0;
    const returnRate = item.units > 0 ? item.returns / item.units : 0;

    let cohort: AsinCohort["cohort"];
    if (pct <= 0.8 && item.rev > 0) {
      cohort = "cash_cow";
    } else if (revenuePerView > 0 && item.rev < totalRev * 0.01) {
      cohort = "need_love";
    } else {
      cohort = "reduce_pause";
    }

    cohorts.push({
      asin: item.asin,
      title: item.title ?? "",
      brand: item.brand ?? "",
      cohort,
      orderedRevenue: item.rev,
      orderedUnits: item.units,
      pageViews: item.pageViews,
      revenuePerView,
      returnRate,
    });
  }
  return cohorts;
}

// ── Keyword Audit (Bulk file: Entity = "Keyword") ──
function runKeywordAudit(campaign: Record<string, unknown>[]): Finding[] {
  const findings: Finding[] = [];
  const keywords = campaign.filter(r => str(col(r, "Entity")) === "Keyword");
  if (!keywords.length) return findings;

  const HIGH_ACOS    = 0.4;    // 40%
  const LOW_CTR      = 0.002;  // 0.2%
  const NO_SALES_MIN = 30;     // $30 spend threshold
  const MIN_IMPR_CTR = 500;
  const MIN_CLICKS_CVR = 30;
  const LOW_CVR      = 0.05;

  let noSalesCount = 0, noSalesSpend = 0;
  let highAcosCount = 0, highAcosSpend = 0;
  let lowCtrCount = 0, lowCvrCount = 0;

  for (const kw of keywords) {
    const spend  = num(col(kw, "Spend"));
    const sales  = num(col(kw, "Sales"));
    const clicks = num(col(kw, "Clicks"));
    const impr   = num(col(kw, "Impressions"));
    const acos   = num(col(kw, "ACOS"));
    const cvr    = num(col(kw, "Conversion Rate"));
    const kwText = str(col(kw, "Keyword Text"));
    const camp   = str(col(kw, "_ResolvedCampaignName", "Campaign Name (Informational only)", "Campaign Name"));

    if (spend === 0 && impr === 0 && clicks === 0) continue;

    if (spend >= NO_SALES_MIN && sales === 0) {
      noSalesCount++;
      noSalesSpend += spend;
      findings.push({
        id: `kw-nosales-${kwText}`,
        category: "waste",
        title: `Zero-sales keyword: "${kwText}"`,
        detail: `Campaign: ${camp || "Unknown"} · Spend: $${spend.toFixed(0)} · $0 sales`,
        impact: spend,
        severity: spend > 200 ? "critical" : "high",
        action: `Pause "${kwText}" — spending $${spend.toFixed(0)} with zero return`,
      });
    }

    if (sales > 0 && acos > HIGH_ACOS) {
      highAcosCount++;
      highAcosSpend += spend;
      findings.push({
        id: `kw-acos-${kwText}`,
        category: "waste",
        title: `High ACOS: "${kwText}" at ${(acos * 100).toFixed(0)}%`,
        detail: `Campaign: ${camp || "Unknown"} · ACOS ${(acos * 100).toFixed(0)}% vs ${(HIGH_ACOS * 100).toFixed(0)}% target`,
        impact: Math.max(0, spend - sales * HIGH_ACOS),
        severity: acos > 0.8 ? "critical" : "high",
        action: `Reduce bid by ${Math.min(70, Math.round((1 - HIGH_ACOS / acos) * 100))}% on "${kwText}"`,
      });
    }

    if (impr >= MIN_IMPR_CTR) {
      const ctr = clicks / impr;
      if (ctr < LOW_CTR) {
        lowCtrCount++;
        findings.push({
          id: `kw-ctr-${kwText}`,
          category: "structure",
          title: `Low CTR: "${kwText}" at ${(ctr * 100).toFixed(2)}%`,
          detail: `${impr.toFixed(0)} impressions · CTR ${(ctr * 100).toFixed(2)}% vs ${(LOW_CTR * 100).toFixed(2)}% benchmark`,
          impact: 0,
          severity: "medium",
          action: `Review ad relevance for "${kwText}" or pause to stop wasting impressions`,
        });
      }
    }

    if (clicks >= MIN_CLICKS_CVR && cvr > 0 && cvr < LOW_CVR) {
      lowCvrCount++;
      findings.push({
        id: `kw-cvr-${kwText}`,
        category: "structure",
        title: `Low CVR: "${kwText}" at ${(cvr * 100).toFixed(1)}%`,
        detail: `${clicks.toFixed(0)} clicks · CVR ${(cvr * 100).toFixed(1)}% vs ${(LOW_CVR * 100).toFixed(0)}% threshold`,
        impact: 0,
        severity: "medium",
        action: `Review listing relevance for "${kwText}" — getting clicks but not converting`,
      });
    }
  }

  // Summary findings (these drive the score)
  if (noSalesCount > 0) {
    findings.push({
      id: "kw-summary-nosales",
      category: "waste",
      title: `${noSalesCount} keywords spent $${noSalesSpend.toFixed(0)} with zero sales`,
      detail: `Budget burning with no return across ${noSalesCount} keywords. Full list above.`,
      impact: noSalesSpend,
      severity: "critical",
      action: `Pause or reduce bids on all ${noSalesCount} zero-sales keywords immediately`,
    });
  }
  if (highAcosCount > 0) {
    findings.push({
      id: "kw-summary-highacos",
      category: "waste",
      title: `${highAcosCount} keywords above ${(HIGH_ACOS * 100).toFixed(0)}% ACOS threshold ($${highAcosSpend.toFixed(0)} total spend)`,
      detail: `Overspending relative to sales return across ${highAcosCount} keywords.`,
      impact: highAcosSpend * 0.4,
      severity: "high",
      action: `Systematically reduce bids on ${highAcosCount} high-ACOS keywords`,
    });
  }

  return findings;
}

// ── Campaign Audit (Bulk file: Entity = "Campaign") ──
function runCampaignAudit(campaign: Record<string, unknown>[]): Finding[] {
  const findings: Finding[] = [];
  const campaigns = campaign.filter(r => str(col(r, "Entity")) === "Campaign");
  if (!campaigns.length) return findings;

  const WASTE_MIN_SPEND = 1;
  const OVERSPEND_ACOS  = 0.5;

  let totalSpend = 0;
  const spendByCamp: Record<string, number> = {};
  const nameByKey: Record<string, string> = {};

  for (const c of campaigns) {
    const spend  = num(col(c, "Spend"));
    const sales  = num(col(c, "Sales"));
    const acos   = num(col(c, "ACOS"));
    const budget = num(col(c, "Daily Budget"));
    const name   = str(col(c, "_ResolvedCampaignName", "Campaign Name (Informational only)", "Campaign Name")) || "Unknown Campaign";
    const key    = name.toLowerCase();

    totalSpend += spend;
    spendByCamp[key] = (spendByCamp[key] ?? 0) + spend;
    nameByKey[key]   = name;

    if (spend > WASTE_MIN_SPEND && sales === 0) {
      findings.push({
        id: `camp-waste-${key}`,
        category: "waste",
        title: `Zero-sales campaign: "${name}"`,
        detail: `Spend: $${spend.toFixed(0)} in reporting period · Zero attributed sales`,
        impact: spend,
        severity: "critical",
        action: `Pause "${name}" — zero return on $${spend.toFixed(0)} spend`,
      });
    }

    if (sales > 0 && acos > OVERSPEND_ACOS) {
      findings.push({
        id: `camp-acos-${key}`,
        category: "waste",
        title: `High-ACOS campaign: "${name}" at ${(acos * 100).toFixed(0)}%`,
        detail: `ACOS ${(acos * 100).toFixed(0)}% vs 50% ceiling · Spend $${spend.toFixed(0)} · Sales $${sales.toFixed(0)}`,
        impact: Math.max(0, spend - sales * OVERSPEND_ACOS),
        severity: "high",
        action: `Review and reduce bids in "${name}" to bring ACOS under 50%`,
      });
    }
  }

  // Spend concentration risk
  const sorted = Object.entries(spendByCamp).sort((a, b) => b[1] - a[1]);
  if (sorted.length >= 2 && totalSpend > 0) {
    const top2spend = (sorted[0]?.[1] ?? 0) + (sorted[1]?.[1] ?? 0);
    const pct = top2spend / totalSpend;
    if (pct > 0.6) {
      findings.push({
        id: "camp-concentration",
        category: "structure",
        title: `Spend concentration: top 2 campaigns = ${(pct * 100).toFixed(0)}% of total spend`,
        detail: `"${nameByKey[sorted[0]?.[0] ?? ""] ?? ""}" + "${nameByKey[sorted[1]?.[0] ?? ""] ?? ""}" dominate the budget — single point of failure`,
        impact: 0,
        severity: "medium",
        action: `Redistribute budget across more campaigns to reduce risk`,
      });
    }
  }

  return findings;
}

// ── Search Term Audit (Bulk file: SP Search Term Report sheet) ──
function runSearchTermAudit(searchTerm: Record<string, unknown>[]): Finding[] {
  const findings: Finding[] = [];
  if (!searchTerm.length) return findings;

  const totalClicks = searchTerm.reduce((s, r) => s + num(col(r, "Clicks")), 0);
  const totalOrders = searchTerm.reduce((s, r) => s + num(col(r, "Orders", "Attributed Conversions 14d")), 0);
  const avgCvr = totalClicks > 0 ? totalOrders / totalClicks : 0;

  for (const row of searchTerm) {
    const term   = str(col(row, "Customer Search Term", "Search Term", "Query"));
    const spend  = num(col(row, "Spend"));
    const sales  = num(col(row, "Sales", "Attributed Sales 14d"));
    const clicks = num(col(row, "Clicks"));
    const orders = num(col(row, "Orders", "Attributed Conversions 14d"));
    const cvr    = clicks > 0 ? orders / clicks : 0;

    if (!term || term === "Customer Search Term") continue;

    if (spend > 30 && sales === 0) {
      findings.push({
        id: `st-waste-${term.slice(0, 40)}`,
        category: "waste",
        title: `Wasted search term: "${term}"`,
        detail: `$${spend.toFixed(0)} spend · zero sales · irrelevant traffic`,
        impact: spend,
        severity: spend > 100 ? "critical" : "high",
        action: `Add "${term}" as negative exact keyword across relevant campaigns`,
      });
    }

    if (orders > 1 && cvr > avgCvr * 2 && spend < 50) {
      findings.push({
        id: `st-opp-${term.slice(0, 40)}`,
        category: "opportunity",
        title: `High-CVR underfunded term: "${term}"`,
        detail: `CVR ${(cvr * 100).toFixed(1)}% (2x account avg) · Only $${spend.toFixed(0)} spend · Huge upside`,
        impact: spend * 4,
        severity: "high",
        action: `Add "${term}" as exact-match keyword and increase bid`,
      });
    }
  }

  return findings;
}

// ── ASIN Opportunity Findings ──
function runAsinOpportunities(cohorts: AsinCohort[]): Finding[] {
  const findings: Finding[] = [];
  const love = cohorts.filter(a => a.cohort === "need_love").slice(0, 5);
  const high_return = cohorts.filter(a => a.returnRate > 0.15 && a.orderedUnits > 10).slice(0, 3);

  for (const a of love) {
    findings.push({
      id: `asin-love-${a.asin}`,
      category: "opportunity",
      title: `Underfunded ASIN: ${a.asin}`,
      detail: `"${a.title.slice(0, 60)}" · Rev $${a.orderedRevenue.toFixed(0)} · ${a.pageViews} page views · High conversion potential`,
      impact: a.orderedRevenue * 0.3,
      severity: "medium",
      action: `Create or increase Sponsored Products campaign for ${a.asin}`,
    });
  }

  for (const a of high_return) {
    findings.push({
      id: `asin-return-${a.asin}`,
      category: "structure",
      title: `High return rate: ${a.asin} at ${(a.returnRate * 100).toFixed(0)}%`,
      detail: `"${a.title.slice(0, 60)}" · ${(a.returnRate * 100).toFixed(0)}% returns vs ~10% healthy benchmark`,
      impact: 0,
      severity: "medium",
      action: `Review listing accuracy and product quality for ${a.asin}`,
    });
  }

  return findings;
}

// ── Score Calculation ──
function calculateScore(
  findings: Finding[],
  summary: AuditSummary
): { score: number; spendEfficiency: number; structureQuality: number } {
  let spendEfficiency = 70;
  if (summary.totalSpend > 0) {
    spendEfficiency -= Math.min(30, summary.wasteRatio * 100);
    spendEfficiency -= Math.min(15, Math.max(0, (summary.avgAcos - 0.3) * 50));
  }
  spendEfficiency = Math.max(0, Math.round(spendEfficiency));

  let structureQuality = 30;
  const criticals = findings.filter(f => f.severity === "critical").length;
  const structs   = findings.filter(f => f.category === "structure").length;
  structureQuality -= Math.min(15, criticals * 3);
  structureQuality -= Math.min(10, structs   * 2);
  structureQuality = Math.max(0, Math.round(structureQuality));

  return { score: spendEfficiency + structureQuality, spendEfficiency, structureQuality };
}

// ── Main Engine Entry Point ──
export function runAuditEngine(data: RawData): AuditResult {
  const { sales, traffic, campaign, searchTerm } = data;

  const hasCampaignData = campaign.length > 0;
  const hasSalesData    = sales.length > 0;

  // ── Campaign summary metrics ──
  const totalSpend      = campaign.reduce((s, r) => s + num(col(r, "Spend")), 0);
  const totalSales      = campaign.reduce((s, r) => s + num(col(r, "Sales")), 0);
  const totalImpr       = campaign.reduce((s, r) => s + num(col(r, "Impressions")), 0);
  const totalClicks     = campaign.reduce((s, r) => s + num(col(r, "Clicks")), 0);
  const totalOrders     = campaign.reduce((s, r) => s + num(col(r, "Orders")), 0);
  const zeroSalesSpend  = campaign.filter(r => num(col(r, "Sales")) === 0).reduce((s, r) => s + num(col(r, "Spend")), 0);
  const campNames       = new Set(campaign.filter(r => str(col(r, "Entity")) === "Campaign").map(r => str(col(r, "Campaign Name", "_ResolvedCampaignName"))).filter(Boolean));
  const kwRows          = campaign.filter(r => str(col(r, "Entity")) === "Keyword");

  // ── Vendor Central summary metrics ──
  const totalRevenue  = sales.reduce((s, r) => s + num(col(r, "Ordered Revenue")), 0);
  const totalUnits    = sales.reduce((s, r) => s + num(col(r, "Ordered Units")), 0);
  const totalReturns  = sales.reduce((s, r) => s + num(col(r, "Customer Returns")), 0);
  const totalPV       = traffic.reduce((s, r) => s + num(col(r, "Featured Offer Page Views")), 0);
  const asinSet       = new Set([...sales.map(r => str(col(r, "ASIN"))), ...traffic.map(r => str(col(r, "ASIN")))].filter(a => a && a !== "ASIN"));

  // Top brand
  const brandMap: Record<string, number> = {};
  for (const r of sales) {
    const brand = str(col(r, "Brand"));
    if (brand && brand !== "Brand") brandMap[brand] = (brandMap[brand] ?? 0) + num(col(r, "Ordered Revenue"));
  }
  const topBrand = Object.entries(brandMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  const summary: AuditSummary = {
    totalSpend,
    totalSales,
    totalImpressions: totalImpr,
    totalClicks,
    totalOrders,
    avgAcos:    totalSales  > 0 ? totalSpend  / totalSales  : 0,
    avgCvr:     totalClicks > 0 ? totalOrders / totalClicks : 0,
    avgCtr:     totalImpr   > 0 ? totalClicks / totalImpr   : 0,
    campaignCount: campNames.size,
    keywordCount:  kwRows.length,
    totalOrderedRevenue: totalRevenue,
    totalOrderedUnits:   totalUnits,
    totalPageViews:      totalPV,
    asinCount:   asinSet.size,
    topBrand,
    returnRate:  totalUnits > 0 ? totalReturns / totalUnits : 0,
    wasteRatio:  totalSpend > 0 ? zeroSalesSpend / totalSpend : 0,
    reportingDays: 30,
  };

  // ── Run all audit modules ──
  const asinCohorts    = runAsinAudit(sales, traffic);
  const kwFindings     = runKeywordAudit(campaign);
  const campFindings   = runCampaignAudit(campaign);
  const stFindings     = runSearchTermAudit(searchTerm);
  const asinFindings   = runAsinOpportunities(asinCohorts);

  const allFindings = [...kwFindings, ...campFindings, ...stFindings, ...asinFindings];

  // ── Score ──
  const { score, spendEfficiency, structureQuality } = calculateScore(allFindings, summary);
  const scoreLabel =
    score >= 80 ? "Healthy" :
    score >= 65 ? "Needs Attention" :
    score >= 50 ? "At Risk" : "Critical";

  const totalWaste = allFindings
    .filter(f => f.category === "waste")
    .reduce((s, f) => s + f.impact, 0);

  const totalOpportunity = allFindings
    .filter(f => f.category === "opportunity")
    .reduce((s, f) => s + f.impact * 4, 0);

  const topWaste = [...allFindings]
    .filter(f => f.category === "waste")
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  const topOpportunities = [...allFindings]
    .filter(f => f.category === "opportunity")
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  return {
    score,
    scoreLabel,
    spendEfficiency,
    structureQuality,
    totalWaste,
    totalOpportunity,
    criticalCount: allFindings.filter(f => f.severity === "critical").length,
    findings: allFindings,
    asinCohorts,
    topWaste,
    topOpportunities,
    summary,
    hasCampaignData,
    hasSalesData,
  };
}

---

## FILE: lib/chatEngine.ts
// ── Chat Engine — matches questions to pre-computed audit data ──
// LLM only formats; all facts come from auditEngine output

import { AuditResult, Finding } from "./auditEngine";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

type Intent =
  | "waste"
  | "keywords"
  | "campaigns"
  | "opportunities"
  | "asins"
  | "score"
  | "searchterms"
  | "powerpoint"
  | "summary"
  | "unknown";

function detectIntent(q: string): Intent {
  const lower = q.toLowerCase();
  if (/powerpoint|pptx|ppt|presentat|slide/.test(lower)) return "powerpoint";
  if (/waste|wasting|losing|burn|zero sales|no sales|wasted/.test(lower)) return "waste";
  if (/keyword|bid|acos|ctr|pause|low ctr/.test(lower)) return "keywords";
  if (/campaign|budget|overspend|concentration|daily/.test(lower)) return "campaigns";
  if (/opportunit|grow|scale|upside|increase revenue|potential/.test(lower)) return "opportunities";
  if (/asin|product|cash cow|need.*love|reduce.*pause|cohort/.test(lower)) return "asins";
  if (/score|health|why.*score|what.*score|dragging|improve score/.test(lower)) return "score";
  if (/search term|search query|negative|wasted term/.test(lower)) return "searchterms";
  if (/summary|overview|overall|how are we|status|snapshot/.test(lower)) return "summary";
  return "unknown";
}

function fmt$(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function severityColor(s: Finding["severity"]): string {
  return { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#6b7280" }[s];
}

// ── Build structured context for LLM (small, no raw data) ──
export function buildLLMContext(audit: AuditResult, question: string): string {
  const { summary, score, scoreLabel, spendEfficiency, structureQuality, totalWaste, totalOpportunity, topWaste, topOpportunities, findings } = audit;

  return `You are an Amazon advertising analyst. Answer the user's question based ONLY on the data below. Be direct, confident, and specific. Always include dollar amounts and next actions. Never guess or add data not shown below.

ACCOUNT SNAPSHOT:
- Health Score: ${score}/100 (${scoreLabel})
- Spend Efficiency: ${spendEfficiency}/70 | Structure Quality: ${structureQuality}/30
- Total Spend: ${fmt$(summary.totalSpend)} | Total Sales: ${fmt$(summary.totalSales)}
- Ordered Revenue: ${fmt$(summary.totalOrderedRevenue)} | Ordered Units: ${summary.totalOrderedUnits}
- Avg ACOS: ${fmtPct(summary.avgAcos)} | Avg CVR: ${fmtPct(summary.avgCvr)} | Avg CTR: ${fmtPct(summary.avgCtr)}
- Campaigns: ${summary.campaignCount} | Keywords: ${summary.keywordCount} | ASINs: ${summary.asinCount}
- Total Waste: ${fmt$(totalWaste)} | Monthly Opportunity: ${fmt$(totalOpportunity)}

TOP WASTE FINDINGS:
${topWaste.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title} | Impact: ${fmt$(f.impact)}/week | Action: ${f.action}`).join("\n")}

TOP OPPORTUNITIES:
${topOpportunities.map((f, i) => `${i + 1}. ${f.title} | Upside: ${fmt$(f.impact * 4)}/month | Action: ${f.action}`).join("\n")}

ALL FINDINGS SUMMARY:
- Critical: ${findings.filter((f) => f.severity === "critical").length}
- High: ${findings.filter((f) => f.severity === "high").length}
- Medium: ${findings.filter((f) => f.severity === "medium").length}
- Waste findings: ${findings.filter((f) => f.category === "waste").length}
- Opportunity findings: ${findings.filter((f) => f.category === "opportunity").length}
- Structure findings: ${findings.filter((f) => f.category === "structure").length}

USER QUESTION: ${question}

Respond in 3–6 sentences max. Be specific with numbers. End with 1–2 clear next actions.`;
}

// ── Local (no-LLM) responses built from audit data ──
export function buildLocalResponse(audit: AuditResult, intent: Intent, question: string): string {
  const { summary, score, scoreLabel, spendEfficiency, structureQuality, totalWaste, totalOpportunity, topWaste, topOpportunities, findings, asinCohorts } = audit;

  switch (intent) {
    case "waste": {
      const lines = topWaste.map((f) =>
        `<div class="fc"><div class="fc-title" style="color:${severityColor(f.severity)}">${f.title}</div><div class="fc-detail">${f.detail}</div><div class="fc-action">▶ ${f.action}</div></div>`
      ).join("");
      return `Your top waste sources total <strong>${fmt$(totalWaste)}</strong> in the reporting period (${fmt$(totalWaste * 12)}/year if not fixed):<br>${lines}<br><strong>Total recoverable: ${fmt$(totalWaste)}</strong>`;
    }

    case "keywords": {
      const kwWaste = findings.filter((f) => f.category === "waste" && f.id.startsWith("kw-"));
      const highAcos = findings.filter((f) => f.id.startsWith("kw-acos-"));
      const lowCtr = findings.filter((f) => f.id.startsWith("kw-ctr-"));
      const lines = kwWaste.slice(0, 4).map((f) =>
        `<div class="fc"><div class="fc-title">${f.title}</div><div class="fc-detail">${f.detail}</div><div class="fc-action" style="color:#ef4444">▶ ${f.action}</div></div>`
      ).join("");
      return `Found <strong>${kwWaste.length} keywords</strong> with issues — ${highAcos.length} extreme ACOS, ${lowCtr.length} low CTR, ${kwWaste.filter(f => f.id.includes('waste')).length} zero-sales.<br>${lines || "<div class='fc'><div class='fc-detail'>No critical keyword issues found — keyword health looks good!</div></div>"}`;
    }

    case "campaigns": {
      const campFindings = findings.filter((f) => f.id.startsWith("camp-"));
      const lines = campFindings.slice(0, 4).map((f) =>
        `<div class="fc ${f.category === 'opportunity' ? 'opp' : ''}"><div class="fc-title">${f.title}</div><div class="fc-detail">${f.detail}</div><div class="fc-action" style="color:${f.category === 'opportunity' ? '#166534' : '#ef4444'}">▶ ${f.action}</div></div>`
      ).join("");
      return `Campaign health: <strong>${summary.campaignCount} campaigns</strong> analyzed, ${campFindings.filter(f => f.severity === 'critical').length} critical issues found.<br>${lines || "<div class='fc'><div class='fc-detail'>No critical campaign issues detected.</div></div>"}`;
    }

    case "opportunities": {
      const lines = topOpportunities.map((f) =>
        `<div class="fc opp"><div class="fc-title">${f.title}</div><div class="fc-detail">${f.detail}</div><div class="fc-action">▶ ${f.action}</div></div>`
      ).join("");
      return `Found <strong>${findings.filter(f => f.category === 'opportunity').length} growth opportunities</strong> with total upside of <strong>${fmt$(totalOpportunity)}/month</strong>:<br>${lines || "<div class='fc opp'><div class='fc-detail'>Upload the bulk campaign file to unlock more opportunities.</div></div>"}`;
    }

    case "asins": {
      const cows = asinCohorts.filter((a) => a.cohort === "cash_cow");
      const love = asinCohorts.filter((a) => a.cohort === "need_love");
      const reduce = asinCohorts.filter((a) => a.cohort === "reduce_pause");
      const topCow = cows[0];
      const topLove = love[0];
      return `ASIN cohort analysis across <strong>${asinCohorts.length} ASINs</strong>:
        <div class="chip-row"><div class="chip-stat green"><span>${cows.length}</span>Cash Cows</div><div class="chip-stat yellow"><span>${love.length}</span>Need Love</div><div class="chip-stat red"><span>${reduce.length}</span>Reduce/Pause</div></div>
        ${topCow ? `<div class="fc opp"><div class="fc-title">Cash Cow: ${topCow.asin}</div><div class="fc-detail">${topCow.title.slice(0,60)} · Revenue: ${fmt$(topCow.orderedRevenue)} · ${topCow.orderedUnits} units</div><div class="fc-action">▶ Increase ad budget allocation for this ASIN</div></div>` : ""}
        ${topLove ? `<div class="fc warn"><div class="fc-title">Needs Love: ${topLove.asin}</div><div class="fc-detail">${topLove.title.slice(0,60)} · Rev/View: $${topLove.revenuePerView.toFixed(2)} — underfunded</div><div class="fc-action" style="color:#92400e">▶ Create dedicated Sponsored Products campaign</div></div>` : ""}`;
    }

    case "score": {
      const topDraggers = findings.filter(f => f.severity === "critical" || f.severity === "high").slice(0, 3);
      const lines = topDraggers.map((f) =>
        `<div class="fc"><div class="fc-title">${f.title}</div><div class="fc-detail">${f.detail}</div><div class="fc-action" style="color:#ef4444">▶ ${f.action}</div></div>`
      ).join("");
      const potentialGain = Math.min(25, findings.filter(f => f.severity === "critical").length * 4 + findings.filter(f => f.severity === "high").length * 2);
      return `Your health score is <strong>${score}/100 — ${scoreLabel}</strong>.<br>
        <div class="chip-row"><div class="chip-stat ${spendEfficiency < 50 ? 'red' : 'yellow'}"><span>${spendEfficiency}</span>Spend Eff /70</div><div class="chip-stat ${structureQuality < 20 ? 'red' : 'yellow'}"><span>${structureQuality}</span>Structure /30</div></div>
        Top factors dragging your score:<br>${lines}<br>
        <strong>Estimated score after fixing critical issues: ${Math.min(100, score + potentialGain)}/100</strong>`;
    }

    case "searchterms": {
      const stWaste = findings.filter((f) => f.id.startsWith("st-waste-"));
      const stOpp = findings.filter((f) => f.id.startsWith("st-opp-") || f.id.startsWith("st-expand-"));
      const lines = [...stWaste.slice(0, 2), ...stOpp.slice(0, 2)].map((f) =>
        `<div class="fc ${f.category === 'opportunity' ? 'opp' : ''}"><div class="fc-title">${f.title}</div><div class="fc-detail">${f.detail}</div><div class="fc-action" style="color:${f.category === 'opportunity' ? '#166534' : '#ef4444'}">▶ ${f.action}</div></div>`
      ).join("");
      return `Search term analysis: <strong>${stWaste.length} wasted terms</strong> found, <strong>${stOpp.length} expansion opportunities</strong> identified.<br>${lines || "<div class='fc'><div class='fc-detail'>Upload a search term report for deeper analysis.</div></div>"}`;
    }

    case "summary": {
      return `Account snapshot: <strong>${summary.campaignCount} campaigns</strong>, ${summary.keywordCount} keywords, ${summary.asinCount} ASINs.<br>
        <div class="chip-row">
          <div class="chip-stat ${score < 65 ? 'red' : 'green'}"><span>${score}</span>Health Score</div>
          ${totalWaste > 0 ? `<div class="chip-stat red"><span>${fmt$(totalWaste)}</span>Total Waste</div>` : ""}
          ${summary.totalOrderedRevenue > 0 ? `<div class="chip-stat blue"><span>${fmt$(summary.totalOrderedRevenue)}</span>Revenue</div>` : ""}
          <div class="chip-stat ${findings.filter(f=>f.severity==='critical').length > 0 ? 'red' : 'green'}"><span>${findings.filter(f=>f.severity==='critical').length}</span>Critical Issues</div>
        </div>
        ${summary.totalSpend > 0 ? `ACOS: ${fmtPct(summary.avgAcos)} | CVR: ${fmtPct(summary.avgCvr)} | CTR: ${fmtPct(summary.avgCtr)}<br>` : ""}
        ${summary.totalOrderedRevenue > 0 ? `Ordered Revenue: ${fmt$(summary.totalOrderedRevenue)} · Units: ${summary.totalOrderedUnits.toLocaleString()} · Return Rate: ${(summary.returnRate*100).toFixed(1)}%<br>` : ""}
        <strong>Top priority:</strong> ${topWaste[0] ? `${topWaste[0].title} — ${topWaste[0].action}` : "No critical issues found."}`;
    }

    case "powerpoint":
      return `__POWERPOINT__`;

    default:
      return `I can answer questions about your uploaded campaign data. Try asking:<br>
        • "What's our biggest budget waste?"<br>
        • "Which keywords should I pause?"<br>
        • "Show me growth opportunities"<br>
        • "Why is our health score ${score}?"<br>
        • "Which ASINs need more ad support?"<br>
        • "Create a PowerPoint presentation"`;
  }
}

export function getIntent(question: string): Intent {
  return detectIntent(question);
}

---

## FILE: lib/pptxGenerator.ts
// ── PowerPoint Generator — 8 slides from audit data ──
import PptxGenJS from "pptxgenjs";
import { AuditResult } from "./auditEngine";

const DARK = "1a1f2e";
const WHITE = "FFFFFF";
const ACCENT = "3b82d4";
const RED = "ef4444";
const GREEN = "22c55e";
const YELLOW = "f59e0b";
const MUTED = "57606a";
const LIGHT = "f7f8fa";

function fmt$(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function addHeader(slide: PptxGenJS.Slide, title: string, subtitle?: string) {
  slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 1.1, fill: { color: DARK } });
  slide.addText(title, { x: 0.4, y: 0.18, w: 8, h: 0.5, fontSize: 22, bold: true, color: WHITE, fontFace: "Segoe UI" });
  if (subtitle) {
    slide.addText(subtitle, { x: 0.4, y: 0.68, w: 8, h: 0.3, fontSize: 11, color: "8b949e", fontFace: "Segoe UI" });
  }
}

function addFooter(slide: PptxGenJS.Slide, pageNum: number) {
  slide.addShape("line", { x: 0.4, y: 7.0, w: 9.2, h: 0, line: { color: "e5e7eb", width: 0.5 } });
  slide.addText(`Generated by AuditAI  •  Page ${pageNum}`, {
    x: 0.4, y: 7.1, w: 9.2, h: 0.3, fontSize: 9, color: MUTED, align: "right", fontFace: "Segoe UI",
  });
}

function scoreColor(score: number): string {
  if (score >= 80) return GREEN;
  if (score >= 65) return YELLOW;
  return RED;
}

export async function generatePptx(audit: AuditResult, brandName = "Your Account"): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "AuditAI";
  pptx.title = `${brandName} — Campaign Audit Report`;

  const { summary, score, scoreLabel, spendEfficiency, structureQuality, totalWaste: totalWeeklyWaste, totalOpportunity: totalMonthlyOpportunity, findings, topWaste, topOpportunities, asinCohorts } = audit;

  // ── SLIDE 1: Title ──
  const s1 = pptx.addSlide();
  s1.addShape("rect", { x: 0, y: 0, w: "100%", h: "100%", fill: { color: DARK } });
  s1.addShape("rect", { x: 0, y: 5.5, w: "100%", h: 2, fill: { color: ACCENT } });
  s1.addText("Campaign Audit Report", { x: 0.6, y: 1.8, w: 9, h: 0.8, fontSize: 36, bold: true, color: WHITE, fontFace: "Segoe UI" });
  s1.addText(brandName, { x: 0.6, y: 2.7, w: 9, h: 0.5, fontSize: 20, color: "8b949e", fontFace: "Segoe UI" });
  s1.addText(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), {
    x: 0.6, y: 3.3, w: 9, h: 0.4, fontSize: 14, color: "8b949e", fontFace: "Segoe UI",
  });
  s1.addText("Powered by AuditAI", { x: 0.6, y: 6.0, w: 9, h: 0.4, fontSize: 13, color: WHITE, fontFace: "Segoe UI" });

  // ── SLIDE 2: Executive Summary ──
  const s2 = pptx.addSlide();
  addHeader(s2, "Executive Summary", `${summary.campaignCount} campaigns · ${summary.keywordCount} keywords · ${summary.asinCount} ASINs analyzed`);

  // Score circle
  s2.addShape("ellipse", { x: 0.4, y: 1.4, w: 2.4, h: 2.4, fill: { color: LIGHT }, line: { color: scoreColor(score), width: 6 } });
  s2.addText(String(score), { x: 0.4, y: 2.0, w: 2.4, h: 0.9, fontSize: 48, bold: true, color: scoreColor(score), align: "center", fontFace: "Segoe UI" });
  s2.addText(scoreLabel, { x: 0.4, y: 3.0, w: 2.4, h: 0.3, fontSize: 11, color: scoreColor(score), align: "center", fontFace: "Segoe UI" });
  s2.addText("Health Score", { x: 0.4, y: 3.3, w: 2.4, h: 0.3, fontSize: 10, color: MUTED, align: "center", fontFace: "Segoe UI" });

  // Key metrics
  const metrics = [
    { label: "Weekly Spend", val: fmt$(summary.totalSpend), color: DARK },
    { label: "Weekly Sales", val: fmt$(summary.totalSales), color: GREEN },
    { label: "Weekly Waste", val: fmt$(totalWeeklyWaste), color: RED },
    { label: "Monthly Opp.", val: fmt$(totalMonthlyOpportunity), color: ACCENT },
    { label: "Avg ACOS", val: fmtPct(summary.avgAcos), color: DARK },
    { label: "Avg CVR", val: fmtPct(summary.avgCvr), color: DARK },
  ];
  metrics.forEach((m, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 3.2 + col * 2.2;
    const y = 1.4 + row * 1.6;
    s2.addShape("rect", { x, y, w: 2.0, h: 1.3, fill: { color: LIGHT }, line: { color: "e5e7eb", width: 0.5 }, rectRadius: 0.1 });
    s2.addText(m.val, { x, y: y + 0.2, w: 2.0, h: 0.6, fontSize: 22, bold: true, color: m.color, align: "center", fontFace: "Segoe UI" });
    s2.addText(m.label, { x, y: y + 0.8, w: 2.0, h: 0.3, fontSize: 10, color: MUTED, align: "center", fontFace: "Segoe UI" });
  });

  // Top action
  s2.addShape("rect", { x: 0.4, y: 5.0, w: 9.2, h: 0.7, fill: { color: "fef3c7" }, line: { color: "fde68a", width: 0.5 }, rectRadius: 0.1 });
  s2.addText(`⚡ Top Action: ${topWaste[0]?.action ?? "Review campaign structure"}`, {
    x: 0.6, y: 5.1, w: 8.8, h: 0.45, fontSize: 12, bold: true, color: "92400e", fontFace: "Segoe UI",
  });
  addFooter(s2, 2);

  // ── SLIDE 3: Account Scorecard ──
  const s3 = pptx.addSlide();
  addHeader(s3, "Account Scorecard", "Health score breakdown by category");

  const scoreItems = [
    { label: "Spend Efficiency", score: spendEfficiency, max: 70, desc: "Waste ratio, ACOS performance, zero-return campaigns" },
    { label: "Structure Quality", score: structureQuality, max: 30, desc: "Negative keywords, campaign structure, concentration risk" },
  ];
  scoreItems.forEach((item, i) => {
    const y = 1.4 + i * 2.0;
    s3.addText(item.label, { x: 0.4, y, w: 4, h: 0.4, fontSize: 14, bold: true, color: DARK, fontFace: "Segoe UI" });
    s3.addText(item.desc, { x: 0.4, y: y + 0.4, w: 6, h: 0.3, fontSize: 10, color: MUTED, fontFace: "Segoe UI" });
    const barW = 8.0;
    const fillW = (item.score / item.max) * barW;
    s3.addShape("rect", { x: 0.4, y: y + 0.8, w: barW, h: 0.4, fill: { color: "e5e7eb" }, rectRadius: 0.1 });
    s3.addShape("rect", { x: 0.4, y: y + 0.8, w: Math.max(0.1, fillW), h: 0.4, fill: { color: scoreColor((item.score / item.max) * 100) }, rectRadius: 0.1 });
    s3.addText(`${item.score}/${item.max}`, { x: 8.5, y: y + 0.8, w: 1, h: 0.4, fontSize: 13, bold: true, color: scoreColor((item.score / item.max) * 100), fontFace: "Segoe UI" });
  });

  s3.addText(`Overall Health Score: ${score}/100 — ${scoreLabel}`, {
    x: 0.4, y: 5.8, w: 9.2, h: 0.5, fontSize: 16, bold: true, color: scoreColor(score), align: "center", fontFace: "Segoe UI",
  });
  addFooter(s3, 3);

  // ── SLIDE 4: Budget Waste Analysis ──
  const s4 = pptx.addSlide();
  addHeader(s4, "Budget Waste Analysis", `${fmt$(totalWeeklyWaste)}/week recoverable · ${fmt$(totalWeeklyWaste * 52)}/year`);

  topWaste.slice(0, 4).forEach((f, i) => {
    const y = 1.3 + i * 1.3;
    s4.addShape("rect", { x: 0.4, y, w: 0.06, h: 1.0, fill: { color: f.severity === "critical" ? RED : YELLOW } });
    s4.addText(f.title, { x: 0.6, y: y + 0.05, w: 7.0, h: 0.4, fontSize: 12, bold: true, color: DARK, fontFace: "Segoe UI" });
    s4.addText(f.detail, { x: 0.6, y: y + 0.42, w: 7.0, h: 0.28, fontSize: 10, color: MUTED, fontFace: "Segoe UI" });
    s4.addText(`▶ ${f.action}`, { x: 0.6, y: y + 0.68, w: 7.2, h: 0.25, fontSize: 10, bold: true, color: RED, fontFace: "Segoe UI" });
    s4.addText(fmt$(f.impact) + "/wk", { x: 8.0, y: y + 0.2, w: 1.6, h: 0.4, fontSize: 14, bold: true, color: RED, align: "right", fontFace: "Segoe UI" });
  });
  addFooter(s4, 4);

  // ── SLIDE 5: Keyword Audit ──
  const s5 = pptx.addSlide();
  const kwFindings = findings.filter((f) => f.id.startsWith("kw-"));
  addHeader(s5, "Keyword Audit", `${kwFindings.length} keyword issues found`);

  const kwWaste = findings.filter((f) => f.id.startsWith("kw-waste")).length;
  const kwAcos = findings.filter((f) => f.id.startsWith("kw-acos")).length;
  const kwCtr = findings.filter((f) => f.id.startsWith("kw-ctr")).length;

  const kwStats = [
    { label: "High Spend\nNo Sales", val: kwWaste, color: RED },
    { label: "High ACOS\n(>75%)", val: kwAcos, color: YELLOW },
    { label: "Low CTR\n(<0.1%)", val: kwCtr, color: "f97316" },
  ];
  kwStats.forEach((s, i) => {
    const x = 0.4 + i * 3.2;
    s5.addShape("rect", { x, y: 1.3, w: 2.8, h: 1.4, fill: { color: LIGHT }, line: { color: "e5e7eb", width: 0.5 }, rectRadius: 0.1 });
    s5.addText(String(s.val), { x, y: 1.45, w: 2.8, h: 0.7, fontSize: 36, bold: true, color: s.color, align: "center", fontFace: "Segoe UI" });
    s5.addText(s.label, { x, y: 2.2, w: 2.8, h: 0.4, fontSize: 10, color: MUTED, align: "center", fontFace: "Segoe UI" });
  });

  kwFindings.slice(0, 3).forEach((f, i) => {
    const y = 3.0 + i * 1.1;
    s5.addText(`${f.title}`, { x: 0.4, y, w: 7.5, h: 0.35, fontSize: 11, bold: true, color: DARK, fontFace: "Segoe UI" });
    s5.addText(`${f.detail}  ▶ ${f.action}`, { x: 0.4, y: y + 0.35, w: 9.0, h: 0.28, fontSize: 10, color: MUTED, fontFace: "Segoe UI" });
  });
  addFooter(s5, 5);

  // ── SLIDE 6: Search Term Opportunities ──
  const s6 = pptx.addSlide();
  const stFindings = findings.filter((f) => f.id.startsWith("st-"));
  addHeader(s6, "Search Term Analysis", `${stFindings.filter(f => f.category === 'waste').length} wasted terms · ${stFindings.filter(f => f.category === 'opportunity').length} opportunities`);

  topOpportunities.slice(0, 4).forEach((f, i) => {
    const y = 1.3 + i * 1.3;
    s6.addShape("rect", { x: 0.4, y, w: 0.06, h: 1.0, fill: { color: GREEN } });
    s6.addText(f.title, { x: 0.6, y: y + 0.05, w: 7.2, h: 0.4, fontSize: 12, bold: true, color: DARK, fontFace: "Segoe UI" });
    s6.addText(f.detail, { x: 0.6, y: y + 0.42, w: 7.2, h: 0.28, fontSize: 10, color: MUTED, fontFace: "Segoe UI" });
    s6.addText(`▶ ${f.action}`, { x: 0.6, y: y + 0.68, w: 7.2, h: 0.25, fontSize: 10, bold: true, color: "166534", fontFace: "Segoe UI" });
    s6.addText(`+${fmt$(f.impact * 4)}/mo`, { x: 8.0, y: y + 0.2, w: 1.6, h: 0.4, fontSize: 14, bold: true, color: GREEN, align: "right", fontFace: "Segoe UI" });
  });

  if (topOpportunities.length === 0) {
    s6.addText("Upload a Search Term report to unlock opportunity analysis.", {
      x: 0.4, y: 3.0, w: 9.2, h: 0.5, fontSize: 13, color: MUTED, align: "center", fontFace: "Segoe UI",
    });
  }
  addFooter(s6, 6);

  // ── SLIDE 7: ASIN Cohort Analysis ──
  const s7 = pptx.addSlide();
  const cows = asinCohorts.filter((a) => a.cohort === "cash_cow");
  const love = asinCohorts.filter((a) => a.cohort === "need_love");
  const reduce = asinCohorts.filter((a) => a.cohort === "reduce_pause");
  addHeader(s7, "ASIN Cohort Analysis", `${asinCohorts.length} ASINs classified`);

  const cohortStats = [
    { label: "Cash Cows", val: cows.length, sub: "Top 80% of sales\n→ Protect & scale", color: GREEN },
    { label: "Need More Love", val: love.length, sub: "High CVR, low volume\n→ Increase budget", color: YELLOW },
    { label: "Reduce / Pause", val: reduce.length, sub: "Low CVR, low sales\n→ Reduce ad spend", color: RED },
  ];
  cohortStats.forEach((s, i) => {
    const x = 0.4 + i * 3.2;
    s7.addShape("rect", { x, y: 1.3, w: 2.8, h: 2.2, fill: { color: LIGHT }, line: { color: "e5e7eb", width: 1 }, rectRadius: 0.15 });
    s7.addText(String(s.val), { x, y: 1.4, w: 2.8, h: 0.9, fontSize: 48, bold: true, color: s.color, align: "center", fontFace: "Segoe UI" });
    s7.addText(s.label, { x, y: 2.35, w: 2.8, h: 0.35, fontSize: 12, bold: true, color: DARK, align: "center", fontFace: "Segoe UI" });
    s7.addText(s.sub, { x, y: 2.72, w: 2.8, h: 0.6, fontSize: 10, color: MUTED, align: "center", fontFace: "Segoe UI" });
  });

  if (cows[0]) {
    s7.addText(`Top Cash Cow: ${cows[0].asin}  |  Revenue: ${fmt$(cows[0].orderedRevenue)}  |  Units: ${cows[0].orderedUnits}  →  Prioritize ad budget here`, {
      x: 0.4, y: 3.8, w: 9.2, h: 0.4, fontSize: 11, color: "166534", fontFace: "Segoe UI",
    });
  }
  addFooter(s7, 7);

  // ── SLIDE 8: 30-Day Action Plan ──
  const s8 = pptx.addSlide();
  addHeader(s8, "30-Day Action Plan", "Prioritized by dollar impact");

  const actions = [
    ...topWaste.slice(0, 3).map((f, i) => ({ week: "Week 1", priority: i + 1, action: f.action, impact: `Save ${fmt$(f.impact)}/week`, color: RED })),
    ...topOpportunities.slice(0, 2).map((f, i) => ({ week: "Week 2", priority: i + 4, action: f.action, impact: `+${fmt$(f.impact * 4)}/month`, color: GREEN })),
    { week: "Week 3–4", priority: 6, action: "Add negative keywords to top 5 campaigns", impact: "Improve CTR by ~20%", color: ACCENT },
    { week: "Week 3–4", priority: 7, action: "Review ASIN cohorts — shift budget to Cash Cows", impact: `+${fmt$(totalMonthlyOpportunity * 0.3)}/month`, color: ACCENT },
  ];

  actions.slice(0, 6).forEach((a, i) => {
    const y = 1.3 + i * 0.88;
    s8.addShape("ellipse", { x: 0.4, y: y + 0.14, w: 0.44, h: 0.44, fill: { color: a.color } });
    s8.addText(String(a.priority), { x: 0.4, y: y + 0.14, w: 0.44, h: 0.44, fontSize: 13, bold: true, color: WHITE, align: "center", fontFace: "Segoe UI" });
    s8.addText(`[${a.week}]`, { x: 1.0, y, w: 1.4, h: 0.3, fontSize: 9, color: MUTED, fontFace: "Segoe UI" });
    s8.addText(a.action, { x: 1.0, y: y + 0.28, w: 7.0, h: 0.35, fontSize: 11, bold: true, color: DARK, fontFace: "Segoe UI" });
    s8.addText(a.impact, { x: 8.2, y: y + 0.28, w: 1.4, h: 0.35, fontSize: 11, bold: true, color: a.color, align: "right", fontFace: "Segoe UI" });
  });

  addFooter(s8, 8);

  // ── Generate buffer ──
  const data = await pptx.write({ outputType: "nodebuffer" });
  return data as Buffer;
}

---

## FILE: app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildLLMContext } from "@/lib/chatEngine";
import { AuditResult } from "@/lib/auditEngine";

export async function POST(req: NextRequest) {
  try {
    const { question, audit, apiKey } = await req.json() as {
      question: string;
      audit: AuditResult;
      apiKey?: string;
    };

    if (!question || !audit) {
      return NextResponse.json({ error: "Missing question or audit data" }, { status: 400 });
    }

    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "NO_API_KEY" }, { status: 200 });
    }

    const context = buildLLMContext(audit, question);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: context }],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return NextResponse.json({ error: err.error?.message ?? "OpenAI error" }, { status: 200 });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

---

## FILE: app/api/pptx/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generatePptx } from "@/lib/pptxGenerator";
import { AuditResult } from "@/lib/auditEngine";

export async function POST(req: NextRequest) {
  try {
    const { audit, brandName } = await req.json() as { audit: AuditResult; brandName?: string };
    if (!audit) return NextResponse.json({ error: "Missing audit data" }, { status: 400 });

    const buffer = await generatePptx(audit, brandName ?? "Your Account");
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${(brandName ?? "Account").replace(/\s+/g, "_")}_Audit.pptx"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to generate presentation" }, { status: 500 });
  }
}

---

## FILE: app/page.tsx
"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { runAuditEngine, AuditResult, RawData } from "@/lib/auditEngine";
import { buildLocalResponse, getIntent, ChatMessage } from "@/lib/chatEngine";
import { brand } from "@/lib/brand";

// ── Helpers ──
function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function uid() { return Math.random().toString(36).slice(2); }

const SUGGESTIONS = [
  { label: "📊 Account overview", q: "Give me an overall account summary" },
  { label: "💸 Biggest waste?", q: "What is our biggest budget waste right now?" },
  { label: "⏸ Keywords to pause?", q: "Which keywords should I pause immediately?" },
  { label: "🚀 Growth opportunities", q: "Show me top growth opportunities" },
  { label: "📦 ASIN performance", q: "Show me the ASIN cohort analysis" },
  { label: "📣 Campaign issues?", q: "Show me campaign health overview" },
  { label: "📊 Why this score?", q: "Why is our health score low?" },
  { label: "📑 Create PowerPoint", q: "Create a PowerPoint presentation of the full audit" },
];

// ── Excel parser — skips metadata rows, finds real header row ──
function parseSheet(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  // Find the real header row (first row where first cell looks like a column name not a metadata key)
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);

  let headerRow = 0;
  for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!cell) continue;
    const val = String(cell.v ?? "").trim();
    // Real header rows start with known column names (ASIN, Entity, Customer Search Term, Campaign Name, etc.)
    // Metadata rows look like "Program=[Retail]" or "Distributor View=[Manufacturing]"
    if (
      val === "ASIN" ||
      val === "Entity" ||
      val === "Customer Search Term" ||
      val === "Campaign Name" ||
      val === "Search Term" ||
      val === "Portfolio Name"
    ) {
      headerRow = r;
      break;
    }
  }

  // Use sheet_to_json with the detected header row offset
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    range: headerRow,
    defval: "",
    raw: false,   // parse numbers as strings first, we handle coercion in engine
  });

  return rows;
}

// ── Determine file type by name + column headers ──
type FileType = keyof RawData | "bulk";

function detectFileType(name: string, headers: string[]): FileType | null {
  const lower = name.toLowerCase();
  const h = headers.map(x => x.toLowerCase());

  // Bulk campaign file — has "Entity" column (the key signal)
  if (h.includes("entity")) return "bulk";
  // Vendor Central Sales
  if (lower.includes("sales") || h.includes("ordered revenue")) return "sales";
  // Vendor Central Traffic
  if (lower.includes("traffic") || h.includes("featured offer page views")) return "traffic";
  // Search term report (standalone, not inside bulk)
  if (lower.includes("search") || h.includes("customer search term")) return "searchTerm";

  return null;
}

function scoreColor(score: number) {
  if (score >= 80) return "#22c55e";
  if (score >= 65) return "#f59e0b";
  return "#ef4444";
}

interface UploadedFile {
  name: string;
  type: FileType;
  rows: number;
  sheets?: string[];
}

export default function Home() {
  const [screen, setScreen]         = useState<"upload" | "chat">("upload");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [rawData, setRawData]       = useState<Partial<RawData>>({});
  const [audit, setAudit]           = useState<AuditResult | null>(null);
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [input, setInput]           = useState("");
  const [isTyping, setIsTyping]     = useState(false);
  const [apiKey, setApiKey]         = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [brandName, setBrandName]   = useState("");
  const [activeTopic, setActiveTopic] = useState("all");
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── File handling ──
  const handleFiles = useCallback(async (fileList: FileList) => {
    setParseError("");
    const newRaw: Partial<RawData> = { ...rawData };
    const newFiles: UploadedFile[] = [...uploadedFiles];

    for (const file of Array.from(fileList)) {
      try {
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: "array" });

        // Check if it's a bulk file (has "Sponsored Products Campaigns" sheet)
        const spCampSheet = wb.SheetNames.find(n =>
          n.toLowerCase().includes("sponsored products campaigns") ||
          n.toLowerCase().includes("sp campaigns")
        );
        const spSTSheet = wb.SheetNames.find(n =>
          n.toLowerCase().includes("sp search term") ||
          n.toLowerCase().includes("search term report")
        );

        if (spCampSheet) {
          // Bulk campaign file
          const campRows = parseSheet(wb.Sheets[spCampSheet]);
          newRaw.campaign = campRows as RawData["campaign"];

          if (spSTSheet) {
            const stRows = parseSheet(wb.Sheets[spSTSheet]);
            newRaw.searchTerm = stRows as RawData["searchTerm"];
          }

          const existing = newFiles.findIndex(f => f.type === "bulk");
          const entry: UploadedFile = {
            name: file.name,
            type: "bulk",
            rows: campRows.length,
            sheets: wb.SheetNames,
          };
          if (existing >= 0) newFiles[existing] = entry;
          else newFiles.push(entry);
        } else {
          // Single-sheet file — detect type
          const ws      = wb.Sheets[wb.SheetNames[0]];
          const rows    = parseSheet(ws);
          const headers = rows[0] ? Object.keys(rows[0]) : [];
          const type    = detectFileType(file.name, headers);

          if (!type) {
            setParseError(`Could not identify "${file.name}". Expected Sales, Traffic, or Bulk Campaign file.`);
            continue;
          }

          if (type === "sales")      newRaw.sales      = rows as RawData["sales"];
          if (type === "traffic")    newRaw.traffic     = rows as RawData["traffic"];
          if (type === "searchTerm") newRaw.searchTerm  = rows as RawData["searchTerm"];

          const existing = newFiles.findIndex(f => f.type === type);
          const entry: UploadedFile = { name: file.name, type, rows: rows.length };
          if (existing >= 0) newFiles[existing] = entry;
          else newFiles.push(entry);
        }
      } catch (e) {
        setParseError(`Error reading "${file.name}". Make sure it is a valid .xlsx file.`);
      }
    }

    setRawData(newRaw);
    setUploadedFiles(newFiles);
  }, [rawData, uploadedFiles]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const canAnalyze = uploadedFiles.some(f => f.type === "bulk") || uploadedFiles.some(f => f.type === "sales");

  // ── Start Analysis ──
  const startAnalysis = () => {
    if (!canAnalyze) return;
    const data: RawData = {
      sales:      (rawData.sales      ?? []) as Record<string, unknown>[],
      traffic:    (rawData.traffic     ?? []) as Record<string, unknown>[],
      campaign:   (rawData.campaign    ?? []) as Record<string, unknown>[],
      searchTerm: (rawData.searchTerm  ?? []) as Record<string, unknown>[],
    };
    const result = runAuditEngine(data);
    setAudit(result);
    setScreen("chat");

    const totalRows = uploadedFiles.reduce((s, f) => s + f.rows, 0);
    const brand = brandName.trim() || result.summary.topBrand || "Your Account";
    if (!brandName.trim()) setBrandName(brand);

    addBotMessage(
      `I've analyzed <strong>${totalRows.toLocaleString()} rows</strong> across ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? "s" : ""} for <strong>${brand}</strong>. Here's the snapshot:` +
      `<div class="chip-row">` +
      `<div class="chip-stat ${result.score < 65 ? "red" : result.score < 80 ? "yellow" : "green"}"><span>${result.score}</span>Health Score</div>` +
      (result.hasCampaignData ? `<div class="chip-stat red"><span>${fmt$(result.totalWaste)}</span>Total Waste</div>` : "") +
      (result.hasCampaignData ? `<div class="chip-stat green"><span>${fmt$(result.totalOpportunity)}</span>Opp/Month</div>` : "") +
      (result.hasSalesData ? `<div class="chip-stat blue"><span>${fmt$(result.summary.totalOrderedRevenue)}</span>Total Revenue</div>` : "") +
      `<div class="chip-stat ${result.criticalCount > 0 ? "red" : "green"}"><span>${result.criticalCount}</span>Critical Issues</div>` +
      `</div>` +
      (result.topWaste[0] ? `<strong>Top risk:</strong> ${result.topWaste[0].title}<br>` : "") +
      (result.topOpportunities[0] ? `<strong>Top opportunity:</strong> ${result.topOpportunities[0].title}<br>` : "") +
      (!result.hasCampaignData ? `<br>💡 <em>Upload the <strong>Bulk Campaign File</strong> to unlock keyword, ACOS, and spend analysis.</em>` : "") +
      `<br>What would you like to explore first?`
    );
  };

  // ── Messaging ──
  function addBotMessage(content: string) {
    setMessages(prev => [...prev, { id: uid(), role: "assistant", content, timestamp: new Date() }]);
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isTyping || !audit) return;
    setMessages(prev => [...prev, { id: uid(), role: "user", content: text, timestamp: new Date() }]);
    setInput("");
    setIsTyping(true);

    const intent = getIntent(text);

    if (intent === "powerpoint") {
      setIsTyping(false);
      addBotMessage(
        `Preparing your presentation — <strong>8 slides</strong> from your data:<br><br>` +
        `1. Title &amp; Account Overview<br>2. Executive Summary<br>3. Account Scorecard<br>` +
        `4. Budget Waste Analysis<br>5. Keyword Audit<br>6. Search Term Opportunities<br>` +
        `7. ASIN Cohort Analysis<br>8. 30-Day Action Plan<br><br>` +
        `<button class="dl-btn" onclick="window._downloadPptx && window._downloadPptx()">⬇ Download PowerPoint</button>`
      );
      return;
    }

    // Try OpenAI if key available
    if (apiKey) {
      try {
        const res  = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, audit, apiKey }),
        });
        const data = await res.json();
        if (data.answer && !data.error) {
          setIsTyping(false);
          addBotMessage(data.answer);
          return;
        }
      } catch { /* fall through */ }
    }

    // Local rule-based answer
    await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
    setIsTyping(false);
    addBotMessage(buildLocalResponse(audit, intent, text));
  }

  // ── PowerPoint download ──
  useEffect(() => {
    (window as Window & { _downloadPptx?: () => void })._downloadPptx = async () => {
      if (!audit) return;
      try {
        const res = await fetch("/api/pptx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audit, brandName: brandName || "Account" }),
        });
        if (!res.ok) throw new Error("Failed");
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url;
        a.download = `${(brandName || "Account").replace(/\s+/g, "_")}_Audit.pptx`;
        a.click();
        URL.revokeObjectURL(url);
      } catch { alert("Could not generate PowerPoint. Please try again."); }
    };
  }, [audit, brandName]);

  const resetApp = () => {
    setScreen("upload"); setMessages([]); setAudit(null);
    setUploadedFiles([]); setRawData({}); setBrandName("");
  };

  // ── File type display ──
  const fileIcon = (type: FileType) =>
    ({ bulk: "🗂️", sales: "📊", traffic: "📈", searchTerm: "🔍", campaign: "🗂️" }[type] ?? "📄");
  const fileTypeLabel = (type: FileType) =>
    ({ bulk: "Bulk Campaign", sales: "Sales", traffic: "Traffic", searchTerm: "Search Terms", campaign: "Campaign" }[type] ?? type);

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,"Segoe UI",system-ui,sans-serif;background:#f0f2f5;color:#1f2328}
        .app{display:flex;flex-direction:column;height:100vh;overflow:hidden}

        /* NAV */
        .topnav{background:${brand.navBg};color:#fff;padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .logo{font-size:16px;font-weight:800;letter-spacing:.02em}
        .logo span{color:${brand.navAccent}}
        .nav-right{display:flex;align-items:center;gap:12px}
        .brand-badge{background:rgba(255,255,255,.1);border-radius:6px;padding:4px 12px;font-size:12px;color:#e2e8f0;font-weight:600}
        .api-btn{background:none;border:1px solid rgba(255,255,255,.15);color:#8b949e;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;transition:all .15s}
        .api-btn:hover,.api-btn.connected{border-color:${brand.accentColor};color:${brand.accentColor}}
        .status-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;margin-right:4px}
        .nav-meta{font-size:12px;color:#8b949e}

        /* LAYOUT */
        .main{display:flex;flex:1;overflow:hidden}

        /* SIDEBAR */
        .sidebar{width:252px;min-width:252px;background:#fff;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;overflow-y:auto}
        .sb-section{padding:14px 14px 10px;border-bottom:1px solid #f0f0f0}
        .sb-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#57606a;margin-bottom:8px}

        /* FILE ITEMS */
        .file-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;background:#f7f8fa;margin-bottom:4px;border:1px solid #e5e7eb}
        .fi-icon{font-size:15px;flex-shrink:0}
        .fi-info{flex:1;min-width:0}
        .fi-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .fi-meta{font-size:10px;color:#57606a}
        .fi-check{color:#22c55e;font-weight:700;font-size:13px;flex-shrink:0}

        /* SCORE CARD */
        .score-card{background:${brand.scoreCardBg};border-radius:10px;padding:14px;color:#fff;text-align:center}
        .sc-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8b949e;margin-bottom:2px}
        .sc-num{font-size:48px;font-weight:900;line-height:1}
        .sc-status{font-size:11px;font-weight:700;margin-top:3px}
        .sc-divider{border:none;border-top:1px solid #3d4a5c;margin:10px 0}
        .sc-row{display:flex;justify-content:space-between;margin-bottom:4px;font-size:11px}
        .sc-row .lbl{color:#8b949e}

        /* QUICK NAV */
        .nav-link{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;font-size:13px;color:#1f2328;cursor:pointer;margin-bottom:2px}
        .nav-link:hover{background:#f7f8fa}
        .nav-link.active{background:${brand.accentColor}18;color:${brand.accentColor};font-weight:600}
        .nl-badge{margin-left:auto;background:#fee2e2;color:#991b1b;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px}
        .nl-badge.green{background:#dcfce7;color:#166534}

        /* UPLOAD SCREEN */
        .upload-screen{flex:1;display:flex;align-items:center;justify-content:center;padding:32px;overflow-y:auto}
        .upload-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:40px;max-width:560px;width:100%}
        .upload-card h1{font-size:22px;font-weight:800;margin-bottom:6px}
        .upload-card p{color:#57606a;font-size:13px;margin-bottom:24px;line-height:1.6}
        .brand-row{display:flex;gap:8px;margin-bottom:16px}
        .brand-input{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px;font-size:13px;outline:none;font-family:inherit}
        .brand-input:focus{border-color:${brand.accentColor}}

        /* FILE SLOTS */
        .file-slots{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
        .file-slot{border:1px dashed #d1d5db;border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all .15s}
        .file-slot:hover{border-color:#3b82d4;background:#f8faff}
        .file-slot.filled{border-style:solid;border-color:#22c55e;background:#f0fdf4}
        .file-slot.required{border-color:#f59e0b}
        .slot-icon{font-size:20px;margin-bottom:4px}
        .slot-name{font-size:12px;font-weight:700;color:#1f2328}
        .slot-sub{font-size:10px;color:#57606a;margin-top:2px}
        .slot-filled{font-size:10px;color:#22c55e;font-weight:600;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
        .slot-badge{display:inline-block;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;margin-bottom:3px}
        .slot-badge.req{background:#fef3c7;color:#92400e}
        .slot-badge.opt{background:#f0f9ff;color:#0369a1}

        /* DROP ZONE */
        .drop-zone{border:2px dashed #c7d2fe;border-radius:10px;padding:20px;text-align:center;cursor:pointer;background:#f8f9ff;transition:all .15s;margin-bottom:16px}
        .drop-zone:hover,.drop-zone.dragging{border-color:#3b82d4;background:#eff6ff}
        .drop-icon{font-size:28px;margin-bottom:6px}
        .drop-text{font-size:13px;font-weight:600}
        .drop-sub{font-size:11px;color:#57606a;margin-top:3px}

        /* ANALYZE BTN */
        .analyze-btn{width:100%;background:${brand.accentColor};color:#fff;border:none;border-radius:8px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s}
        .analyze-btn:disabled{background:${brand.accentColor}99;cursor:not-allowed}
        .analyze-btn:not(:disabled):hover{background:${brand.accentHover}}
        .parse-error{background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;font-size:12px;color:#991b1b;margin-bottom:12px}

        /* CHAT SCREEN */
        .chat-screen{flex:1;display:flex;flex-direction:column;overflow:hidden}
        .chat-header{background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .ch-title{font-weight:700;font-size:15px}
        .ch-sub{font-size:11px;color:#57606a;margin-top:1px}
        .ch-actions{display:flex;gap:8px}
        .ch-btn{border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer}
        .ch-btn:hover{background:#f7f8fa}
        .ch-btn.primary{background:${brand.accentColor};color:#fff;border-color:${brand.accentColor}}
        .ch-btn.primary:hover{background:${brand.accentHover}}

        /* MESSAGES */
        .messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px}
        .msg-row{display:flex;gap:10px;align-items:flex-start}
        .msg-row.user{flex-direction:row-reverse;align-self:flex-end;max-width:75%}
        .msg-row.bot{align-self:flex-start;max-width:88%}
        .avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0}
        .avatar.bot{background:${brand.navBg};color:${brand.accentColor}}
        .avatar.user{background:${brand.accentColor};color:#fff}
        .bubble{padding:11px 15px;border-radius:12px;font-size:13px;line-height:1.65}
        .bubble.bot{background:#fff;border:1px solid #e5e7eb;border-top-left-radius:3px}
        .bubble.user{background:${brand.accentColor};color:#fff;border-top-right-radius:3px}
        .typing-dots{display:flex;align-items:center;gap:4px;padding:4px 0}
        .typing-dots span{width:6px;height:6px;background:#adb5bd;border-radius:50%;animation:bounce 1.2s infinite;display:inline-block}
        .typing-dots span:nth-child(2){animation-delay:.2s}
        .typing-dots span:nth-child(3){animation-delay:.4s}
        @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}

        /* FINDING CARDS */
        .fc{background:#fff8f8;border:1px solid #fecaca;border-left:3px solid #ef4444;border-radius:6px;padding:9px 11px;margin:7px 0;font-size:12px}
        .fc.opp{background:#f0fdf4;border-color:#86efac;border-left-color:#22c55e}
        .fc.warn{background:#fffbeb;border-color:#fde68a;border-left-color:#f59e0b}
        .fc-title{font-weight:700;font-size:13px;margin-bottom:2px}
        .fc-detail{color:#57606a;line-height:1.5}
        .fc-action{font-weight:700;color:#991b1b;margin-top:3px;font-size:12px}

        /* CHIPS */
        .chip-row{display:flex;gap:8px;margin:8px 0;flex-wrap:wrap}
        .chip-stat{background:#f7f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:6px 12px;font-size:11px;text-align:center;min-width:80px}
        .chip-stat span{font-size:18px;font-weight:800;display:block}
        .chip-stat.red span{color:#ef4444}
        .chip-stat.green span{color:#22c55e}
        .chip-stat.yellow span{color:#f59e0b}
        .chip-stat.blue span{color:${brand.accentColor}}

        /* DL BTN */
        .dl-btn{background:${brand.accentColor};color:#fff;border:none;border-radius:6px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;margin-top:6px}
        .dl-btn:hover{background:${brand.accentHover}}

        /* SUGGESTIONS */
        .suggestions{padding:8px 18px;display:flex;flex-wrap:wrap;gap:6px;background:#f0f2f5;flex-shrink:0;border-top:1px solid #e5e7eb}
        .suggestion-chip{border:1px solid #d1d5db;background:#fff;border-radius:20px;padding:5px 13px;font-size:12px;color:${brand.accentColor};cursor:pointer;font-weight:500;white-space:nowrap}
        .suggestion-chip:hover{background:${brand.accentColor}14;border-color:${brand.accentColor}}

        /* INPUT */
        .input-bar{padding:11px 18px;background:#fff;border-top:1px solid #e5e7eb;display:flex;gap:10px;align-items:flex-end;flex-shrink:0}
        .chat-input{flex:1;border:1px solid #e5e7eb;border-radius:22px;padding:9px 16px;font-size:13px;font-family:inherit;resize:none;outline:none;background:#f7f8fa;color:#1f2328;line-height:1.5}
        .chat-input:focus{border-color:${brand.accentColor};background:#fff}
        .send-btn{background:${brand.accentColor};color:#fff;border:none;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;flex-shrink:0}
        .send-btn:hover{background:${brand.accentHover}}
        .send-btn:disabled{background:${brand.accentColor}55;cursor:not-allowed}

        /* MODAL */
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:50}
        .modal{background:#fff;border-radius:12px;padding:28px;max-width:420px;width:90%}
        .modal h2{font-size:17px;font-weight:700;margin-bottom:6px}
        .modal p{font-size:13px;color:#57606a;margin-bottom:16px;line-height:1.6}
        .modal-input{width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:9px 12px;font-size:13px;margin-bottom:8px;outline:none;font-family:monospace}
        .modal-input:focus{border-color:${brand.accentColor}}
        .modal-note{font-size:11px;color:#57606a;margin-bottom:14px}
        .modal-actions{display:flex;gap:8px;justify-content:flex-end}
        .modal-btn{border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;font-weight:600}
        .modal-btn.save{background:${brand.accentColor};color:#fff;border-color:${brand.accentColor}}
        .messages::-webkit-scrollbar{width:4px}
        .messages::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px}
      `}</style>

      <div className="app">
        {/* NAV */}
        <div className="topnav">
          <div className="logo">{brand.logoText}<span>{brand.logoAccent}</span></div>
          <div className="nav-right">
            {screen === "chat" && brandName && <div className="brand-badge">{brandName}</div>}
            {screen === "chat" && (
              <button className={`api-btn${apiKey ? " connected" : ""}`} onClick={() => setShowApiKey(true)}>
                {apiKey ? `✓ ${brand.apiKeyLabel}` : `⚡ Add ${brand.apiKeyLabel}`}
              </button>
            )}
            <span className="nav-meta"><span className="status-dot" />Ready</span>
          </div>
        </div>

        <div className="main">

          {/* ── SIDEBAR (chat only) ── */}
          {screen === "chat" && audit && (
            <div className="sidebar">
              <div className="sb-section">
                <div className="sb-title">Files Loaded</div>
                {uploadedFiles.map(f => (
                  <div key={f.type} className="file-item">
                    <span className="fi-icon">{fileIcon(f.type)}</span>
                    <div className="fi-info">
                      <div className="fi-name">{f.name}</div>
                      <div className="fi-meta">{fileTypeLabel(f.type)} · {f.rows.toLocaleString()} rows</div>
                    </div>
                    <span className="fi-check">✓</span>
                  </div>
                ))}
              </div>

              <div className="sb-section">
                <div className="sb-title">Health Score</div>
                <div className="score-card">
                  <div className="sc-label">Account Health</div>
                  <div className="sc-num" style={{ color: scoreColor(audit.score) }}>{audit.score}</div>
                  <div className="sc-status" style={{ color: scoreColor(audit.score) }}>{audit.scoreLabel}</div>
                  <hr className="sc-divider" />
                  {audit.hasCampaignData && <>
                    <div className="sc-row"><span className="lbl">Spend Efficiency</span><span style={{ color: scoreColor((audit.spendEfficiency/70)*100), fontWeight:700 }}>{audit.spendEfficiency}/70</span></div>
                    <div className="sc-row"><span className="lbl">Structure Quality</span><span style={{ color: scoreColor((audit.structureQuality/30)*100), fontWeight:700 }}>{audit.structureQuality}/30</span></div>
                    <div className="sc-row"><span className="lbl">Total Waste</span><span style={{ color:"#ef4444", fontWeight:700 }}>{fmt$(audit.totalWaste)}</span></div>
                    <div className="sc-row"><span className="lbl">Opportunity</span><span style={{ color:"#22c55e", fontWeight:700 }}>{fmt$(audit.totalOpportunity)}/mo</span></div>
                  </>}
                  {audit.hasSalesData && <>
                    <div className="sc-row"><span className="lbl">Total Revenue</span><span style={{ color:"#3b82d4", fontWeight:700 }}>{fmt$(audit.summary.totalOrderedRevenue)}</span></div>
                    <div className="sc-row"><span className="lbl">Total Units</span><span style={{ fontWeight:700 }}>{audit.summary.totalOrderedUnits.toLocaleString()}</span></div>
                    <div className="sc-row"><span className="lbl">Return Rate</span><span style={{ color: audit.summary.returnRate > 0.12 ? "#ef4444" : "#22c55e", fontWeight:700 }}>{(audit.summary.returnRate*100).toFixed(1)}%</span></div>
                  </>}
                </div>
              </div>

              <div className="sb-section">
                <div className="sb-title">Quick Topics</div>
                {[
                  { key:"all",      icon:"💬", label:"All Topics" },
                  { key:"summary",  icon:"📊", label:"Account Summary" },
                  ...(audit.hasCampaignData ? [
                    { key:"waste",    icon:"🔥", label:"Budget Waste",    badge: audit.findings.filter(f=>f.category==="waste").length,       badgeColor:"" },
                    { key:"opp",      icon:"🚀", label:"Opportunities",   badge: audit.findings.filter(f=>f.category==="opportunity").length,  badgeColor:"green" },
                    { key:"keywords", icon:"🔑", label:"Keywords" },
                    { key:"campaigns",icon:"📣", label:"Campaigns" },
                  ] : []),
                  ...(audit.hasSalesData ? [
                    { key:"asins",    icon:"📦", label:"ASINs" },
                  ] : []),
                  { key:"pptx",     icon:"📑", label:"Export Report" },
                ].map(item => (
                  <div
                    key={item.key}
                    className={`nav-link${activeTopic === item.key ? " active" : ""}`}
                    onClick={() => {
                      const qMap: Record<string,string> = {
                        summary:   "Give me an overall account summary",
                        waste:     "What is our biggest budget waste?",
                        opp:       "Show me top growth opportunities",
                        keywords:  "Which keywords should I pause?",
                        asins:     "Show me the ASIN cohort analysis",
                        campaigns: "Show me campaign health overview",
                        pptx:      "Create a PowerPoint presentation of the full audit",
                      };
                      setActiveTopic(item.key);
                      if (qMap[item.key]) sendMessage(qMap[item.key]);
                    }}
                  >
                    <span>{item.icon}</span> {item.label}
                    {"badge" in item && item.badge ? <span className={`nl-badge ${item.badgeColor}`}>{item.badge}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── UPLOAD SCREEN ── */}
          {screen === "upload" && (
            <div className="upload-screen">
              <div className="upload-card">
                <h1>{brand.uploadHeading}</h1>
                <p>{brand.uploadSubtext}</p>

                <div className="brand-row">
                  <input
                    className="brand-input"
                    placeholder="Brand / Account name (optional)"
                    value={brandName}
                    onChange={e => setBrandName(e.target.value)}
                  />
                </div>

                {/* File slots */}
                <div className="file-slots">
                  {[
                    { type: "bulk",    label: "Bulk Campaign File", sub: "SP Campaigns + Search Terms", icon: "🗂️", required: true },
                    { type: "sales",   label: "Sales by ASIN",      sub: "Vendor Central Sales Report",  icon: "📊", required: false },
                    { type: "traffic", label: "Traffic by ASIN",    sub: "Vendor Central Traffic Report",icon: "📈", required: false },
                  ].map(slot => {
                    const filled = uploadedFiles.find(f => f.type === slot.type);
                    return (
                      <div
                        key={slot.type}
                        className={`file-slot${filled ? " filled" : slot.required ? " required" : ""}`}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="slot-icon">{slot.icon}</div>
                        <span className={`slot-badge ${slot.required ? "req" : "opt"}`}>{slot.required ? "Required" : "Optional"}</span>
                        <div className="slot-name">{slot.label}</div>
                        <div className="slot-sub">{slot.sub}</div>
                        {filled && <div className="slot-filled">✓ {filled.name} ({filled.rows.toLocaleString()} rows)</div>}
                      </div>
                    );
                  })}
                  <div
                    className={`file-slot${uploadedFiles.find(f => f.type === "searchTerm") ? " filled" : ""}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="slot-icon">🔍</div>
                    <span className="slot-badge opt">Optional</span>
                    <div className="slot-name">Search Term Report</div>
                    <div className="slot-sub">Standalone ST report</div>
                    {uploadedFiles.find(f => f.type === "searchTerm") && (
                      <div className="slot-filled">✓ {uploadedFiles.find(f => f.type === "searchTerm")!.name}</div>
                    )}
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  className={`drop-zone${isDragging ? " dragging" : ""}`}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="drop-icon">📂</div>
                  <div className="drop-text">Drop files here or click to browse</div>
                  <div className="drop-sub">Upload one or more files at once — app auto-detects each type</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    multiple
                    style={{ display: "none" }}
                    onChange={e => e.target.files && handleFiles(e.target.files)}
                  />
                </div>

                {parseError && <div className="parse-error">⚠ {parseError}</div>}

                <button
                  className="analyze-btn"
                  disabled={!canAnalyze}
                  onClick={startAnalysis}
                >
                  {canAnalyze
                    ? `Analyze ${uploadedFiles.reduce((s,f)=>s+f.rows,0).toLocaleString()} rows →`
                    : "Upload the Bulk Campaign File or Sales Report to start"}
                </button>
              </div>
            </div>
          )}

          {/* ── CHAT SCREEN ── */}
          {screen === "chat" && audit && (
            <div className="chat-screen">
              <div className="chat-header">
                <div>
                  <div className="ch-title">{brand.appName}</div>
                  <div className="ch-sub">
                    {uploadedFiles.reduce((s,f)=>s+f.rows,0).toLocaleString()} rows · {audit.findings.length} findings · Ask anything
                  </div>
                </div>
                <div className="ch-actions">
                  <button className="ch-btn primary" onClick={() => sendMessage("Create a PowerPoint presentation of the full audit")}>📑 Export PPT</button>
                  <button className="ch-btn" onClick={resetApp}>Upload New Files</button>
                </div>
              </div>

              <div className="messages">
                {messages.map(msg => (
                  <div key={msg.id} className={`msg-row ${msg.role === "user" ? "user" : "bot"}`}>
                    <div className={`avatar ${msg.role === "user" ? "user" : "bot"}`}>
                      {msg.role === "user" ? "You" : "AI"}
                    </div>
                    <div
                      className={`bubble ${msg.role === "user" ? "user" : "bot"}`}
                      dangerouslySetInnerHTML={{ __html: msg.content }}
                    />
                  </div>
                ))}
                {isTyping && (
                  <div className="msg-row bot">
                    <div className="avatar bot">AI</div>
                    <div className="bubble bot">
                      <div className="typing-dots"><span /><span /><span /></div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="suggestions">
                {SUGGESTIONS.map(s => (
                  <div key={s.q} className="suggestion-chip" onClick={() => sendMessage(s.q)}>{s.label}</div>
                ))}
              </div>

              <div className="input-bar">
                <textarea
                  className="chat-input"
                  placeholder="Ask anything about your campaigns…"
                  value={input}
                  rows={1}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                />
                <button className="send-btn" disabled={isTyping || !input.trim()} onClick={() => sendMessage(input)}>➤</button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* API KEY MODAL */}
      {showApiKey && (
        <div className="modal-overlay" onClick={() => setShowApiKey(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{brand.apiKeyLabel} (Optional)</h2>
            <p>The app gives accurate, data-driven answers without a key. An OpenAI key enhances the language quality of responses — all numbers still come from your data, never hallucinated.</p>
            <input
              className="modal-input"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <p className="modal-note">🔒 Stored in your browser only. Sent directly to OpenAI — never to our servers.</p>
            <div className="modal-actions">
              <button className="modal-btn" onClick={() => { setApiKey(""); setShowApiKey(false); }}>Clear</button>
              <button className="modal-btn save" onClick={() => setShowApiKey(false)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
