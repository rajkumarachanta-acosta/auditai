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
  // VBA-fidelity fields, matching mod_FindingsStore's clsFinding model
  module?: "Keyword Audit" | "Search Term Audit" | "Budget Audit" | "Benchmark Audit" | "Growth Opportunity";
  confidence?: "High" | "Medium" | "Low" | "N/A";
  scoringExempt?: boolean; // itemized child finding — excluded from the Recommendation ranking
  impactType?: "Waste" | "Opportunity";
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
  state: string       // "enabled" | "paused" | "archived"
  spend: number
  sales: number
  acos: number
  clicks: number
  impressions: number
  orders: number
  ctr: number
  cvr: number
}

// Pre-aggregated row for per-search-term table
export interface SearchTermRow {
  searchTerm: string
  matchedKeyword: string
  matchType: string
  campaignName: string
  adGroupName: string
  spend: number
  sales: number
  acos: number
  clicks: number
  orders: number
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
  // Per-category health scores (0-100), matching mod_Scoring exactly: each category
  // blends 70% spend efficiency + 30% structural quality, then the account Health Score
  // is a weighted average (Keyword 40% / Search Term 30% / Budget 30%) across whichever
  // categories have data.
  keywordScore: number;
  searchTermScore: number;
  budgetScore: number;
  growthOpportunity: number;    // $ conservative incremental upside (mod_GrowthOpportunity)
  topActions: Finding[];        // ranked action list (mod_Recommendation)
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
  searchTermTable: SearchTermRow[];
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
// Matches mod_ASINAudit exactly: Cash Cow is a revenue-Pareto cutoff evaluated FIRST
// (an ASIN inside the top-80%-of-cumulative-revenue band is always Cash Cow regardless
// of CVR); Need More Love / Reduce-Pause require an actual traffic match (CVR computed,
// not the -1 "no match" sentinel); the residual "Monitor" bucket is intentionally not
// surfaced anywhere in the source tool's reporting, so it's simply excluded here too.
function runAsinAudit(
  sales: Record<string, unknown>[],
  traffic: Record<string, unknown>[]
): AsinCohort[] {
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
  const paretoCutoff = totalRev * 0.8;

  // Account benchmarks: avgCVR/avgPV computed only over ASINs with revenue>0 AND a traffic match.
  let sumUnitsMatched = 0, sumPVMatched = 0, matchCount = 0;
  for (const asin of allAsins) {
    const item = salesMap[asin];
    const pv = trafficMap[asin];
    if (item.rev > 0 && pv !== undefined) {
      sumUnitsMatched += item.units;
      sumPVMatched += pv;
      matchCount++;
    }
  }
  const avgCVR = sumPVMatched > 0 ? sumUnitsMatched / sumPVMatched : 0;
  const avgPV = matchCount > 0 ? sumPVMatched / matchCount : 0;

  const sorted = allAsins
    .map(asin => ({ asin, ...salesMap[asin], pageViews: trafficMap[asin] }))
    .sort((a, b) => b.rev - a.rev);

  const cohorts: AsinCohort[] = [];
  let cumulative = 0;

  for (const item of sorted) {
    cumulative += item.rev;
    const hasTrafficMatch = item.pageViews !== undefined;
    const pageViews = item.pageViews ?? 0;
    const cvr = hasTrafficMatch && pageViews > 0 ? item.units / pageViews : hasTrafficMatch ? 0 : -1; // -1 = no traffic match
    const revenuePerView = pageViews > 0 ? item.rev / pageViews : 0;
    const returnRate = item.units > 0 ? Math.min(item.returns / item.units, 1) : 0;

    let cohort: AsinCohort["cohort"] | "monitor";
    if (cumulative <= paretoCutoff) {
      cohort = "cash_cow";
    } else if (cvr >= 0 && cvr > avgCVR && pageViews < avgPV) {
      cohort = "need_love";
    } else if (cvr >= 0 && cvr < avgCVR * 0.5) {
      cohort = "reduce_pause";
    } else {
      cohort = "monitor"; // matches VBA: computed but never surfaced in reporting
    }
    if (cohort === "monitor") continue;

    cohorts.push({
      asin: item.asin,
      title: item.title ?? "",
      brand: item.brand ?? "",
      cohort,
      orderedRevenue: item.rev,
      orderedUnits: item.units,
      pageViews,
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
        category: "waste", module: "Keyword Audit",
        title: `Zero-sales keyword: "${kwText}"`,
        detail: `Campaign: ${camp || "Unknown"} · Spend: $${spend.toFixed(0)} · $0 sales`,
        impact: spend,
        severity: spend > 200 ? "critical" : "high",
        confidence: "N/A", scoringExempt: true, impactType: "Waste",
        action: `Pause "${kwText}" — spending $${spend.toFixed(0)} with zero return`,
      });
    }

    if (sales > 0 && acos > HIGH_ACOS) {
      highAcosCount++;
      highAcosSpend += spend;
      findings.push({
        id: `kw-acos-${kwText}`,
        category: "waste", module: "Keyword Audit",
        title: `High ACOS: "${kwText}" at ${(acos * 100).toFixed(0)}%`,
        detail: `Campaign: ${camp || "Unknown"} · ACOS ${(acos * 100).toFixed(0)}% vs ${(HIGH_ACOS * 100).toFixed(0)}% target`,
        impact: Math.max(0, spend - sales * HIGH_ACOS),
        severity: acos > 0.8 ? "critical" : "high",
        confidence: "N/A", scoringExempt: true, impactType: "Waste",
        action: `Reduce bid by ${Math.min(70, Math.round((1 - HIGH_ACOS / acos) * 100))}% on "${kwText}"`,
      });
    }

    if (impr >= MIN_IMPR_CTR) {
      const ctr = clicks / impr;
      if (ctr < LOW_CTR) {
        lowCtrCount++;
        findings.push({
          id: `kw-ctr-${kwText}`,
          category: "structure", module: "Keyword Audit",
          title: `Low CTR: "${kwText}" at ${(ctr * 100).toFixed(2)}%`,
          detail: `${impr.toFixed(0)} impressions · CTR ${(ctr * 100).toFixed(2)}% vs ${(LOW_CTR * 100).toFixed(2)}% benchmark`,
          impact: 0,
          severity: "medium",
          confidence: "N/A", scoringExempt: true, impactType: "Waste",
          action: `Review ad relevance for "${kwText}" or pause to stop wasting impressions`,
        });
      }
    }

    if (clicks >= MIN_CLICKS_CVR && cvr > 0 && cvr < LOW_CVR) {
      lowCvrCount++;
      findings.push({
        id: `kw-cvr-${kwText}`,
        category: "structure", module: "Keyword Audit",
        title: `Low CVR: "${kwText}" at ${(cvr * 100).toFixed(1)}%`,
        detail: `${clicks.toFixed(0)} clicks · CVR ${(cvr * 100).toFixed(1)}% vs ${(LOW_CVR * 100).toFixed(0)}% threshold`,
        impact: 0,
        severity: "medium",
        confidence: "N/A", scoringExempt: true, impactType: "Waste",
        action: `Review listing relevance for "${kwText}" — getting clicks but not converting`,
      });
    }
  }

