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

// Pre-aggregated row for per-campaign table
export interface CampaignRow {
  name: string;
  spend: number;
  sales: number;
  acos: number;
  clicks: number;
  impressions: number;
  orders: number;
  ctr: number;
  cvr: number;
}

// Pre-aggregated row for per-keyword table
export interface KeywordRow {
  keyword: string
  matchType: string
  campaignName: string
  adGroupName: string
  spend: number
  sales: number
  acos: number
  clicks: number
  impressions: number
  orders: number
  ctr: number
  cvr: number
}

// Pre-aggregated row for per-ASIN table
export interface AsinRow {
  asin: string;
  title: string;
  brand: string;
  orderedRevenue: number;
  orderedUnits: number;
  pageViews: number;
  returnRate: number;
  revenuePerView: number;
  adSpend: number;
  adSales: number;
  adOrders: number;
  adClicks: number;
  acos: number;
  cvr: number;
  ctr: number;
}

// ── Flexible query result — used by chat engine to render tables + CSV ──
export interface QueryResult {
  title: string;                    // e.g. "Top 10 ASINs by CVR with high returns"
  columns: string[];                // column headers
  rows: (string | number)[][];      // data rows
  csvKeys: string[];                // keys used for CSV export (matches columns)
  nextSteps: string[];              // computed action items
  count: number;                    // total matching rows before limit
}

