// ── Audit Engine — all reasoning done here, LLM only formats output ──

export interface Finding {
  id: string;
  category: "waste" | "opportunity" | "structure" | "asin";
  title: string;
  detail: string;
  impact: number; // $ weekly
  severity: "critical" | "high" | "medium" | "low";
  action: string;
}

export interface AsinCohort {
  asin: string;
  cohort: "cash_cow" | "need_love" | "reduce_pause";
  cvr: number;
  spend: number;
  sales: number;
  sessions: number;
}

export interface AuditResult {
  score: number;
  scoreLabel: string;
  spendEfficiency: number;
  structureQuality: number;
  totalWeeklyWaste: number;
  totalMonthlyOpportunity: number;
  criticalCount: number;
  findings: Finding[];
  asinCohorts: AsinCohort[];
  topWaste: Finding[];
  topOpportunities: Finding[];
  summary: AuditSummary;
}

export interface AuditSummary {
  totalSpend: number;
  totalSales: number;
  totalImpressions: number;
  totalClicks: number;
  avgAcos: number;
  avgCvr: number;
  avgCtr: number;
  campaignCount: number;
  keywordCount: number;
  asinCount: number;
  wasteRatio: number;
}

export interface RawData {
  sales: Record<string, unknown>[];
  traffic: Record<string, unknown>[];
  campaign: Record<string, unknown>[];
  searchTerm: Record<string, unknown>[];
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v).replace(/[,$%]/g, ""));
  return isNaN(n) ? 0 : n;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function findCol(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const c of candidates) {
    const key = Object.keys(row).find(
      (k) => k.toLowerCase().replace(/[\s_]/g, "") === c.toLowerCase().replace(/[\s_]/g, "")
    );
    if (key !== undefined) return row[key];
  }
  return undefined;
}

// ── ASIN Cohort Analysis ──
function runAsinAudit(sales: Record<string, unknown>[], traffic: Record<string, unknown>[]): AsinCohort[] {
  const salesMap: Record<string, { sales: number; units: number }> = {};
  for (const row of sales) {
    const asin = str(findCol(row, ["asin", "ASIN", "childAsin"]));
    if (!asin) continue;
    salesMap[asin] = {
      sales: (salesMap[asin]?.sales ?? 0) + num(findCol(row, ["orderedProductSales", "sales", "revenue", "orderedProductSalesAmount"])),
      units: (salesMap[asin]?.units ?? 0) + num(findCol(row, ["unitsOrdered", "units", "quantity"])),
    };
  }

  const trafficMap: Record<string, { sessions: number; pageviews: number }> = {};
  for (const row of traffic) {
    const asin = str(findCol(row, ["asin", "ASIN", "childAsin"]));
    if (!asin) continue;
    trafficMap[asin] = {
      sessions: (trafficMap[asin]?.sessions ?? 0) + num(findCol(row, ["sessions", "visits", "browserSessions"])),
      pageviews: (trafficMap[asin]?.pageviews ?? 0) + num(findCol(row, ["pageViews", "views", "browserPageViews"])),
    };
  }

  const totalSales = Object.values(salesMap).reduce((s, v) => s + v.sales, 0);
  const asins = Object.keys({ ...salesMap, ...trafficMap });

  const cohorts: AsinCohort[] = [];
  let cumulativeSales = 0;
  const sorted = asins
    .map((asin) => ({
      asin,
      sales: salesMap[asin]?.sales ?? 0,
      units: salesMap[asin]?.units ?? 0,
      sessions: trafficMap[asin]?.sessions ?? 1,
    }))
    .sort((a, b) => b.sales - a.sales);

  for (const item of sorted) {
    cumulativeSales += item.sales;
    const cvr = item.sessions > 0 ? item.units / item.sessions : 0;
    const pct = totalSales > 0 ? cumulativeSales / totalSales : 0;
    let cohort: AsinCohort["cohort"];
    if (pct <= 0.8 && item.sales > 0) cohort = "cash_cow";
    else if (cvr > 0.04 && item.sales < totalSales * 0.02) cohort = "need_love";
    else cohort = "reduce_pause";
    cohorts.push({ asin: item.asin, cohort, cvr, spend: 0, sales: item.sales, sessions: item.sessions });
  }
  return cohorts;
}