  // Summary findings — one roll-up per pattern, non-scoringExempt so they drive the
  // Recommendation ranking and Executive Summary critical-issue count.
  if (noSalesCount > 0) {
    findings.push({
      id: "kw-summary-nosales", category: "waste", module: "Keyword Audit",
      title: `High-spend / zero-sales keywords: ${noSalesCount} keywords spent $${noSalesSpend.toFixed(0)} with zero sales — budget burning with no return.`,
      detail: `Budget burning with no return across ${noSalesCount} keywords. Full list in Detailed Findings.`,
      impact: noSalesSpend, severity: "critical", confidence: "High", impactType: "Waste",
      action: "Pause or sharply reduce bids on the itemized keywords. Full list in Detailed_Findings.",
    });
  }
  if (highAcosCount > 0) {
    findings.push({
      id: "kw-summary-highacos", category: "waste", module: "Keyword Audit",
      title: `High-ACOS keywords: ${highAcosCount} keywords spending $${highAcosSpend.toFixed(0)} above the ${(HIGH_ACOS * 100).toFixed(0)}% ACOS threshold.`,
      detail: `Overspending relative to sales return across ${highAcosCount} keywords.`,
      impact: highAcosSpend, severity: "high", confidence: "High", impactType: "Waste",
      action: `Systematically reduce bids on ${highAcosCount} high-ACOS keywords`,
    });
  }
  if (lowCtrCount > 0) {
    findings.push({
      id: "kw-summary-lowctr", category: "structure", module: "Keyword Audit",
      title: `Low-CTR keywords: ${lowCtrCount} keywords with sufficient impressions are getting below-threshold click rates — possible relevance issues.`,
      detail: `${lowCtrCount} keywords below the CTR benchmark.`,
      impact: 0, severity: "medium", confidence: "Medium", impactType: "Waste",
      action: "Review ad copy and listing relevance, or pause to stop wasting impressions.",
    });
  }
  if (lowCvrCount > 0) {
    findings.push({
      id: "kw-summary-lowcvr", category: "structure", module: "Keyword Audit",
      title: `Low-conversion keywords: ${lowCvrCount} keywords with sufficient clicks are converting below the ${(LOW_CVR * 100).toFixed(0)}% threshold.`,
      detail: `${lowCvrCount} keywords below the CVR threshold.`,
      impact: 0, severity: "medium", confidence: "Medium", impactType: "Waste",
      action: "Review listing/landing page relevance for these keywords, or reduce bid.",
    });
  }

  return findings;
}

// ── Budget Audit (Bulk file: Entity = "Campaign") ──
// Matches mod_BudgetAudit: per-campaign overspending/wasted-spend/budget-increase-candidate
// findings, plus one account-wide spend-concentration finding. Unlike Keyword/SearchTerm
// Audit, none of these are scoringExempt in the source — each counts directly.
const BUDGET_OVERSPEND_ACOS = 0.5;             // Budget_OverspendingACOS_Threshold
const BUDGET_WASTE_MIN_SPEND = 1;              // Budget_WastedSpend_MinSpend
const BUDGET_INCREASE_AVG_DAILY_PCT = 0.9;     // Budget_IncreaseCandidate_AvgDailyPct
const BUDGET_INCREASE_EFFICIENT_ACOS = 0.3;    // Budget_IncreaseCandidate_EfficientACOS
const BUDGET_CONCENTRATION_TOP_N = 5;          // Budget_ConcentrationTopN
const BUDGET_CONCENTRATION_THRESHOLD_PCT = 0.4; // Budget_ConcentrationThresholdPct
const REPORTING_PERIOD_DAYS = 30;              // ReportingPeriodDays