// ── Run a smart query against the audit data ──
export function runQuery(audit: AuditResult, question: string): QueryResult | null {
  const q = question.toLowerCase();

  const extractN = (text: string, def = 10): number => {
    const m = text.match(/\b(\d+)\b/);
    return m ? Math.min(parseInt(m[1]), 100) : def;
  };

  const fmtR = (n: number) => `$${n.toFixed(2)}`;
  const fmtP = (n: number) => `${(n * 100).toFixed(2)}%`;
  const fmtN = (n: number) => n.toLocaleString();

  // ── ASIN queries ──
  const isAsinQuery = /asin|product|item|sku/i.test(q);
  const isCampQuery = /campaign/i.test(q);

  if (isAsinQuery || (!isCampQuery && /revenue|return|cvr|convers|unit|page.?view|rev.*view/i.test(q))) {
    const limit = extractN(q, 10);
    let rows = [...audit.asinTable];

    // Filters
    if (/high.*return|return.*high|return.*rate.*above|above.*return/i.test(q)) {
      const threshold = q.match(/(\d+)\s*%/) ? parseInt(q.match(/(\d+)\s*%/)![1]) / 100 : 0.1;
      rows = rows.filter(a => a.returnRate >= threshold);
    }
    if (/high.*cvr|cvr.*high|best.*convers|top.*convers/i.test(q)) {
      rows = rows.filter(a => a.cvr > 0.10);
    }
    if (/low.*cvr|cvr.*low|poor.*convers/i.test(q)) {
      rows = rows.filter(a => a.cvr > 0 && a.cvr < 0.05);
    }
    if (/zero.*revenue|no.*revenue|wast/i.test(q)) {
      rows = rows.filter(a => a.orderedRevenue === 0 && a.pageViews > 50);
    }
    if (/high.*acos|acos.*high/i.test(q)) {
      rows = rows.filter(a => a.acos > 0.5 && a.adSpend > 0);
    }
    if (/cash.?cow/i.test(q)) {
      const cows = new Set(audit.asinCohorts.filter(c => c.cohort === "cash_cow").map(c => c.asin));
      rows = rows.filter(a => cows.has(a.asin));
    }
    if (/need.*love|underfund/i.test(q)) {
      const love = new Set(audit.asinCohorts.filter(c => c.cohort === "need_love").map(c => c.asin));
      rows = rows.filter(a => love.has(a.asin));
    }

    // Sort
    if (/return/i.test(q) && /high|most|top/i.test(q)) rows.sort((a,b) => b.returnRate - a.returnRate);
    else if (/cvr|convers/i.test(q) && /high|best|top/i.test(q)) rows.sort((a,b) => b.cvr - a.cvr);
    else if (/cvr|convers/i.test(q) && /low|worst|bottom/i.test(q)) rows.sort((a,b) => a.cvr - b.cvr);
    else if (/revenue/i.test(q)) rows.sort((a,b) => b.orderedRevenue - a.orderedRevenue);
    else if (/spend/i.test(q)) rows.sort((a,b) => b.adSpend - a.adSpend);
    else if (/acos/i.test(q)) rows.sort((a,b) => b.acos - a.acos);
    else if (/page.?view|traffic|impression/i.test(q)) rows.sort((a,b) => b.pageViews - a.pageViews);
    else if (/unit/i.test(q)) rows.sort((a,b) => b.orderedUnits - a.orderedUnits);
    else rows.sort((a,b) => b.orderedRevenue - a.orderedRevenue);

    const total = rows.length;
    const shown = rows.slice(0, limit);
    if (!shown.length) return null;

    // Build next steps
    const nextSteps: string[] = [];
    const highReturn = shown.filter(a => a.returnRate > 0.1);
    const highCvr    = shown.filter(a => a.cvr > 0.15);
    const lowCvr     = shown.filter(a => a.cvr > 0 && a.cvr < 0.05);
    const highAcos   = shown.filter(a => a.acos > 0.5 && a.adSpend > 0);
    const zeroRev    = shown.filter(a => a.orderedRevenue === 0);

    if (highReturn.length) nextSteps.push(`Review listings for ${highReturn.length} high-return ASINs (${highReturn[0].asin}) — check images, descriptions, sizing info`);
    if (highCvr.length)    nextSteps.push(`Scale ad spend on ${highCvr.length} high-CVR ASINs — they convert above 15% and deserve more budget`);
    if (lowCvr.length)     nextSteps.push(`Pause or reduce bids on ${lowCvr.length} low-CVR ASINs — getting clicks but not converting`);
    if (highAcos.length)   nextSteps.push(`Reduce bids by 20-30% on ${highAcos.length} high-ACOS ASINs to improve profitability`);
    if (zeroRev.length)    nextSteps.push(`Stop advertising ${zeroRev.length} zero-revenue ASINs — redirect budget to top performers`);
    if (!nextSteps.length) nextSteps.push(`Monitor these ASINs weekly and adjust bids based on CVR trends`);

    return {
      title: `${shown.length} ASINs${total > limit ? ` (of ${total} matching)` : ""}`,
      columns: ["#", "ASIN", "Product", "Brand", "Revenue", "Units", "Page Views", "CVR", "Return %", "ACOS", "Ad Spend"],
      rows: shown.map((a, i) => [i+1, a.asin, a.title.slice(0,40), a.brand, fmtR(a.orderedRevenue), fmtN(a.orderedUnits), fmtN(a.pageViews), fmtP(a.cvr), fmtP(a.returnRate), fmtP(a.acos), fmtR(a.adSpend)]),
      csvKeys: ["rank", "asin", "product", "brand", "revenue", "units", "pageViews", "cvr", "returnRate", "acos", "adSpend"],
      nextSteps,
      count: total,
    };
  }

  // ── Campaign queries ──
  if (isCampQuery || /spend|acos|ctr|click|impression/i.test(q)) {
    const limit = extractN(q, 10);
    let rows = [...audit.campaignTable];

    // Filters
    if (/zero.*sales|no.*sales|wast/i.test(q))       rows = rows.filter(c => c.sales === 0 && c.spend > 0);
    if (/high.*acos|acos.*high/i.test(q))             rows = rows.filter(c => c.acos > 0.5 && c.sales > 0);
    if (/low.*ctr|ctr.*low/i.test(q))                 rows = rows.filter(c => c.ctr < 0.002 && c.impressions > 500);
    if (/high.*cvr|cvr.*high|best.*convers/i.test(q)) rows = rows.filter(c => c.cvr > 0.10);
    if (/low.*cvr|cvr.*low/i.test(q))                 rows = rows.filter(c => c.cvr > 0 && c.cvr < 0.05);

    // Sort
    if (/top|best|revenue|sales/i.test(q))  rows.sort((a,b) => b.sales - a.sales);
    else if (/spend|cost/i.test(q))         rows.sort((a,b) => b.spend - a.spend);
    else if (/acos/i.test(q))               rows.sort((a,b) => b.acos - a.acos);
    else if (/wast|zero/i.test(q))          rows.sort((a,b) => b.spend - a.spend);
    else if (/ctr/i.test(q))                rows.sort((a,b) => a.ctr - b.ctr);
    else if (/cvr|convers/i.test(q))        rows.sort((a,b) => b.cvr - a.cvr);
    else                                     rows.sort((a,b) => b.spend - a.spend);

    const total = rows.length;
    const shown = rows.slice(0, limit);
    if (!shown.length) return null;

    // Next steps
    const nextSteps: string[] = [];
    const zeroSales = shown.filter(c => c.sales === 0);
    const highAcos  = shown.filter(c => c.acos > 0.5 && c.sales > 0);
    const lowCtr    = shown.filter(c => c.ctr < 0.002);
    const highCvr   = shown.filter(c => c.cvr > 0.15);

    if (zeroSales.length) nextSteps.push(`Pause ${zeroSales.length} zero-sales campaigns — total waste: $${zeroSales.reduce((s,c)=>s+c.spend,0).toFixed(0)}`);
    if (highAcos.length)  nextSteps.push(`Reduce bids 20-30% in ${highAcos.length} high-ACOS campaigns to improve profitability`);
    if (lowCtr.length)    nextSteps.push(`Review ad copy and targeting in ${lowCtr.length} low-CTR campaigns`);
    if (highCvr.length)   nextSteps.push(`Scale budget on ${highCvr.length} high-CVR campaigns — strong converters deserve more spend`);
    if (!nextSteps.length) nextSteps.push(`Monitor performance weekly — review bids if ACOS drifts above target`);

    return {
      title: `${shown.length} campaigns${total > limit ? ` (of ${total} matching)` : ""}`,
      columns: ["#", "Campaign", "Spend", "Sales", "ACOS", "Orders", "Clicks", "CTR", "CVR"],
      rows: shown.map((c, i) => [i+1, c.name.slice(0,45), fmtR(c.spend), fmtR(c.sales), fmtP(c.acos), fmtN(c.orders), fmtN(c.clicks), fmtP(c.ctr), fmtP(c.cvr)]),
      csvKeys: ["rank", "campaign", "spend", "sales", "acos", "orders", "clicks", "ctr", "cvr"],
      nextSteps,
      count: total,
    };
  }

  return null;
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
  // Pre-aggregated tables for tabular chat responses
  campaignTable: CampaignRow[];
  asinTable: AsinRow[];
  keywordTable: KeywordRow[];
  periodLabel: string;          // e.g. "Period A" or "Last 30 days"
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

// ── User-configurable targets (with auto-detected defaults) ──
export interface AuditTargets {
  acosTarget: number;       // e.g. 0.30 = 30%
  ctrBenchmark: number;     // e.g. 0.002 = 0.2%
  cvrBenchmark: number;     // e.g. 0.05 = 5%
  noSalesMinSpend: number;  // e.g. 30 = $30
}

export const DEFAULT_TARGETS: AuditTargets = {
  acosTarget: 0.30,
  ctrBenchmark: 0.002,
  cvrBenchmark: 0.05,
  noSalesMinSpend: 30,
};

// ── Safe number coercion ──
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/[$,]/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Percentage coercion — handles both "7.32%" (→0.0732) and "0.0732" (→0.0732) ──
function pct(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).trim();
  // If it ends with % sign, strip it and divide by 100
  if (s.endsWith("%")) {
    const n = parseFloat(s.replace(/[%,$]/g, "").trim());
    return isNaN(n) ? 0 : n / 100;
  }
  // If already a decimal (e.g. 0.0732 from some exports)
  const n = parseFloat(s.replace(/[$,]/g, "").trim());
  if (isNaN(n)) return 0;
  // Amazon bulk files sometimes store ACOS as decimal (0.40 = 40%)
  // and sometimes as whole number (40 = 40%) — heuristic: if > 1, divide by 100
  return n > 1 ? n / 100 : n;
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
    const acos   = pct(col(kw, "ACOS"));
    const cvr    = pct(col(kw, "Conversion Rate"));
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
    const acos   = pct(col(c, "ACOS"));
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

  // ── Build per-campaign table (aggregate keyword rows by campaign name) ──
  const campAgg: Record<string, CampaignRow> = {};
  for (const row of campaign) {
    const name = str(col(row, "Campaign Name", "_ResolvedCampaignName")) || "Unknown";
    if (!campAgg[name]) campAgg[name] = { name, spend: 0, sales: 0, acos: 0, clicks: 0, impressions: 0, orders: 0, ctr: 0, cvr: 0 };
    campAgg[name].spend       += num(col(row, "Spend"));
    campAgg[name].sales       += num(col(row, "Sales"));
    campAgg[name].clicks      += num(col(row, "Clicks"));
    campAgg[name].impressions += num(col(row, "Impressions"));
    campAgg[name].orders      += num(col(row, "Orders"));
  }
  const campaignTable: CampaignRow[] = Object.values(campAgg).map(c => ({
    ...c,
    acos: c.sales > 0 ? c.spend / c.sales : 0,
    ctr:  c.impressions > 0 ? c.clicks / c.impressions : 0,
    cvr:  c.clicks > 0 ? c.orders / c.clicks : 0,
  })).sort((a, b) => b.spend - a.spend);

  // ── Build per-ASIN table ──
  const asinAgg: Record<string, AsinRow> = {};
  for (const row of sales) {
    const asin = str(col(row, "ASIN"));
    if (!asin || asin === "ASIN") continue;
    if (!asinAgg[asin]) asinAgg[asin] = {
      asin,
      title: str(col(row, "Product Title")),
      brand: str(col(row, "Brand")),
      orderedRevenue: 0, orderedUnits: 0, pageViews: 0, returnRate: 0, revenuePerView: 0,
      adSpend: 0, adSales: 0, adOrders: 0, adClicks: 0, acos: 0, cvr: 0, ctr: 0,
    };
    asinAgg[asin].orderedRevenue += num(col(row, "Ordered Revenue"));
    asinAgg[asin].orderedUnits  += num(col(row, "Ordered Units"));
    const returns = num(col(row, "Customer Returns"));
    asinAgg[asin].returnRate = asinAgg[asin].orderedUnits > 0 ? returns / asinAgg[asin].orderedUnits : 0;
  }
  for (const row of traffic) {
    const asin = str(col(row, "ASIN"));
    if (asinAgg[asin]) asinAgg[asin].pageViews += num(col(row, "Featured Offer Page Views"));
  }
  // ── Cross-reference campaign data into ASIN rows ──
  // Aggregate ad metrics (spend, sales, orders, clicks) by ASIN from campaign rows
  const asinAdAgg: Record<string, { spend: number; sales: number; orders: number; clicks: number; impressions: number }> = {};
  for (const row of campaign) {
    const asin = str(col(row, "ASIN", "Advertised ASIN"));
    if (!asin || asin.length < 10) continue;
    if (!asinAdAgg[asin]) asinAdAgg[asin] = { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
    asinAdAgg[asin].spend       += num(col(row, "Spend"));
    asinAdAgg[asin].sales       += num(col(row, "Sales"));
    asinAdAgg[asin].orders      += num(col(row, "Orders"));
    asinAdAgg[asin].clicks      += num(col(row, "Clicks"));
    asinAdAgg[asin].impressions += num(col(row, "Impressions"));
  }

  const asinTable: AsinRow[] = Object.values(asinAgg).map(a => {
    const ad = asinAdAgg[a.asin] ?? { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 };
    return {
      ...a,
      revenuePerView: a.pageViews > 0 ? a.orderedRevenue / a.pageViews : 0,
      adSpend:  ad.spend,
      adSales:  ad.sales,
      adOrders: ad.orders,
      adClicks: ad.clicks,
      acos: ad.sales > 0 ? ad.spend / ad.sales : 0,
      cvr:  ad.clicks > 0 ? ad.orders / ad.clicks : 0,
      ctr:  ad.impressions > 0 ? ad.clicks / ad.impressions : 0,
    };
  }).sort((a, b) => b.orderedRevenue - a.orderedRevenue);

  // ── Build per-keyword table ──
  const keywordTable: KeywordRow[] = kwRows.map(row => {
    const impr   = num(col(row, "Impressions"));
    const clicks = num(col(row, "Clicks"));
    const orders = num(col(row, "Orders"));
    const spend  = num(col(row, "Spend"));
    const sales  = num(col(row, "Sales"));
    return {
      keyword:      str(col(row, "Keyword Text")),
      matchType:    str(col(row, "Match Type")),
      campaignName: str(col(row, "_ResolvedCampaignName", "Campaign Name (Informational only)", "Campaign Name")),
      adGroupName:  str(col(row, "Ad Group Name (Informational only)", "Ad Group Name")),
      spend,
      sales,
      acos:  sales  > 0 ? spend  / sales  : 0,
      clicks,
      impressions: impr,
      orders,
      ctr:  impr   > 0 ? clicks / impr   : 0,
      cvr:  clicks > 0 ? orders / clicks : 0,
    };
  }).sort((a, b) => b.spend - a.spend);

  // ── Assemble result ──
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
    campaignTable,
    asinTable,
    keywordTable,
    periodLabel: "Current Period",
  };
}