// ── Keyword Audit ──
function runKeywordAudit(campaign: Record<string, unknown>[]): Finding[] {
  const findings: Finding[] = [];
  const keywords = campaign.filter(
    (r) => str(findCol(r, ["entity", "type", "recordType"])).toLowerCase() === "keyword"
  );

  const acosTarget = 0.3;
  const ctrBenchmark = 0.004;

  for (const kw of keywords) {
    const spend = num(findCol(kw, ["spend", "cost", "totalSpend"]));
    const sales = num(findCol(kw, ["sales", "revenue", "attributedSales14d", "attributedSalesSameSKU14d"]));
    const clicks = num(findCol(kw, ["clicks"]));
    const impressions = num(findCol(kw, ["impressions"]));
    const keyword = str(findCol(kw, ["keyword", "keywordText", "query"]));
    const campaign_name = str(findCol(kw, ["campaignName", "campaign"]));

    if (spend > 50 && sales === 0) {
      findings.push({
        id: `kw-waste-${keyword}`,
        category: "waste",
        title: `High spend, zero sales: "${keyword}"`,
        detail: `Campaign: ${campaign_name || "Unknown"} · Spend: $${spend.toFixed(0)} · Zero conversions`,
        impact: spend / 4,
        severity: spend > 200 ? "critical" : "high",
        action: `Pause keyword "${keyword}" immediately`,
      });
    }

    if (spend > 20 && sales > 0) {
      const acos = spend / sales;
      if (acos > acosTarget * 2.5) {
        findings.push({
          id: `kw-acos-${keyword}`,
          category: "waste",
          title: `Extreme ACOS: "${keyword}" at ${(acos * 100).toFixed(0)}%`,
          detail: `Campaign: ${campaign_name || "Unknown"} · ACOS: ${(acos * 100).toFixed(0)}% vs target ${(acosTarget * 100).toFixed(0)}%`,
          impact: (spend - sales * acosTarget) / 4,
          severity: "high",
          action: `Reduce bid by ${Math.min(70, Math.round((1 - acosTarget / acos) * 100))}% on "${keyword}"`,
        });
      }
    }

    if (impressions > 1000 && clicks / impressions < ctrBenchmark) {
      findings.push({
        id: `kw-ctr-${keyword}`,
        category: "structure",
        title: `Low CTR: "${keyword}" at ${((clicks / impressions) * 100).toFixed(2)}%`,
        detail: `Impressions: ${impressions.toFixed(0)} · CTR: ${((clicks / impressions) * 100).toFixed(2)}% vs benchmark ${(ctrBenchmark * 100).toFixed(2)}%`,
        impact: 0,
        severity: "medium",
        action: `Improve ad copy or pause "${keyword}" — low relevance signal`,
      });
    }
  }
  return findings;
}

// ── Campaign Audit ──
function runCampaignAudit(campaign: Record<string, unknown>[]): Finding[] {
  const findings: Finding[] = [];
  const campaigns = campaign.filter(
    (r) => str(findCol(r, ["entity", "type", "recordType"])).toLowerCase() === "campaign"
  );

  let totalSpend = 0;
  const spendByCampaign: Record<string, number> = {};

  for (const c of campaigns) {
    const spend = num(findCol(c, ["spend", "cost", "totalSpend"]));
    const sales = num(findCol(c, ["sales", "revenue", "attributedSales14d"]));
    const budget = num(findCol(c, ["budget", "dailyBudget"]));
    const name = str(findCol(c, ["campaignName", "name"]));
    totalSpend += spend;
    spendByCampaign[name] = spend;

    if (spend > 100 && sales === 0) {
      findings.push({
        id: `camp-waste-${name}`,
        category: "waste",
        title: `Zero-sales campaign: "${name}"`,
        detail: `Spend: $${spend.toFixed(0)}/week · Zero attributed sales · Wasted budget`,
        impact: spend,
        severity: "critical",
        action: `Pause "${name}" — zero return in reporting period`,
      });
    }

    if (budget > 0 && spend > budget * 7 * 1.15) {
      const overage = spend - budget * 7;
      findings.push({
        id: `camp-over-${name}`,
        category: "waste",
        title: `Overspending: "${name}"`,
        detail: `Weekly spend $${spend.toFixed(0)} vs budget cap $${(budget * 7).toFixed(0)} — ${Math.round((spend / (budget * 7) - 1) * 100)}% over`,
        impact: overage,
        severity: "high",
        action: `Reduce daily budget from $${budget.toFixed(0)} to $${(spend / 7 * 0.85).toFixed(0)}`,
      });
    }
  }

  // Concentration risk
  const sorted = Object.entries(spendByCampaign).sort((a, b) => b[1] - a[1]);
  if (sorted.length >= 2) {
    const top2 = sorted[0][1] + sorted[1][1];
    if (totalSpend > 0 && top2 / totalSpend > 0.6) {
      findings.push({
        id: "camp-concentration",
        category: "structure",
        title: `Budget concentration risk — top 2 campaigns = ${Math.round((top2 / totalSpend) * 100)}% of spend`,
        detail: `"${sorted[0][0]}" ($${sorted[0][1].toFixed(0)}) + "${sorted[1][0]}" ($${sorted[1][1].toFixed(0)}) dominate budget`,
        impact: 0,
        severity: "medium",
        action: `Redistribute budget across 4–5 campaigns to reduce single-point-of-failure risk`,
      });
    }
  }
  return findings;
}