function runCampaignAudit(campaign: Record<string, unknown>[]): Finding[] {
  const findings: Finding[] = [];
  const campaigns = campaign.filter(r => str(col(r, "Entity")) === "Campaign");
  if (!campaigns.length) return findings;

  let totalSpend = 0;
  const spendByCamp: Record<string, number> = {};
  const nameByKey: Record<string, string> = {};

  for (const c of campaigns) {
    const spend  = num(col(c, "Spend"));
    const sales  = num(col(c, "Sales"));
    const acos   = pct(col(c, "ACOS"));
    const budget = num(col(c, "Daily Budget"));
    const state  = str(col(c, "State")).toLowerCase() || "enabled";
    const name   = str(col(c, "_ResolvedCampaignName", "Campaign Name (Informational only)", "Campaign Name")) || "Unknown Campaign";
    const key    = name.toLowerCase();
    if (spend <= 0) continue; // matches VBA row-inclusion rule (spend<=0 skipped)

    totalSpend += spend;
    spendByCamp[key] = (spendByCamp[key] ?? 0) + spend;
    nameByKey[key]   = name;
    const stateTag = state !== "enabled" ? ` [${state}]` : "";

    if (sales > 0 && acos > BUDGET_OVERSPEND_ACOS) {
      findings.push({
        id: `camp-acos-${key}`, category: "waste", module: "Budget Audit",
        title: `Overspending campaign: "${name}" (ACOS ${(acos * 100).toFixed(0)}% vs ${(BUDGET_OVERSPEND_ACOS * 100).toFixed(0)}% threshold, $${spend.toFixed(0)} spend)${stateTag}`,
        detail: `ACOS ${(acos * 100).toFixed(0)}% vs ${(BUDGET_OVERSPEND_ACOS * 100).toFixed(0)}% threshold · Spend $${spend.toFixed(0)} · Sales $${sales.toFixed(0)}`,
        impact: spend, severity: "critical", confidence: "N/A",
        action: state === "enabled"
          ? "Reduce bids or pause underperforming keywords/targets within this campaign to bring ACOS back in line."
          : `Already ${state} — confirm intentional; spend still counts toward this period's results.`,
      });
    }

    if (spend > BUDGET_WASTE_MIN_SPEND && sales === 0) {
      findings.push({
        id: `camp-waste-${key}`, category: "waste", module: "Budget Audit",
        title: `Wasted campaign spend: "${name}" ($${spend.toFixed(0)} spend, $0 sales)${stateTag}`,
        detail: `Spend: $${spend.toFixed(0)} in reporting period · Zero attributed sales`,
        impact: spend, severity: "critical", confidence: "N/A",
        action: state === "enabled"
          ? "Investigate immediately — this campaign is spending with zero return."
          : `Already ${state} — confirm intentional; spend still counts toward this period's waste.`,
      });
    }

    if (budget > 0 && sales > 0 && acos > 0 && acos <= BUDGET_INCREASE_EFFICIENT_ACOS && state === "enabled") {
      const avgDailySpend = spend / REPORTING_PERIOD_DAYS;
      const avgDailyPct = avgDailySpend / budget;
      if (avgDailyPct >= BUDGET_INCREASE_AVG_DAILY_PCT) {
        findings.push({
          id: `camp-increase-${key}`, category: "opportunity", module: "Budget Audit",
          title: `Budget increase candidate: "${name}" is efficient (ACOS ${(acos * 100).toFixed(0)}%) and averaging ${(avgDailyPct * 100).toFixed(0)}% of its daily budget over the period`,
          detail: `ACOS ${(acos * 100).toFixed(0)}% · Averaging ${(avgDailyPct * 100).toFixed(0)}% of $${budget.toFixed(0)}/day budget`,
          impact: spend, severity: "medium", confidence: "Medium", impactType: "Opportunity",
          action: "Consider testing a higher daily budget — this campaign performs efficiently and is consistently using most of its allocated budget. Directional signal, not a confirmed cap (requires daily pacing data to confirm).",
        });
      }
    }
  }

  // Spend concentration risk (account-wide, top N campaigns by spend)
  const sorted = Object.entries(spendByCamp).sort((a, b) => b[1] - a[1]);
  if (totalSpend > 0) {
    const topN = sorted.slice(0, Math.min(BUDGET_CONCENTRATION_TOP_N, sorted.length));
    const topNSpend = topN.reduce((s, [, v]) => s + v, 0);
    const topNPct = topNSpend / totalSpend;
    if (topNPct >= BUDGET_CONCENTRATION_THRESHOLD_PCT) {
      findings.push({
        id: "camp-concentration", category: "structure", module: "Budget Audit",
        title: `Spend concentration risk: top ${topN.length} campaigns account for ${(topNPct * 100).toFixed(0)}% of total account spend ($${topNSpend.toFixed(0)} of $${totalSpend.toFixed(0)})`,
        detail: topN.map(([k]) => nameByKey[k]).join(", "),
        impact: topNSpend, severity: "medium", confidence: "High",
        action: "Account performance is heavily dependent on a small number of campaigns. Review diversification and contingency if any of these underperform.",
      });
    }
  }

  return findings;
}

