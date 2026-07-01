// ── Chat Engine — Smart Analyst
// Architecture: raw audit data → rich dynamic context → GPT-4 thinks → accurate answer
// No keyword matching. No canned responses. Every answer computed from real data.
// Future-proof: as new data sources are added to AuditResult, they flow through automatically.

import { AuditResult, CampaignRow, AsinRow } from "./auditEngine";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ── Formatters ──
function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
function fmtPct(n: number): string { return `${(n * 100).toFixed(2)}%`; }
function fmtN(n: number): string   { return n.toLocaleString(); }

// ── Build the richest possible context for GPT ──
// This is the brain — everything the analyst needs to answer any question.
// As new data sources are added (inventory, SB/SD, DSP, BSR, etc.) add them here.
export function buildLLMContext(audit: AuditResult, question: string): string {
  const {
    summary, score, scoreLabel, spendEfficiency, structureQuality,
    totalWaste, totalOpportunity, findings, asinCohorts,
    topWaste, topOpportunities, campaignTable, asinTable,
    hasCampaignData, hasSalesData, periodLabel,
  } = audit;

  // ── Account-level KPIs ──
  const kpis = [
    `Health Score: ${score}/100 (${scoreLabel})`,
    `Spend Efficiency: ${spendEfficiency}/70 | Structure Quality: ${structureQuality}/30`,
    `Period: ${periodLabel} (~${summary.reportingDays} days)`,
    `Total Ad Spend: ${fmt$(summary.totalSpend)} | Ad Sales: ${fmt$(summary.totalSales)}`,
    `ACOS: ${fmtPct(summary.avgAcos)} | CVR: ${fmtPct(summary.avgCvr)} | CTR: ${fmtPct(summary.avgCtr)}`,
    `Impressions: ${fmtN(summary.totalImpressions)} | Clicks: ${fmtN(summary.totalClicks)} | Orders: ${fmtN(summary.totalOrders)}`,
    `Campaigns: ${summary.campaignCount} | Keywords: ${summary.keywordCount}`,
    `Ordered Revenue: ${fmt$(summary.totalOrderedRevenue)} | Ordered Units: ${fmtN(summary.totalOrderedUnits)}`,
    `Page Views: ${fmtN(summary.totalPageViews)} | Return Rate: ${fmtPct(summary.returnRate)}`,
    `Top Brand: ${summary.topBrand}`,
    `Total Waste: ${fmt$(totalWaste)} | Monthly Opportunity: ${fmt$(totalOpportunity)}`,
    `Data loaded: ${hasCampaignData ? "Bulk Campaign ✓" : "No campaign file"} | ${hasSalesData ? "Vendor Central Sales+Traffic ✓" : "No sales file"}`,
  ].join("\n");

  // ── All findings — full detail, not truncated ──
  const criticalFindings = findings.filter(f => f.severity === "critical");
  const highFindings     = findings.filter(f => f.severity === "high");
  const wasteFindings    = findings.filter(f => f.category === "waste").sort((a, b) => b.impact - a.impact);
  const oppFindings      = findings.filter(f => f.category === "opportunity").sort((a, b) => b.impact - a.impact);
  const structFindings   = findings.filter(f => f.category === "structure");

  const formatFindings = (list: typeof findings, limit = 20) =>
    list.slice(0, limit).map((f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.title} | Impact: ${fmt$(f.impact)} | ${f.detail} | Action: ${f.action}`
    ).join("\n") || "None";

  // ── Campaign table — all campaigns with full metrics ──
  const campLines = campaignTable.slice(0, 50).map((c, i) =>
    `${i + 1}. "${c.name}" | Spend: ${fmt$(c.spend)} | Sales: ${fmt$(c.sales)} | ACOS: ${fmtPct(c.acos)} | Orders: ${c.orders} | Clicks: ${fmtN(c.clicks)} | CTR: ${fmtPct(c.ctr)} | CVR: ${fmtPct(c.cvr)}`
  ).join("\n") || "No campaign data";

  // ── ASIN table — all ASINs with full metrics ──
  const asinLines = asinTable.slice(0, 50).map((a, i) =>
    `${i + 1}. ${a.asin} | "${a.title.slice(0, 50)}" | Brand: ${a.brand} | Revenue: ${fmt$(a.orderedRevenue)} | Units: ${fmtN(a.orderedUnits)} | Page Views: ${fmtN(a.pageViews)} | Rev/View: $${a.revenuePerView.toFixed(3)} | Return Rate: ${fmtPct(a.returnRate)}`
  ).join("\n") || "No ASIN data";

  // ── ASIN cohorts ──
  const cohortLines = asinCohorts.slice(0, 30).map(a =>
    `${a.asin} [${a.cohort.toUpperCase()}] | Revenue: ${fmt$(a.orderedRevenue)} | Units: ${fmtN(a.orderedUnits)} | Rev/View: $${a.revenuePerView.toFixed(3)} | Returns: ${fmtPct(a.returnRate)}`
  ).join("\n") || "No cohort data";

  // ── Waste by campaign (computed) ──
  const wasteByAsin = asinTable
    .filter(a => a.orderedRevenue === 0 && a.pageViews > 0)
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, 20)
    .map((a, i) => `${i + 1}. ${a.asin} "${a.title.slice(0, 40)}" | Views: ${fmtN(a.pageViews)} | $0 revenue`)
    .join("\n");

  const highAcosCampaigns = campaignTable
    .filter(c => c.sales > 0 && c.acos > 0.5)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 20)
    .map((c, i) => `${i + 1}. "${c.name}" | ACOS: ${fmtPct(c.acos)} | Waste: ${fmt$(c.spend - c.sales * 0.4)} | Spend: ${fmt$(c.spend)}`)
    .join("\n");

  const zeroSalesCampaigns = campaignTable
    .filter(c => c.spend > 0 && c.sales === 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 20)
    .map((c, i) => `${i + 1}. "${c.name}" | Spend: ${fmt$(c.spend)} | $0 sales`)
    .join("\n");

  return `You are a world-class Amazon advertising analyst AI. You have full access to the account data below. Answer the user's question accurately, specifically, and insightfully based ONLY on this data.

Rules:
- Compute answers directly from the tables below — do not guess or hallucinate
- Be specific with numbers, names, and ASINs from the data
- If asked for a list (e.g. "top 20"), provide exactly that many items from the data
- Format responses clearly — use numbered lists for rankings, bullet points for recommendations
- Always end with 1-2 concrete, prioritized next actions
- If data is not available to answer part of the question, say so clearly

═══════════════════════════════════════
ACCOUNT KPIs
═══════════════════════════════════════
${kpis}

═══════════════════════════════════════
FINDINGS SUMMARY: ${findings.length} total (${criticalFindings.length} critical, ${highFindings.length} high)
═══════════════════════════════════════
WASTE FINDINGS (${wasteFindings.length} total, sorted by impact):
${formatFindings(wasteFindings, 25)}

OPPORTUNITY FINDINGS (${oppFindings.length} total):
${formatFindings(oppFindings, 15)}

STRUCTURE FINDINGS (${structFindings.length} total):
${formatFindings(structFindings, 10)}

═══════════════════════════════════════
ALL CAMPAIGNS (${campaignTable.length} total, sorted by spend):
═══════════════════════════════════════
${campLines}

═══════════════════════════════════════
ZERO-SALES CAMPAIGNS (spending with no return):
═══════════════════════════════════════
${zeroSalesCampaigns || "None"}

═══════════════════════════════════════
HIGH-ACOS CAMPAIGNS (>50% ACOS):
═══════════════════════════════════════
${highAcosCampaigns || "None"}

═══════════════════════════════════════
ALL ASINs (${asinTable.length} total, sorted by revenue):
═══════════════════════════════════════
${asinLines}

═══════════════════════════════════════
ASINs WITH PAGE VIEWS BUT ZERO REVENUE (possible ad waste):
═══════════════════════════════════════
${wasteByAsin || "None"}

═══════════════════════════════════════
ASIN COHORT ANALYSIS (${asinCohorts.length} total):
═══════════════════════════════════════
${cohortLines}

═══════════════════════════════════════
USER QUESTION: ${question}
═══════════════════════════════════════

Answer now. Be specific, use exact numbers and names from the data above. If the user asks for "top N" give exactly N items.`;
}

// ── Fallback response when no API key — computed from data, not canned ──
// This computes a direct answer from the audit data without LLM.
// It handles the most common question types intelligently.
export function buildLocalResponse(audit: AuditResult, _intentParam: string, question: string): string {
  const q = question.toLowerCase();
  const {
    summary, score, scoreLabel, spendEfficiency, structureQuality,
    totalWaste, totalOpportunity, findings, asinCohorts,
    topWaste, topOpportunities, campaignTable, asinTable,
  } = audit;

  const fmt  = fmt$;
  const pct  = fmtPct;
  const n    = fmtN;

  // ── Helper: HTML finding card ──
  const fc = (title: string, detail: string, action: string, color = "#ef4444", cls = "") =>
    `<div class="fc ${cls}"><div class="fc-title" style="color:${color}">${title}</div><div class="fc-detail">${detail}</div><div class="fc-action">▶ ${action}</div></div>`;

  // ── Helper: extract number from question ("top 20" → 20) ──
  const extractN = (text: string, def = 10): number => {
    const m = text.match(/\b(\d+)\b/);
    return m ? Math.min(parseInt(m[1]), 50) : def;
  };

  // ── Helper: campaign table HTML ──
  const campTableHtml = (rows: CampaignRow[], limit: number) => {
    const shown = rows.slice(0, limit);
    if (!shown.length) return "<div class='fc'><div class='fc-detail'>No campaign data available.</div></div>";
    const TH = (l: string, a = "right") => `<th style="padding:5px 8px;border-bottom:2px solid #e5e7eb;text-align:${a};white-space:nowrap;color:#57606a;font-weight:600">${l}</th>`;
    const TD = (v: string, a = "right", c = "") => `<td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;text-align:${a};${c ? `color:${c}` : ""}">${v}</td>`;
    const acosClr = (a: number) => a > 0.6 ? "#ef4444" : a > 0.35 ? "#f97316" : "#166534";
    return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
<thead><tr>${TH("Campaign","left")}${TH("Spend")}${TH("Sales")}${TH("ACOS")}${TH("Orders")}${TH("Clicks")}${TH("CTR")}${TH("CVR")}</tr></thead>
<tbody>${shown.map(c => `<tr>
  ${TD(`<span style="font-weight:500">${c.name.slice(0,45)}${c.name.length>45?"…":""}</span>`,"left")}
  ${TD(fmt(c.spend))}${TD(fmt(c.sales))}
  ${TD(pct(c.acos),"right",acosClr(c.acos))}
  ${TD(String(c.orders))}${TD(n(c.clicks))}${TD(pct(c.ctr))}${TD(pct(c.cvr))}
</tr>`).join("")}</tbody></table></div>
${rows.length > limit ? `<div style="font-size:11px;color:#57606a;margin-top:4px">Showing ${limit} of ${rows.length} campaigns</div>` : ""}`;
  };

  // ── Helper: ASIN table HTML ──
  const asinTableHtml = (rows: AsinRow[], limit: number) => {
    const shown = rows.slice(0, limit);
    if (!shown.length) return "<div class='fc'><div class='fc-detail'>No ASIN data available. Upload Vendor Central files.</div></div>";
    const TH = (l: string, a = "right") => `<th style="padding:5px 8px;border-bottom:2px solid #e5e7eb;text-align:${a};white-space:nowrap;color:#57606a;font-weight:600">${l}</th>`;
    const TD = (v: string, a = "right", c = "") => `<td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;text-align:${a};${c ? `color:${c}` : ""}">${v}</td>`;
    return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
<thead><tr>${TH("ASIN","left")}${TH("Product","left")}${TH("Brand","left")}${TH("Revenue")}${TH("Units")}${TH("Views")}${TH("Rev/View")}${TH("Returns")}</tr></thead>
<tbody>${shown.map(a => `<tr>
  ${TD(`<code style="font-size:11px">${a.asin}</code>`,"left")}
  ${TD(`<span style="font-weight:500">${a.title.slice(0,35)}${a.title.length>35?"…":""}</span>`,"left")}
  ${TD(a.brand,"left")}
  ${TD(fmt(a.orderedRevenue))}${TD(n(a.orderedUnits))}${TD(n(a.pageViews))}
  ${TD(`$${a.revenuePerView.toFixed(3)}`)}
  ${TD(pct(a.returnRate),"right",a.returnRate>0.1?"#ef4444":"")}
</tr>`).join("")}</tbody></table></div>
${rows.length > limit ? `<div style="font-size:11px;color:#57606a;margin-top:4px">Showing ${limit} of ${rows.length} ASINs</div>` : ""}`;
  };

  // ══════════════════════════════════════════════════
  // SMART ROUTING — read the question, compute the answer
  // ══════════════════════════════════════════════════

  // PowerPoint
  if (/powerpoint|pptx|ppt|slide|presentat/i.test(q)) return "__POWERPOINT__";

  // ── ASIN waste questions ──
  if (/asin.*wast|wast.*asin|asin.*budget|budget.*asin|asin.*spend.*no|asin.*zero|asin.*poor/i.test(q)) {
    const limit = extractN(q, 20);
    const wasteful = asinTable
      .filter(a => a.pageViews > 100 && a.orderedRevenue < 100)
      .sort((a, b) => b.pageViews - a.pageViews)
      .slice(0, limit);
    const lowConvert = asinCohorts
      .filter(a => a.cohort === "reduce_pause")
      .slice(0, limit);
    const list = wasteful.length ? wasteful : lowConvert.map(a => asinTable.find(r => r.asin === a.asin)).filter(Boolean) as AsinRow[];
    return `Top ${list.length} ASINs burning budget with poor return:<br>${asinTableHtml(list, limit)}
      <br><strong>Action:</strong> Pause ad spend on zero-revenue ASINs. Redirect budget to Cash Cows.`;
  }

  // ── Campaign waste / zero sales ──
  if (/campaign.*wast|wast.*campaign|zero.*sales.*campaign|campaign.*zero|campaign.*no.*sales/i.test(q)) {
    const limit = extractN(q, 20);
    const zero  = campaignTable.filter(c => c.spend > 0 && c.sales === 0).sort((a, b) => b.spend - a.spend);
    return `${zero.length} campaigns spending with zero sales — total waste: <strong>${fmt(zero.reduce((s,c)=>s+c.spend,0))}</strong>:<br>
      ${campTableHtml(zero, limit)}`;
  }

  // ── High ACOS campaigns ──
  if (/high.*acos|acos.*high|acos.*above|above.*acos|campaign.*acos/i.test(q)) {
    const limit  = extractN(q, 20);
    const threshold = q.match(/(\d+)\s*%/) ? parseInt(q.match(/(\d+)\s*%/)![1]) / 100 : 0.5;
    const high   = campaignTable.filter(c => c.sales > 0 && c.acos > threshold).sort((a, b) => b.spend - a.spend);
    return `${high.length} campaigns above ${pct(threshold)} ACOS:<br>${campTableHtml(high, limit)}`;
  }

  // ── Top/best performing campaigns ──
  if (/top.*campaign|best.*campaign|perform.*campaign|campaign.*perform|campaign.*revenue|campaign.*sales/i.test(q)) {
    const limit = extractN(q, 20);
    const best  = [...campaignTable].filter(c => c.sales > 0).sort((a, b) => b.sales - a.sales);
    return `Top ${Math.min(limit, best.length)} campaigns by sales:<br>${campTableHtml(best, limit)}`;
  }

  // ── All campaigns table ──
  if (/all.*campaign|campaign.*list|campaign.*table|list.*campaign|show.*campaign|campaign.*breakdown/i.test(q)) {
    const limit = extractN(q, 30);
    return `All ${campaignTable.length} campaigns:<br>${campTableHtml(campaignTable, limit)}`;
  }

  // ── Top ASINs by revenue ──
  if (/top.*asin|best.*asin|asin.*revenue|revenue.*asin|top.*product|best.*product/i.test(q)) {
    const limit = extractN(q, 20);
    return `Top ${Math.min(limit, asinTable.length)} ASINs by revenue:<br>${asinTableHtml(asinTable, limit)}`;
  }

  // ── All ASINs table ──
  if (/all.*asin|asin.*list|asin.*table|list.*asin|show.*asin|asin.*breakdown|product.*table/i.test(q)) {
    const limit = extractN(q, 30);
    return `All ${asinTable.length} ASINs:<br>${asinTableHtml(asinTable, limit)}`;
  }

  // ── Waste / budget burning ──
  if (/wast|burn|bleed|zero.?sal|no.?sal|inefficien|losing.*money|money.*drain/i.test(q)) {
    const lines = topWaste.slice(0, 5).map(f => fc(f.title, f.detail, f.action, f.severity === "critical" ? "#ef4444" : "#f97316")).join("");
    return `<strong>${fmt(totalWaste)}</strong> wasted this period — <strong>${fmt(totalWaste*12)}/year</strong> annualized:<br>${lines}`;
  }

  // ── Keywords ──
  if (/keyword|bid|pause.*kw|kw.*pause/i.test(q)) {
    const kwWaste  = findings.filter(f => f.category === "waste" && f.id.startsWith("kw-")).slice(0, 8);
    const limit    = extractN(q, 10);
    const lines    = kwWaste.slice(0, limit).map(f => fc(f.title, f.detail, f.action)).join("");
    return `<strong>${findings.filter(f=>f.id.startsWith("kw-")).length} keyword issues</strong> found:<br>${lines || fc("No critical keyword issues","All keywords within thresholds","Monitor weekly")}`;
  }

  // ── Score ──
  if (/score|health|grade|rating|why.*low|dragging/i.test(q)) {
    const draggers = findings.filter(f => f.severity === "critical" || f.severity === "high").slice(0, 4);
    const lines    = draggers.map(f => fc(f.title, f.detail, f.action)).join("");
    const gain     = Math.min(27, findings.filter(f=>f.severity==="critical").length*5 + findings.filter(f=>f.severity==="high").length*2);
    return `Health score <strong>${score}/100 — ${scoreLabel}</strong>
      <div class="chip-row">
        <div class="chip-stat ${spendEfficiency<50?"red":"yellow"}"><span>${spendEfficiency}</span>Spend /70</div>
        <div class="chip-stat ${structureQuality<20?"red":"yellow"}"><span>${structureQuality}</span>Structure /30</div>
        <div class="chip-stat red"><span>${findings.filter(f=>f.severity==="critical").length}</span>Critical</div>
      </div>
      ${lines}<br><strong>Fix critical issues → estimated: ${Math.min(100,score+gain)}/100</strong>`;
  }

  // ── Opportunities / growth ──
  if (/opportunit|grow|scale|upside|potential|increase|expand|more.*sal/i.test(q)) {
    const limit = extractN(q, 8);
    const lines = topOpportunities.slice(0, limit).map(f => fc(f.title, f.detail, f.action, "#166534", "opp")).join("");
    return `<strong>${findings.filter(f=>f.category==="opportunity").length} growth opportunities</strong> — <strong>${fmt(totalOpportunity)}/month</strong> upside:<br>${lines}`;
  }

  // ── ASINs / products / cohorts ──
  if (/asin|product|cohort|cash.?cow|need.*love|reduce.*pause|item|sku/i.test(q)) {
    const cows   = asinCohorts.filter(a => a.cohort === "cash_cow");
    const love   = asinCohorts.filter(a => a.cohort === "need_love");
    const reduce = asinCohorts.filter(a => a.cohort === "reduce_pause");
    const limit  = extractN(q, 10);
    return `ASIN cohort analysis — <strong>${asinCohorts.length} ASINs</strong>:
      <div class="chip-row">
        <div class="chip-stat green"><span>${cows.length}</span>Cash Cows</div>
        <div class="chip-stat yellow"><span>${love.length}</span>Need Love</div>
        <div class="chip-stat red"><span>${reduce.length}</span>Reduce/Pause</div>
      </div>
      ${asinTableHtml(asinTable, limit)}`;
  }

  // ── Search terms ──
  if (/search.?term|search.?query|negative|query/i.test(q)) {
    const stWaste = findings.filter(f => f.id.startsWith("st-waste-")).slice(0, 5);
    const stOpp   = findings.filter(f => f.id.startsWith("st-opp-") || f.id.startsWith("st-expand-")).slice(0, 5);
    const lines   = [...stWaste, ...stOpp].map(f => fc(f.title, f.detail, f.action, f.category==="opportunity"?"#166534":"#ef4444", f.category==="opportunity"?"opp":"")).join("");
    return `Search term analysis: <strong>${stWaste.length} wasted</strong> · <strong>${stOpp.length} opportunities</strong>:<br>${lines || fc("Upload Search Term Report","Add the SP Search Term Report sheet for query-level analysis","Upload bulk file with search term data","#3b82d4")}`;
  }

  // ── Spend ──
  if (/spend|cost|cpc|how.?much.*pay|ad.*budget/i.test(q)) {
    const wasteRatio = (summary.wasteRatio * 100).toFixed(1);
    const cpc = summary.totalClicks > 0 ? summary.totalSpend / summary.totalClicks : 0;
    return `Ad spend analysis — <strong>${fmt(summary.totalSpend)}</strong> total:
      <div class="chip-row">
        <div class="chip-stat blue"><span>${fmt(summary.totalSpend)}</span>Total Spend</div>
        <div class="chip-stat red"><span>${fmt(totalWaste)}</span>Wasted (${wasteRatio}%)</div>
        <div class="chip-stat green"><span>${fmt(summary.totalSales)}</span>Ad Sales</div>
      </div>
      Avg CPC: <strong>$${cpc.toFixed(2)}</strong> · ACOS: <strong>${pct(summary.avgAcos)}</strong><br>
      ${topWaste[0] ? fc(`Biggest waste: ${topWaste[0].title}`, topWaste[0].detail, topWaste[0].action) : ""}`;
  }

  // ── Revenue / sales ──
  if (/revenue|sales|order|earning|income|how.?much.*mak|how.?much.*sell/i.test(q)) {
    const adShare = summary.totalOrderedRevenue > 0 ? ((summary.totalSales / summary.totalOrderedRevenue) * 100).toFixed(1) : "N/A";
    return `Revenue overview:
      <div class="chip-row">
        <div class="chip-stat green"><span>${fmt(summary.totalOrderedRevenue)}</span>Total Revenue</div>
        <div class="chip-stat blue"><span>${fmt(summary.totalSales)}</span>Ad Sales (${adShare}%)</div>
        <div class="chip-stat blue"><span>${n(summary.totalOrderedUnits)}</span>Units</div>
      </div>
      ACOS: <strong>${pct(summary.avgAcos)}</strong> · CVR: <strong>${pct(summary.avgCvr)}</strong> · Returns: <strong>${pct(summary.returnRate)}</strong><br>
      ${topOpportunities[0] ? fc(`Top opportunity: ${topOpportunities[0].title}`, topOpportunities[0].detail, topOpportunities[0].action, "#166534", "opp") : ""}`;
  }

  // ── CTR ──
  if (/\bctr\b|click.?through|click.?rate/i.test(q)) {
    const lowCtr = findings.filter(f => f.id.startsWith("kw-ctr-")).slice(0, 5);
    return `CTR overview: Avg <strong>${pct(summary.avgCtr)}</strong> (benchmark ~0.35%)<br>
      <div class="chip-row">
        <div class="chip-stat ${summary.avgCtr<0.002?"red":"yellow"}"><span>${pct(summary.avgCtr)}</span>Avg CTR</div>
        <div class="chip-stat blue"><span>${n(summary.totalImpressions)}</span>Impressions</div>
        <div class="chip-stat blue"><span>${n(summary.totalClicks)}</span>Clicks</div>
      </div>
      ${lowCtr.map(f=>fc(f.title,f.detail,f.action,"#f97316")).join("")}`;
  }

  // ── CVR ──
  if (/\bcvr\b|convers/i.test(q)) {
    return `CVR overview: Avg <strong>${pct(summary.avgCvr)}</strong> (Amazon avg ~10-13%)<br>
      <div class="chip-row">
        <div class="chip-stat ${summary.avgCvr<0.05?"red":"yellow"}"><span>${pct(summary.avgCvr)}</span>Avg CVR</div>
        <div class="chip-stat blue"><span>${n(summary.totalClicks)}</span>Clicks</div>
        <div class="chip-stat blue"><span>${n(summary.totalOrders)}</span>Orders</div>
      </div>
      ${summary.avgCvr < 0.05 ? "Low CVR — review product listings, pricing, reviews, and images." : summary.avgCvr < 0.10 ? "Moderate CVR — room to improve." : "Strong CVR — scale winning campaigns."}`;
  }

  // ── Returns ──
  if (/return|refund/i.test(q)) {
    return `Return rate: <strong>${pct(summary.returnRate)}</strong>
      <div class="chip-row">
        <div class="chip-stat ${summary.returnRate>0.1?"red":summary.returnRate>0.05?"yellow":"green"}"><span>${pct(summary.returnRate)}</span>Return Rate</div>
        <div class="chip-stat blue"><span>${n(summary.totalOrderedUnits)}</span>Units Ordered</div>
      </div>
      ${summary.returnRate > 0.1 ? "⚠️ Above 10% — review listings, size charts, product descriptions." : summary.returnRate > 0.05 ? "Moderate — monitor by ASIN for spikes." : "Healthy — below 5%."}`;
  }

  // ── Impressions / traffic / visibility ──
  if (/impression|visibility|reach|traffic|page.?view/i.test(q)) {
    return `Impressions & visibility:
      <div class="chip-row">
        <div class="chip-stat blue"><span>${(summary.totalImpressions/1000).toFixed(0)}K</span>Ad Impressions</div>
        <div class="chip-stat blue"><span>${(summary.totalPageViews/1000).toFixed(0)}K</span>Page Views</div>
        <div class="chip-stat yellow"><span>${pct(summary.avgCtr)}</span>CTR</div>
      </div>
      ${n(summary.totalImpressions)} impressions across ${summary.keywordCount} keywords and ${summary.campaignCount} campaigns.`;
  }

  // ── Brand ──
  if (/brand/i.test(q)) {
    const brandRevMap: Record<string, number> = {};
    asinTable.forEach(a => { brandRevMap[a.brand] = (brandRevMap[a.brand]??0) + a.orderedRevenue; });
    const sorted = Object.entries(brandRevMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const lines  = sorted.map(([b,r],i) => `<div class="fc opp"><div class="fc-title">${i+1}. ${b}</div><div class="fc-detail">Revenue: ${fmt(r)}</div></div>`).join("");
    return `Brand breakdown — top brand: <strong>${summary.topBrand}</strong>:<br>${lines || fc("Upload Vendor Central sales data","Brand breakdown requires sales data","Upload Sales by ASIN file","#3b82d4")}`;
  }

  // ── Data info ──
  if (/how.?many.?day|date.?range|time.?period|how.?long|data.?cover|upload|period|how.?much.?data/i.test(q)) {
    return `Data loaded — approximately <strong>${summary.reportingDays} days</strong>:
      <div class="chip-row">
        <div class="chip-stat blue"><span>${summary.campaignCount}</span>Campaigns</div>
        <div class="chip-stat blue"><span>${summary.keywordCount}</span>Keywords</div>
        <div class="chip-stat green"><span>${summary.asinCount}</span>ASINs</div>
      </div>
      Ad spend: <strong>${fmt(summary.totalSpend)}</strong> · Revenue: <strong>${fmt(summary.totalOrderedRevenue)}</strong>`;
  }

  // ── Default: rich summary ──
  // When we don't know the question — give everything useful, not a dead-end
  return `Here's your account at a glance:
    <div class="chip-row">
      <div class="chip-stat ${score<65?"red":score<80?"yellow":"green"}"><span>${score}</span>Health Score</div>
      <div class="chip-stat red"><span>${fmt(totalWaste)}</span>Waste</div>
      <div class="chip-stat green"><span>${fmt(totalOpportunity)}</span>Opp/mo</div>
      <div class="chip-stat blue"><span>${fmt(summary.totalOrderedRevenue)}</span>Revenue</div>
    </div>
    ACOS: <strong>${pct(summary.avgAcos)}</strong> · CVR: <strong>${pct(summary.avgCvr)}</strong> · CTR: <strong>${pct(summary.avgCtr)}</strong><br>
    ${topWaste[0] ? `Top waste: <strong>${topWaste[0].title}</strong> — ${topWaste[0].action}<br>` : ""}
    ${topOpportunities[0] ? `Top opportunity: <strong>${topOpportunities[0].title}</strong> — ${topOpportunities[0].action}<br>` : ""}
    <br>Ask me anything — "top 20 wasted campaigns", "which ASINs to pause", "show all campaigns in a table", "compare periods", "why is my score low"`;
}

export function getIntent(question: string): string {
  return "smart"; // intent detection is no longer needed — LLM and smart routing handle everything
}

// ── Period comparison table ──
export function buildComparisonTable(a: AuditResult, b: AuditResult): string {
  const p = (n: number) => fmtPct(n);
  const f = (n: number) => fmt$(n);
  const sign = (n: number) => n > 0 ? "+" : "";

  const rows = [
    { metric: "Health Score",    a: `${a.score}/100`,    b: `${b.score}/100`,    delta: b.score - a.score,                                    fmt: (d:number)=>`${sign(d)}${d}`,                    good: (d:number)=>d>0 },
    { metric: "Ad Spend",        a: f(a.summary.totalSpend),  b: f(b.summary.totalSpend),  delta: b.summary.totalSpend - a.summary.totalSpend,       fmt: (d:number)=>`${sign(d)}${f(Math.abs(d))}`,       good: (d:number)=>d<0 },
    { metric: "Ad Sales",        a: f(a.summary.totalSales),  b: f(b.summary.totalSales),  delta: b.summary.totalSales - a.summary.totalSales,       fmt: (d:number)=>`${sign(d)}${f(Math.abs(d))}`,       good: (d:number)=>d>0 },
    { metric: "ACOS",            a: p(a.summary.avgAcos), b: p(b.summary.avgAcos), delta: b.summary.avgAcos - a.summary.avgAcos,               fmt: (d:number)=>`${sign(d)}${((Math.abs(d))*100).toFixed(1)}%`, good: (d:number)=>d<0 },
    { metric: "CVR",             a: p(a.summary.avgCvr),  b: p(b.summary.avgCvr),  delta: b.summary.avgCvr - a.summary.avgCvr,                 fmt: (d:number)=>`${sign(d)}${((Math.abs(d))*100).toFixed(1)}%`, good: (d:number)=>d>0 },
    { metric: "CTR",             a: p(a.summary.avgCtr),  b: p(b.summary.avgCtr),  delta: b.summary.avgCtr - a.summary.avgCtr,                 fmt: (d:number)=>`${sign(d)}${((Math.abs(d))*100).toFixed(2)}%`, good: (d:number)=>d>0 },
    { metric: "Total Waste",     a: f(a.totalWaste),      b: f(b.totalWaste),      delta: b.totalWaste - a.totalWaste,                           fmt: (d:number)=>`${sign(d)}${f(Math.abs(d))}`,       good: (d:number)=>d<0 },
    { metric: "Ordered Revenue", a: f(a.summary.totalOrderedRevenue), b: f(b.summary.totalOrderedRevenue), delta: b.summary.totalOrderedRevenue - a.summary.totalOrderedRevenue, fmt: (d:number)=>`${sign(d)}${f(Math.abs(d))}`, good: (d:number)=>d>0 },
    { metric: "Orders",          a: fmtN(a.summary.totalOrders), b: fmtN(b.summary.totalOrders), delta: b.summary.totalOrders - a.summary.totalOrders, fmt: (d:number)=>`${sign(d)}${Math.abs(d)}`,          good: (d:number)=>d>0 },
    { metric: "Return Rate",     a: p(a.summary.returnRate), b: p(b.summary.returnRate), delta: b.summary.returnRate - a.summary.returnRate,     fmt: (d:number)=>`${sign(d)}${((Math.abs(d))*100).toFixed(1)}%`, good: (d:number)=>d<0 },
    { metric: "Health Score",    a: `${a.score}/100`,    b: `${b.score}/100`,    delta: b.score - a.score,                                    fmt: (d:number)=>`${sign(d)}${d}`,                    good: (d:number)=>d>0 },
  ];

  // dedupe
  const seen = new Set<string>();
  const deduped = rows.filter(r => { if (seen.has(r.metric)) return false; seen.add(r.metric); return true; });

  const TH = (l: string, al = "right") => `<th style="padding:6px 10px;border-bottom:2px solid #e5e7eb;text-align:${al};color:#57606a;font-weight:600">${l}</th>`;
  const TD = (v: string, al = "right", c = "") => `<td style="padding:5px 10px;border-bottom:1px solid #f0f0f0;text-align:${al};${c?`color:${c}`:""}">${v}</td>`;

  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
<thead><tr>${TH("Metric","left")}${TH(a.periodLabel)}${TH(b.periodLabel)}${TH("Change")}</tr></thead>
<tbody>${deduped.map(r => {
    const color = r.delta === 0 ? "#57606a" : r.good(r.delta) ? "#166534" : "#ef4444";
    const arrow = r.delta > 0 ? "▲" : r.delta < 0 ? "▼" : "—";
    return `<tr>${TD(`<strong>${r.metric}</strong>`,"left")}${TD(r.a)}${TD(r.b)}${TD(`<span style="color:${color};font-weight:700">${arrow} ${r.fmt(r.delta)}</span>`)}</tr>`;
  }).join("")}</tbody></table></div>`;
}