// ── Search Term Audit ──
function runSearchTermAudit(searchTerm: Record<string, unknown>[]): Finding[] {
  const findings: Finding[] = [];
  if (!searchTerm.length) return findings;

  const totalSpend = searchTerm.reduce((s, r) => s + num(findCol(r, ["spend", "cost"])), 0);
  const totalClicks = searchTerm.reduce((s, r) => s + num(findCol(r, ["clicks"])), 0);
  const totalOrders = searchTerm.reduce((s, r) => s + num(findCol(r, ["orders", "purchases", "attributedConversions14d"])), 0);
  const avgCvr = totalClicks > 0 ? totalOrders / totalClicks : 0;

  for (const row of searchTerm) {
    const term = str(findCol(row, ["searchTerm", "query", "customerSearchTerm"]));
    const spend = num(findCol(row, ["spend", "cost"]));
    const sales = num(findCol(row, ["sales", "revenue", "attributedSales14d"]));
    const clicks = num(findCol(row, ["clicks"]));
    const orders = num(findCol(row, ["orders", "purchases", "attributedConversions14d"]));
    const cvr = clicks > 0 ? orders / clicks : 0;
    const ctr = num(findCol(row, ["impressions"])) > 0 ? clicks / num(findCol(row, ["impressions"])) : 0;

    if (spend > 30 && sales === 0) {
      findings.push({
        id: `st-waste-${term}`,
        category: "waste",
        title: `Wasted search term: "${term}"`,
        detail: `Spend: $${spend.toFixed(0)} · Zero sales · Add as negative keyword`,
        impact: spend / 4,
        severity: spend > 100 ? "critical" : "high",
        action: `Add "${term}" as negative keyword across relevant campaigns`,
      });
    }

    if (cvr > avgCvr * 2 && spend < totalSpend * 0.005 && orders > 0) {
      findings.push({
        id: `st-opp-${term}`,
        category: "opportunity",
        title: `High-CVR term never scaled: "${term}"`,
        detail: `CVR: ${(cvr * 100).toFixed(1)}% (2x account avg) · Only $${spend.toFixed(0)} spend · Massive upside`,
        impact: spend * 3,
        severity: "high",
        action: `Add "${term}" as exact-match keyword with bid $${Math.max(0.5, (spend / Math.max(clicks, 1)) * 1.5).toFixed(2)}`,
      });
    }

    if (orders > 2 && cvr > avgCvr * 1.5 && ctr < 0.002) {
      findings.push({
        id: `st-expand-${term}`,
        category: "opportunity",
        title: `Exact-match expansion candidate: "${term}"`,
        detail: `Converting well (CVR ${(cvr * 100).toFixed(1)}%) but low CTR — needs exact match campaign`,
        impact: spend * 2,
        severity: "medium",
        action: `Create exact-match campaign for "${term}" to capture more high-intent traffic`,
      });
    }
  }
  return findings;
}