// ── Search Term Audit (Bulk file: SP Search Term Report sheet) ──
// Matches mod_SearchTermAudit: 6 patterns (waste split into negated-elsewhere vs never-negated,
// underfunded high-CVR converters, converting terms never added as any keyword, exact-match
// expansion, high-CTR-zero-conversion), cross-referenced against _RAW_Campaign for existing
// keywords/negatives, plus one severity-tiered summary finding per pattern.
const ST_NEG_MIN_SPEND = 5;            // SearchTerm_NegativeKW_MinSpend
const ST_EXPANSION_MIN_ORDERS = 10;    // SearchTerm_Expansion_MinOrders
const ST_EXPANSION_MIN_CVR = 0.25;     // SearchTerm_Expansion_MinCVR
const ST_UNDERFUNDED_CVR_MULT = 2;     // SearchTerm_Underfunded_CVRMultiplier
const ST_UNDERFUNDED_MIN_CLICKS = 5;   // SearchTerm_Underfunded_MinClicks
const ST_UNDERFUNDED_MAX_CLICKS = 15;  // SearchTerm_Underfunded_MaxClicks
const ST_NEVER_ADDED_MIN_ORDERS = 3;   // SearchTerm_NeverAdded_MinOrders
const ST_HIGH_CTR_MULT = 2;            // SearchTerm_HighCTRNoConv_CTRMultiplier
const ST_HIGH_CTR_MIN_CLICKS = 15;     // SearchTerm_HighCTRNoConv_MinClicks
const ST_WASTE_CRITICAL_DOLLAR = 500;
const ST_WASTE_HIGH_DOLLAR = 100;
const ST_NEVERADDED_CRITICAL_DOLLAR = 50000;
const ST_NEVERADDED_HIGH_DOLLAR = 10000;

function tierSeverityByDollar(amount: number, critical: number, high: number): Finding["severity"] {
  if (amount >= critical) return "critical";
  if (amount >= high) return "high";
  return "medium";
}

function runSearchTermAudit(searchTerm: Record<string, unknown>[], campaign: Record<string, unknown>[]): Finding[] {
  const findings: Finding[] = [];
  if (!searchTerm.length) return findings;

  // Cross-reference sets from _RAW_Campaign
  const existingKeywords = new Set<string>();
  const existingNegatives = new Set<string>();
  for (const row of campaign) {
    const entity = str(col(row, "Entity"));
    const kw = str(col(row, "Keyword Text")).toLowerCase().trim();
    if (!kw) continue;
    if (entity === "Keyword") existingKeywords.add(kw);
    else if (entity === "Negative Keyword" || entity === "Campaign Negative Keyword") existingNegatives.add(kw);
  }
  // exactSet is built from the Search Term Report's OWN Match Type column, not _RAW_Campaign
  const exactSet = new Set<string>();
  for (const row of searchTerm) {
    const mt = str(col(row, "Match Type")).toLowerCase();
    if (mt === "exact") exactSet.add(str(col(row, "Customer Search Term", "Search Term", "Query")).toLowerCase().trim());
  }

  // Account baselines — volume-weighted, over ALL rows (not just findings-eligible ones)
  let sumClicksAll = 0, sumOrdersAll = 0, sumImprAll = 0;
  for (const row of searchTerm) {
    sumClicksAll += num(col(row, "Clicks"));
    sumOrdersAll += num(col(row, "Orders", "Attributed Conversions 14d"));
    sumImprAll += num(col(row, "Impressions"));
  }
  const accountAvgCVR = sumClicksAll > 0 ? sumOrdersAll / sumClicksAll : 0;
  const accountAvgCTR = sumImprAll > 0 ? sumClicksAll / sumImprAll : 0;

  let totalWasteSpend = 0, totalWasteCount = 0, itemizedNegCount = 0, neverNegatedCount = 0, negScopeGapCount = 0;
  let underfundedSalesTotal = 0, neverAddedSalesTotal = 0, exactExpansionSalesTotal = 0;
  let underfundedCount = 0, neverAddedCount = 0, exactExpansionCount = 0, highCTRCount = 0;

  for (const row of searchTerm) {
    const term = str(col(row, "Customer Search Term", "Search Term", "Query"));
    if (!term || term === "Customer Search Term") continue;
    const termLower = term.toLowerCase().trim();
    const spend = num(col(row, "Spend"));
    const sales = num(col(row, "Sales", "Attributed Sales 14d"));
    const clicks = num(col(row, "Clicks"));
    const impr = num(col(row, "Impressions"));
    const orders = num(col(row, "Orders", "Attributed Conversions 14d"));
    const cvr = clicks > 0 ? orders / clicks : 0;
    const ctr = impr > 0 ? clicks / impr : 0;

    // (a) Wasted spend, split by negative status
    if (spend > 0 && orders === 0 && sales === 0) {
      totalWasteSpend += spend;
      totalWasteCount++;
      if (spend > ST_NEG_MIN_SPEND) {
        itemizedNegCount++;
        const isNegatedElsewhere = existingNegatives.has(termLower);
        if (isNegatedElsewhere) {
          negScopeGapCount++;
          findings.push({
            id: `st-negscope-${termLower.slice(0, 40)}`, category: "waste", module: "Search Term Audit",
            title: `Negative scope gap: "${term}" is already negated elsewhere in the account but still spending here ($${spend.toFixed(0)}, 0 orders)`,
            detail: `$${spend.toFixed(0)} spend · 0 orders · already negated in another campaign/ad group`,
            impact: spend, severity: "critical", confidence: "High", scoringExempt: true, impactType: "Waste",
            action: "This term was already identified as bad and negated in another campaign/ad group — copy that negative here too.",
          });
        } else {
          neverNegatedCount++;
          findings.push({
            id: `st-waste-${termLower.slice(0, 40)}`, category: "waste", module: "Search Term Audit",
            title: `Wasted spend — add as negative: "${term}" ($${spend.toFixed(0)} spend, 0 orders, 0 sales, ${clicks.toFixed(0)} clicks)`,
            detail: `$${spend.toFixed(0)} spend · 0 orders · 0 sales · ${clicks.toFixed(0)} clicks`,
            impact: spend, severity: "critical", confidence: "High", scoringExempt: true, impactType: "Waste",
            action: `Add "${term}" as a negative keyword to stop wasted spend.`,
          });
        }
      }
    }

    // (b) Underfunded high-CVR converters
    if (orders > 0 && clicks >= ST_UNDERFUNDED_MIN_CLICKS && clicks <= ST_UNDERFUNDED_MAX_CLICKS && accountAvgCVR > 0 && cvr > accountAvgCVR * ST_UNDERFUNDED_CVR_MULT) {
      underfundedSalesTotal += sales;
      underfundedCount++;
      findings.push({
        id: `st-underfunded-${termLower.slice(0, 40)}`, category: "opportunity", module: "Search Term Audit",
        title: `Underfunded high-converting term: "${term}" (CVR ${(cvr * 100).toFixed(1)}% vs account avg ${(accountAvgCVR * 100).toFixed(1)}%, only ${clicks.toFixed(0)} clicks)`,
        detail: `CVR ${(cvr * 100).toFixed(1)}% vs account avg ${(accountAvgCVR * 100).toFixed(1)}% · ${clicks.toFixed(0)} clicks`,
        impact: sales, severity: "medium", confidence: "N/A", scoringExempt: true, impactType: "Opportunity",
        action: `Increase bid/budget on "${term}" — converting well on very little traffic.`,
      });
    }

    // (c) Converting term never added as ANY keyword
    if (orders >= ST_NEVER_ADDED_MIN_ORDERS && !existingKeywords.has(termLower)) {
      neverAddedSalesTotal += sales;
      neverAddedCount++;
      findings.push({
        id: `st-neveradded-${termLower.slice(0, 40)}`, category: "opportunity", module: "Search Term Audit",
        title: `Converting term never added as a keyword: "${term}" (${orders.toFixed(0)} orders, $${sales.toFixed(0)} sales, currently only reachable via Auto/Broad/Phrase overflow)`,
        detail: `${orders.toFixed(0)} orders · $${sales.toFixed(0)} sales · not targeted directly`,
        impact: sales, severity: "high", confidence: "N/A", scoringExempt: true, impactType: "Opportunity",
        action: `Add "${term}" as a dedicated keyword (start with exact match).`,
      });
    }

    // (d) Exact-match expansion opportunity — independent of keyword-text existence, gated
    // only by whether THIS search term itself was already targeted by an exact-match keyword.
    if (orders >= ST_EXPANSION_MIN_ORDERS && cvr >= ST_EXPANSION_MIN_CVR && !exactSet.has(termLower)) {
      exactExpansionSalesTotal += sales;
      exactExpansionCount++;
      findings.push({
        id: `st-exactexp-${termLower.slice(0, 40)}`, category: "opportunity", module: "Search Term Audit",
        title: `Exact-match expansion opportunity: "${term}" (${orders.toFixed(0)} orders, CVR ${(cvr * 100).toFixed(1)}%, $${sales.toFixed(0)} sales)`,
        detail: `${orders.toFixed(0)} orders · CVR ${(cvr * 100).toFixed(1)}% · $${sales.toFixed(0)} sales`,
        impact: sales, severity: "medium", confidence: "N/A", scoringExempt: true, impactType: "Opportunity",
        action: `Promote "${term}" to a dedicated Exact-match keyword to protect and scale this converter.`,
      });
    }

    // (e) High CTR, zero conversions
    if (orders === 0 && clicks >= ST_HIGH_CTR_MIN_CLICKS && accountAvgCTR > 0 && ctr > accountAvgCTR * ST_HIGH_CTR_MULT) {
      highCTRCount++;
      findings.push({
        id: `st-highctr-${termLower.slice(0, 40)}`, category: "structure", module: "Search Term Audit",
        title: `High engagement, no conversion: "${term}" (CTR ${(ctr * 100).toFixed(2)}% vs account avg ${(accountAvgCTR * 100).toFixed(2)}%, ${clicks.toFixed(0)} clicks, 0 orders)`,
        detail: `CTR ${(ctr * 100).toFixed(2)}% vs account avg ${(accountAvgCTR * 100).toFixed(2)}% · ${clicks.toFixed(0)} clicks · 0 orders`,
        impact: spend, severity: "medium", confidence: "N/A", scoringExempt: true, impactType: "Waste",
        action: "Strong click appeal but no sales — likely a listing/price/relevance mismatch rather than a targeting problem. Review product page for this search intent.",
      });
    }
  }

  if (totalWasteCount > 0) {
    findings.push({
      id: "st-summary-waste", category: "waste", module: "Search Term Audit",
      title: `Search term waste summary: ${totalWasteCount} search terms spent $${totalWasteSpend.toFixed(0)} total with zero orders/sales (any amount). Of these, ${itemizedNegCount} spent over the itemization floor and are listed individually below: ${neverNegatedCount} never negated, ${negScopeGapCount} negated elsewhere but still bleeding.`,
      detail: `${totalWasteCount} terms · $${totalWasteSpend.toFixed(0)} total waste`,
      impact: totalWasteSpend, severity: tierSeverityByDollar(totalWasteSpend, ST_WASTE_CRITICAL_DOLLAR, ST_WASTE_HIGH_DOLLAR),
      confidence: "High", impactType: "Waste",
      action: `Add negatives for all ${neverNegatedCount} never-negated wasted terms; fix scope for the ${negScopeGapCount} negated-elsewhere terms.`,
    });
  }
  if (neverAddedCount > 0) {
    findings.push({
      id: "st-summary-neveradded", category: "opportunity", module: "Search Term Audit",
      title: `Never-added-as-keyword summary: ${neverAddedCount} converting search terms have no dedicated keyword ($${neverAddedSalesTotal.toFixed(0)} sales at stake)`,
      detail: `${neverAddedCount} terms · $${neverAddedSalesTotal.toFixed(0)} sales`,
      impact: neverAddedSalesTotal, severity: tierSeverityByDollar(neverAddedSalesTotal, ST_NEVERADDED_CRITICAL_DOLLAR, ST_NEVERADDED_HIGH_DOLLAR),
      confidence: "High", impactType: "Opportunity",
      action: "Add dedicated keywords for these proven converters. Full list in Detailed Findings.",
    });
  }
  if (underfundedCount > 0) {
    findings.push({
      id: "st-summary-underfunded", category: "opportunity", module: "Search Term Audit",
      title: `Underfunded converters summary: ${underfundedCount} high-CVR search terms are getting very little traffic ($${underfundedSalesTotal.toFixed(0)} sales at stake)`,
      detail: `${underfundedCount} terms · $${underfundedSalesTotal.toFixed(0)} sales`,
      impact: underfundedSalesTotal, severity: "medium", confidence: "Medium", impactType: "Opportunity",
      action: "Raise bids/budget on these underfunded high-CVR terms.",
    });
  }
  if (exactExpansionCount > 0) {
    findings.push({
      id: "st-summary-exactexpansion", category: "opportunity", module: "Search Term Audit",
      title: `Exact-match expansion summary: ${exactExpansionCount} strong-converting search terms aren't Exact-match keywords yet ($${exactExpansionSalesTotal.toFixed(0)} sales at stake)`,
      detail: `${exactExpansionCount} terms · $${exactExpansionSalesTotal.toFixed(0)} sales`,
      impact: exactExpansionSalesTotal, severity: "medium", confidence: "Medium", impactType: "Opportunity",
      action: "Promote these to dedicated Exact-match keywords.",
    });
  }
  if (highCTRCount > 0) {
    findings.push({
      id: "st-summary-highctr", category: "structure", module: "Search Term Audit",
      title: `High-CTR-no-conversion summary: ${highCTRCount} search terms get above-average clicks but never convert`,
      detail: `${highCTRCount} terms`,
      impact: 0, severity: "medium", confidence: "Medium", impactType: "Waste",
      action: "Review listing/pricing relevance for these search intents.",
    });
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

// ── Scoring (mod_Scoring) ──
// Health Score is a HYBRID of 70% spend efficiency + 30% structural quality per category
// (Keyword/Search Term/Budget), then a weighted average across categories (0.4/0.3/0.3).
// Rate-based (not flat-deduction), so the score is neutral to account size. Categories with
// zero spend are excluded from both the weighted numerator and denominator (their weight is
// effectively redistributed proportionally among the remaining categories).
interface ScoringResult {
  healthScore: number;
  riskLevel: "Excellent" | "Good" | "Needs Improvement" | "At Risk";
  keywordScore: number;
  searchTermScore: number;
  budgetScore: number;
  wastedSpend: number;
}

function clamp100(v: number): number { return Math.max(0, Math.min(100, v)); }

function runScoring(campaign: Record<string, unknown>[], searchTerm: Record<string, unknown>[], ctrGap: number): ScoringResult {
  // KEYWORD CATEGORY
  let kwTotalSpend = 0, kwTotalCount = 0, kwCritSpend = 0, kwHighSpend = 0, kwProblemCount = 0;
  for (const kw of campaign) {
    if (str(col(kw, "Entity")) !== "Keyword") continue;
    const spend = num(col(kw, "Spend"));
    if (spend <= 0) continue;
    const sales = num(col(kw, "Sales"));
    const acos = pct(col(kw, "ACOS"));
    kwTotalSpend += spend;
    kwTotalCount++;
    if (spend > 30 && sales === 0) { kwCritSpend += spend; kwProblemCount++; }
    else if (sales > 0 && acos > 0.4) { kwHighSpend += spend * 0.5; kwProblemCount++; }
  }
  let kwEfficiency = kwTotalSpend > 0 ? (1 - (kwCritSpend + kwHighSpend) / kwTotalSpend) * 100 : 100;
  const kwStructural = kwTotalCount > 0 ? (1 - kwProblemCount / kwTotalCount) * 100 : 100;
  kwEfficiency = clamp100(kwEfficiency + ctrGap * 10);
  const keywordScore = clamp100(Math.round(kwEfficiency * 0.7 + kwStructural * 0.3));

  // SEARCH TERM CATEGORY
  const existingKW = new Set<string>();
  for (const r of campaign) if (str(col(r, "Entity")) === "Keyword") existingKW.add(str(col(r, "Keyword Text")).toLowerCase().trim());
  let stTotalSpend = 0, stWasteSpend = 0, stConverterCount = 0, stUncoveredCount = 0;
  for (const r of searchTerm) {
    const term = str(col(r, "Customer Search Term", "Search Term", "Query"));
    if (!term || term === "Customer Search Term") continue;
    const spend = num(col(r, "Spend"));
    const sales = num(col(r, "Sales", "Attributed Sales 14d"));
    const orders = num(col(r, "Orders", "Attributed Conversions 14d"));
    stTotalSpend += spend;
    if (spend > ST_NEG_MIN_SPEND && orders === 0 && sales === 0) stWasteSpend += spend;
    if (orders >= ST_NEVER_ADDED_MIN_ORDERS) {
      stConverterCount++;
      if (!existingKW.has(term.toLowerCase().trim())) stUncoveredCount++;
    }
  }
  const stEfficiency = stTotalSpend > 0 ? clamp100((1 - stWasteSpend / stTotalSpend) * 100) : 100;
  const stStructural = stConverterCount > 0 ? clamp100((1 - stUncoveredCount / stConverterCount) * 100) : 100;
  const searchTermScore = clamp100(Math.round(stEfficiency * 0.7 + stStructural * 0.3));

  // BUDGET CATEGORY (efficiency-only — no structural component in the source)
  let campTotalSpend = 0, campWaste = 0, campOverspend = 0;
  for (const r of campaign) {
    if (str(col(r, "Entity")) !== "Campaign") continue;
    const spend = num(col(r, "Spend"));
    if (spend <= 0) continue;
    const sales = num(col(r, "Sales"));
    const acos = pct(col(r, "ACOS"));
    campTotalSpend += spend;
    if (spend > BUDGET_WASTE_MIN_SPEND && sales === 0) campWaste += spend;
    else if (sales > 0 && acos > BUDGET_OVERSPEND_ACOS) campOverspend += spend * 0.5;
  }
  const budgetScore = campTotalSpend > 0 ? clamp100(Math.round((1 - (campWaste + campOverspend) / campTotalSpend) * 100)) : 100;

  const wastedSpend = stWasteSpend + kwCritSpend + campWaste;

  // FINAL WEIGHTED SCORE — categories with zero spend excluded from both sums
  const kwHasData = kwTotalSpend > 0, stHasData = stTotalSpend > 0, budHasData = campTotalSpend > 0;
  const weights = { kw: 0.4, st: 0.3, bud: 0.3 };
  let totalWeight = 0, weightedSum = 0;
  if (kwHasData) { totalWeight += weights.kw; weightedSum += keywordScore * weights.kw; }
  if (stHasData) { totalWeight += weights.st; weightedSum += searchTermScore * weights.st; }
  if (budHasData) { totalWeight += weights.bud; weightedSum += budgetScore * weights.bud; }
  const healthScore = totalWeight > 0 ? clamp100(Math.round(weightedSum / totalWeight)) : 0;

  const riskLevel: ScoringResult["riskLevel"] =
    healthScore >= 90 ? "Excellent" :
    healthScore >= 75 ? "Good" :
    healthScore >= 60 ? "Needs Improvement" : "At Risk";

  return { healthScore, riskLevel, keywordScore, searchTermScore, budgetScore, wastedSpend };
}

// ── Growth Opportunity (mod_GrowthOpportunity) ──
// Always defensible: current_sales_at_stake × upliftFactor × confidenceHaircut, reading the
// Impact values off the three Search Term Audit summary findings already produced above.
// Component D (benchmark-gap growth) is permanently 0 in the source — an explicitly
// documented dead branch that would need total-account-sales data not carried here.
const GROWTH_EXACT_UPLIFT = 0.2;      // Growth_ExactMatchUpliftFactor
const GROWTH_BUDGET_UPLIFT = 0.3;     // Growth_BudgetUpliftFactor
const GROWTH_HAIRCUT = 0.7;           // Growth_ConfidenceHaircut

function runGrowthOpportunity(findings: Finding[]): number {
  const impactOf = (idPrefix: string) => findings.find(f => f.id === idPrefix)?.impact ?? 0;
  const expansionSales = impactOf("st-summary-exactexpansion");
  const underfundedSales = impactOf("st-summary-underfunded");
  const neverAddedSales = impactOf("st-summary-neveradded");
  const compA = expansionSales * GROWTH_EXACT_UPLIFT * GROWTH_HAIRCUT;
  const compB = underfundedSales * GROWTH_BUDGET_UPLIFT * GROWTH_HAIRCUT;
  const compC = neverAddedSales * GROWTH_EXACT_UPLIFT * GROWTH_HAIRCUT;
  return compA + compB + compC;
}

// ── Recommendation (mod_Recommendation) ──
// Ranks every non-scoringExempt finding by severity tier first, dollar impact (capped at
// 999,999) as tiebreaker only — severity always dominates.
function getTopActions(findings: Finding[], howMany = 5): Finding[] {
  const sevTier: Record<Finding["severity"], number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const eligible = findings.filter(f => !f.scoringExempt);
  return [...eligible]
    .sort((a, b) => {
      const ra = sevTier[a.severity] * 1000000 + Math.min(a.impact, 999999);
      const rb = sevTier[b.severity] * 1000000 + Math.min(b.impact, 999999);
      return rb - ra;
    })
    .slice(0, howMany);
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
    returnRate:  totalUnits > 0 ? Math.min(totalReturns / totalUnits, 1) : 0,
    wasteRatio:  totalSpend > 0 ? zeroSalesSpend / totalSpend : 0,
    reportingDays: 30,
  };

  // ── Run all audit modules (RunFullAudit order) ──
  const asinCohorts    = runAsinAudit(sales, traffic);
  const kwFindings     = runKeywordAudit(campaign);
  const stFindings     = runSearchTermAudit(searchTerm, campaign);
  const campFindings   = runCampaignAudit(campaign);
  const asinFindings   = runAsinOpportunities(asinCohorts);

  const allFindings = [...kwFindings, ...stFindings, ...campFindings, ...asinFindings];

  // ── Score (mod_Scoring) — ctrGap defaults to 0 until a Benchmark file is supported ──
  const scoring = runScoring(campaign, searchTerm, 0);
  const score = scoring.healthScore;
  const scoreLabel = scoring.riskLevel;

  // ── Growth Opportunity (mod_GrowthOpportunity) ──
  const growthOpportunity = runGrowthOpportunity(allFindings);

  // ── Recommendation (mod_Recommendation) — only non-itemized findings are ranked ──
  const topActions = getTopActions(allFindings, 5);

  // "Wasted Spend" is the exact VBA GetEstimatedWastedSpend figure (zero-return waste only —
  // does not include overspend-relative-to-target impacts). Top waste/opportunity lists use
  // only non-scoringExempt findings so itemized child rows don't double-count against their
  // own summary roll-up.
  const totalWaste = scoring.wastedSpend;
  const totalOpportunity = growthOpportunity;

  const topWaste = [...allFindings]
    .filter(f => f.category === "waste" && !f.scoringExempt)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  const topOpportunities = [...allFindings]
    .filter(f => f.category === "opportunity" && !f.scoringExempt)
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
      _totalReturns: 0,
    } as AsinRow & { _totalReturns: number };
    (asinAgg[asin] as AsinRow & { _totalReturns: number })._totalReturns += num(col(row, "Customer Returns"));
    asinAgg[asin].orderedRevenue += num(col(row, "Ordered Revenue"));
    asinAgg[asin].orderedUnits  += num(col(row, "Ordered Units"));
  }
  // Compute return rate once after all rows are accumulated (avoids divide-by-running-total bug)
  for (const asin of Object.keys(asinAgg)) {
    const row = asinAgg[asin] as AsinRow & { _totalReturns: number };
    row.returnRate = row.orderedUnits > 0
      ? Math.min(row._totalReturns / row.orderedUnits, 1)  // cap at 100% — cross-period returns can exceed ordered units
      : 0;
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

  // ── Build per-keyword table (includes state for enabled/paused filtering) ──
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
      state:        str(col(row, "State")).toLowerCase() || "enabled",
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

  // ── Build search term table (actual customer queries from Search Term report) ──
  const searchTermTable: SearchTermRow[] = searchTerm.map(row => {
    const spend  = num(col(row, "Spend"));
    const sales  = num(col(row, "Sales", "Attributed Sales 14d"));
    const clicks = num(col(row, "Clicks"));
    const orders = num(col(row, "Orders", "Attributed Conversions 14d"));
    const term   = str(col(row, "Customer Search Term", "Search Term", "Query"));
    if (!term || term === "Customer Search Term") return null;
    return {
      searchTerm:     term,
      matchedKeyword: str(col(row, "Keyword Text", "Matched Keyword")),
      matchType:      str(col(row, "Match Type")),
      campaignName:   str(col(row, "_ResolvedCampaignName", "Campaign Name (Informational only)", "Campaign Name")),
      adGroupName:    str(col(row, "Ad Group Name (Informational only)", "Ad Group Name")),
      spend,
      sales,
      acos:  sales  > 0 ? spend / sales  : 0,
      clicks,
      orders,
      cvr:   clicks > 0 ? orders / clicks : 0,
    };
  }).filter((r): r is SearchTermRow => r !== null)
    .sort((a, b) => b.spend - a.spend);

  // ── Assemble result ──
  return {
    score,
    scoreLabel,
    keywordScore: scoring.keywordScore,
    searchTermScore: scoring.searchTermScore,
    budgetScore: scoring.budgetScore,
    growthOpportunity,
    topActions,
    totalWaste,
    totalOpportunity,
    criticalCount: allFindings.filter(f => f.severity === "critical" && !f.scoringExempt).length,
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
    searchTermTable,
    periodLabel: "Current Period",
  };
}