// ── Score Calculation ──
function calculateScore(findings: Finding[], summary: AuditSummary): { score: number; spendEfficiency: number; structureQuality: number } {
  const wasteRatio = summary.wasteRatio;
  const avgAcos = summary.avgAcos;

  // Spend efficiency (70 points)
  let spendEfficiency = 70;
  spendEfficiency -= Math.min(30, wasteRatio * 100); // waste ratio penalty
  spendEfficiency -= Math.min(15, Math.max(0, (avgAcos - 0.3) * 50)); // ACOS penalty
  spendEfficiency = Math.max(0, Math.round(spendEfficiency));

  // Structure quality (30 points)
  const criticalFindings = findings.filter((f) => f.severity === "critical").length;
  const structureFindings = findings.filter((f) => f.category === "structure").length;
  let structureQuality = 30;
  structureQuality -= Math.min(15, criticalFindings * 3);
  structureQuality -= Math.min(10, structureFindings * 2);
  structureQuality = Math.max(0, Math.round(structureQuality));

  const score = spendEfficiency + structureQuality;
  return { score, spendEfficiency, structureQuality };
}

// ── Main Engine ──
export function runAuditEngine(data: RawData): AuditResult {
  const { sales, traffic, campaign, searchTerm } = data;

  // Compute summary metrics
  const campRows = campaign.filter(
    (r) => str(findCol(r, ["entity", "type", "recordType"])).toLowerCase() !== "campaign" &&
           str(findCol(r, ["entity", "type", "recordType"])).toLowerCase() !== "adgroup"
  );

  const totalSpend = campaign.reduce((s, r) => s + num(findCol(r, ["spend", "cost", "totalSpend"])), 0);
  const totalSales = campaign.reduce((s, r) => s + num(findCol(r, ["sales", "revenue", "attributedSales14d"])), 0);
  const totalImpressions = campaign.reduce((s, r) => s + num(findCol(r, ["impressions"])), 0);
  const totalClicks = campaign.reduce((s, r) => s + num(findCol(r, ["clicks"])), 0);
  const totalOrders = campaign.reduce((s, r) => s + num(findCol(r, ["orders", "purchases", "attributedConversions14d"])), 0);

  const campaignNames = new Set(campaign.map((r) => str(findCol(r, ["campaignName", "name"]))).filter(Boolean));
  const keywords = campaign.filter((r) => str(findCol(r, ["entity", "type", "recordType"])).toLowerCase() === "keyword");
  const asinSet = new Set([...sales.map((r) => str(findCol(r, ["asin", "ASIN"]))), ...traffic.map((r) => str(findCol(r, ["asin", "ASIN"])))].filter(Boolean));

  const zeroSalesSpend = campaign
    .filter((r) => num(findCol(r, ["sales", "revenue", "attributedSales14d"])) === 0)
    .reduce((s, r) => s + num(findCol(r, ["spend", "cost"])), 0);

  const summary: AuditSummary = {
    totalSpend,
    totalSales,
    totalImpressions,
    totalClicks,
    avgAcos: totalSales > 0 ? totalSpend / totalSales : 0,
    avgCvr: totalClicks > 0 ? totalOrders / totalClicks : 0,
    avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
    campaignCount: campaignNames.size,
    keywordCount: keywords.length,
    asinCount: asinSet.size,
    wasteRatio: totalSpend > 0 ? zeroSalesSpend / totalSpend : 0,
  };

  // Run all audit modules
  const kwFindings = runKeywordAudit(campaign);
  const campFindings = runCampaignAudit(campaign);
  const stFindings = runSearchTermAudit(searchTerm);
  const asinCohorts = runAsinAudit(sales, traffic);

  const allFindings = [...kwFindings, ...campFindings, ...stFindings];

  // Score
  const { score, spendEfficiency, structureQuality } = calculateScore(allFindings, summary);

  const scoreLabel =
    score >= 80 ? "Healthy" : score >= 65 ? "Needs Attention" : score >= 50 ? "At Risk" : "Critical";

  const totalWeeklyWaste = allFindings
    .filter((f) => f.category === "waste")
    .reduce((s, f) => s + f.impact, 0);

  const totalMonthlyOpportunity = allFindings
    .filter((f) => f.category === "opportunity")
    .reduce((s, f) => s + f.impact * 4, 0);

  const topWaste = allFindings
    .filter((f) => f.category === "waste")
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  const topOpportunities = allFindings
    .filter((f) => f.category === "opportunity")
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5);

  return {
    score,
    scoreLabel,
    spendEfficiency,
    structureQuality,
    totalWeeklyWaste,
    totalMonthlyOpportunity,
    criticalCount: allFindings.filter((f) => f.severity === "critical").length,
    findings: allFindings,
    asinCohorts,
    topWaste,
    topOpportunities,
    summary,
  };
}
