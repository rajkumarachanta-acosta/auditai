// ── Chat Engine — matches questions to pre-computed audit data ──
// LLM only formats; all facts come from auditEngine output

import { AuditResult, Finding, CampaignRow, AsinRow } from "./auditEngine";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ── Intent types ──
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
  | "datainfo"
  | "spend"
  | "revenue"
  | "returns"
  | "ctr"
  | "cvr"
  | "impressions"
  | "topkeywords"
  | "topcampaigns"
  | "brands"
  | "table_campaigns"
  | "table_asins"
  | "compare"
  | "unknown";

// ── Multi-signal intent detection ──
// Each intent has a list of signal patterns; the one with the most matches wins.
// This avoids brittle single-regex matching.
const INTENT_SIGNALS: { intent: Intent; patterns: RegExp[] }[] = [
  {
    intent: "powerpoint",
    patterns: [/powerpoint/i, /pptx/i, /\bppt\b/i, /presentat/i, /slide/i, /export/i, /download.*report/i],
  },
  {
    intent: "waste",
    patterns: [/wast/i, /losing/i, /burn/i, /zero.?sales/i, /no.?sales/i, /bleed/i, /throw.*money/i, /money.*drain/i, /inefficien/i, /bad.*spend/i],
  },
  {
    intent: "score",
    patterns: [/\bscore\b/i, /health/i, /why.*score/i, /what.*score/i, /dragging/i, /improve.*score/i, /grade/i, /rating/i, /\b73\b/i, /\b74\b/i, /\b75\b/i, /how.*good/i],
  },
  {
    intent: "keywords",
    patterns: [/keyword/i, /\bbid\b/i, /\bacos\b/i, /\bctr\b/i, /pause.*keyword/i, /low.?ctr/i, /high.?acos/i, /which.*keyword/i, /best.?keyword/i, /worst.?keyword/i],
  },
  {
    intent: "campaigns",
    patterns: [/campaign/i, /\bbudget\b/i, /overspend/i, /concentration/i, /daily.?budget/i, /camp/i, /ad.?group/i],
  },
  {
    intent: "opportunities",
    patterns: [/opportunit/i, /\bgrow\b/i, /scale/i, /upside/i, /increase.?revenue/i, /potential/i, /unlock/i, /expand/i, /more.?sales/i, /improve.?revenue/i],
  },
  {
    intent: "asins",
    patterns: [/\basin\b/i, /product/i, /cash.?cow/i, /need.*love/i, /reduce.*pause/i, /cohort/i, /item/i, /sku/i, /which.*product/i, /top.?product/i, /best.?product/i],
  },
  {
    intent: "searchterms",
    patterns: [/search.?term/i, /search.?query/i, /negative/i, /wasted.?term/i, /query/i, /what.*people.*search/i, /customer.*search/i],
  },
  {
    intent: "spend",
    patterns: [/\bspend\b/i, /spending/i, /\bcost\b/i, /\bcpc\b/i, /how.?much.*spend/i, /total.?spend/i, /ad.?spend/i, /money.?spend/i],
  },
  {
    intent: "revenue",
    patterns: [/revenue/i, /\bsales\b/i, /\borders\b/i, /how.?much.*sell/i, /total.?sales/i, /how.?much.*mak/i, /earning/i, /income/i],
  },
  {
    intent: "returns",
    patterns: [/return/i, /refund/i, /return.?rate/i, /sent.?back/i, /customer.?return/i],
  },
  {
    intent: "ctr",
    patterns: [/\bctr\b/i, /click.?through/i, /click.?rate/i, /how.?many.*click/i, /click/i],
  },
  {
    intent: "cvr",
    patterns: [/\bcvr\b/i, /convers/i, /conversion.?rate/i, /how.?many.*order/i, /order.?rate/i],
  },
  {
    intent: "impressions",
    patterns: [/impression/i, /\bview\b/i, /\breach\b/i, /page.?view/i, /how.?many.*see/i, /visibility/i, /traffic/i],
  },
  {
    intent: "topkeywords",
    patterns: [/top.?keyword/i, /best.?keyword/i, /performing.?keyword/i, /most.?click/i, /highest.?sales.*keyword/i],
  },
  {
    intent: "topcampaigns",
    patterns: [/top.?campaign/i, /best.?campaign/i, /performing.?campaign/i, /most.?revenue.*campaign/i],
  },
  {
    intent: "brands",
    patterns: [/\bbrand\b/i, /carhartt/i, /wonderwink/i, /which.?brand/i, /brand.?perform/i],
  },
  {
    intent: "table_campaigns",
    patterns: [/table/i, /list.*campaign/i, /all.?campaign/i, /campaign.*list/i, /campaign.*breakdown/i, /show.?me.*campaign/i, /campaign.*detail/i, /campaign.*data/i, /4.?week/i, /weekly/i, /by.?campaign/i],
  },
  {
    intent: "table_asins",
    patterns: [/table/i, /list.*asin/i, /all.?asin/i, /asin.*list/i, /asin.*breakdown/i, /show.?me.*asin/i, /product.*table/i, /product.*list/i, /by.?asin/i, /asin.*detail/i],
  },
  {
    intent: "compare",
    patterns: [/compar/i, /vs\b/i, /versus/i, /week.?over.?week/i, /last.?week/i, /this.?week/i, /period.?a/i, /period.?b/i, /before.*after/i, /chang/i, /trend/i, /4.?week/i, /differ/i, /improve/i],
  },
  {
    intent: "datainfo",
    patterns: [/how.?many.?days/i, /date.?range/i, /time.?period/i, /how.?long/i, /data.?cover/i, /upload/i, /when.*data/i, /days.?of.?data/i, /\brows?\b/i, /file.*load/i, /what.*upload/i, /data.*span/i, /period/i, /how.?much.?data/i, /\bwhen\b.*\bfrom\b/i],
  },
  {
    intent: "summary",
    patterns: [/summary/i, /overview/i, /overall/i, /how.?are.?we/i, /\bstatus\b/i, /snapshot/i, /tell.?me.?about/i, /what.*look.?like/i, /how.*doing/i, /how.*perform/i, /give.?me.?a/i, /show.?me.?a/i, /quick.?look/i, /what.*going.?on/i, /\bhi\b/i, /\bhello\b/i, /\bhey\b/i, /start/i, /begin/i],
  },
];

function detectIntent(q: string): Intent {
  const scores = new Map<Intent, number>();

  for (const { intent, patterns } of INTENT_SIGNALS) {
    let score = 0;
    for (const p of patterns) {
      if (p.test(q)) score++;
    }
    if (score > 0) scores.set(intent, score);
  }

  if (scores.size === 0) return "unknown";

  // Return the intent with the highest signal count
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// ── Formatters ──
function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function severityColor(s: Finding["severity"]): string {
  return { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#6b7280" }[s];
}

function fc(title: string, detail: string, action: string, color = "#ef4444", cls = ""): string {
  return `<div class="fc ${cls}"><div class="fc-title" style="color:${color}">${title}</div><div class="fc-detail">${detail}</div><div class="fc-action">▶ ${action}</div></div>`;
}

// ── HTML table builder ──
const TABLE_STYLE = `style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px"`;
const TH = (label: string, align = "right") =>
  `<th style="padding:5px 8px;border-bottom:2px solid #e5e7eb;text-align:${align};white-space:nowrap;color:#57606a;font-weight:600">${label}</th>`;
const TD = (val: string, align = "right", color = "") =>
  `<td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;text-align:${align};${color ? `color:${color}` : ""}">${val}</td>`;
const acosColor = (acos: number) => acos > 0.6 ? "#ef4444" : acos > 0.35 ? "#f97316" : "#166534";

function campaignTableHtml(rows: CampaignRow[], limit = 20): string {
  const shown = rows.slice(0, limit);
  return `<div style="overflow-x:auto"><table ${TABLE_STYLE}>
<thead><tr>
  ${TH("Campaign", "left")}
  ${TH("Spend")}${TH("Sales")}${TH("ACOS")}${TH("Orders")}${TH("Clicks")}${TH("CTR")}${TH("CVR")}
</tr></thead>
<tbody>
${shown.map(c => `<tr>
  ${TD(`<span style="font-weight:500">${c.name.slice(0, 45)}${c.name.length > 45 ? "…" : ""}</span>`, "left")}
  ${TD(fmt$(c.spend))}
  ${TD(fmt$(c.sales))}
  ${TD(fmtPct(c.acos), "right", acosColor(c.acos))}
  ${TD(c.orders.toLocaleString())}
  ${TD(c.clicks.toLocaleString())}
  ${TD(fmtPct(c.ctr))}
  ${TD(fmtPct(c.cvr))}
</tr>`).join("")}
</tbody>
</table></div>
${rows.length > limit ? `<div style="margin-top:4px;font-size:11px;color:#57606a">Showing top ${limit} of ${rows.length} campaigns by spend</div>` : ""}`;
}

function asinTableHtml(rows: AsinRow[], limit = 25): string {
  const shown = rows.slice(0, limit);
  return `<div style="overflow-x:auto"><table ${TABLE_STYLE}>
<thead><tr>
  ${TH("ASIN", "left")}${TH("Product", "left")}${TH("Brand", "left")}
  ${TH("Revenue")}${TH("Units")}${TH("Page Views")}${TH("Rev/View")}${TH("Return %")}
</tr></thead>
<tbody>
${shown.map(a => `<tr>
  ${TD(`<code style="font-size:11px">${a.asin}</code>`, "left")}
  ${TD(`<span style="font-weight:500">${a.title.slice(0, 40)}${a.title.length > 40 ? "…" : ""}</span>`, "left")}
  ${TD(a.brand, "left")}
  ${TD(fmt$(a.orderedRevenue))}
  ${TD(a.orderedUnits.toLocaleString())}
  ${TD(a.pageViews.toLocaleString())}
  ${TD(`$${a.revenuePerView.toFixed(2)}`)}
  ${TD(fmtPct(a.returnRate), "right", a.returnRate > 0.1 ? "#ef4444" : "")}
</tr>`).join("")}
</tbody>
</table></div>
${rows.length > limit ? `<div style="margin-top:4px;font-size:11px;color:#57606a">Showing top ${limit} of ${rows.length} ASINs by revenue</div>` : ""}`;
}

// ── Period comparison table (two AuditResult objects) ──
export interface PeriodDiff {
  metric: string;
  periodA: string;
  periodB: string;
  delta: string;
  direction: "up" | "down" | "neutral";
  goodWhenUp: boolean;
}

export function buildComparisonTable(a: AuditResult, b: AuditResult): string {
  const p = (n: number) => `${(n * 100).toFixed(1)}%`;
  const f = (n: number) => fmt$(n);

  const rows: PeriodDiff[] = [
    { metric: "Health Score",    periodA: `${a.score}/100`,       periodB: `${b.score}/100`,       delta: `${b.score - a.score > 0 ? "+" : ""}${b.score - a.score}`,                              direction: b.score > a.score ? "up" : b.score < a.score ? "down" : "neutral", goodWhenUp: true },
    { metric: "Total Spend",     periodA: f(a.summary.totalSpend), periodB: f(b.summary.totalSpend), delta: `${b.summary.totalSpend > a.summary.totalSpend ? "+" : ""}${f(b.summary.totalSpend - a.summary.totalSpend)}`, direction: b.summary.totalSpend > a.summary.totalSpend ? "up" : "down", goodWhenUp: false },
    { metric: "Total Sales",     periodA: f(a.summary.totalSales), periodB: f(b.summary.totalSales), delta: `${b.summary.totalSales > a.summary.totalSales ? "+" : ""}${f(b.summary.totalSales - a.summary.totalSales)}`, direction: b.summary.totalSales > a.summary.totalSales ? "up" : "down", goodWhenUp: true },
    { metric: "ACOS",            periodA: p(a.summary.avgAcos),   periodB: p(b.summary.avgAcos),   delta: `${(b.summary.avgAcos - a.summary.avgAcos) > 0 ? "+" : ""}${((b.summary.avgAcos - a.summary.avgAcos) * 100).toFixed(1)}%`, direction: b.summary.avgAcos > a.summary.avgAcos ? "up" : "down", goodWhenUp: false },
    { metric: "CVR",             periodA: p(a.summary.avgCvr),    periodB: p(b.summary.avgCvr),    delta: `${(b.summary.avgCvr - a.summary.avgCvr) > 0 ? "+" : ""}${((b.summary.avgCvr - a.summary.avgCvr) * 100).toFixed(1)}%`, direction: b.summary.avgCvr > a.summary.avgCvr ? "up" : "down", goodWhenUp: true },
    { metric: "CTR",             periodA: p(a.summary.avgCtr),    periodB: p(b.summary.avgCtr),    delta: `${(b.summary.avgCtr - a.summary.avgCtr) > 0 ? "+" : ""}${((b.summary.avgCtr - a.summary.avgCtr) * 100).toFixed(1)}%`, direction: b.summary.avgCtr > a.summary.avgCtr ? "up" : "down", goodWhenUp: true },
    { metric: "Total Waste",     periodA: f(a.totalWaste),        periodB: f(b.totalWaste),        delta: `${b.totalWaste > a.totalWaste ? "+" : ""}${f(b.totalWaste - a.totalWaste)}`,             direction: b.totalWaste > a.totalWaste ? "up" : "down", goodWhenUp: false },
    { metric: "Ordered Revenue", periodA: f(a.summary.totalOrderedRevenue), periodB: f(b.summary.totalOrderedRevenue), delta: `${b.summary.totalOrderedRevenue > a.summary.totalOrderedRevenue ? "+" : ""}${f(b.summary.totalOrderedRevenue - a.summary.totalOrderedRevenue)}`, direction: b.summary.totalOrderedRevenue > a.summary.totalOrderedRevenue ? "up" : "down", goodWhenUp: true },
    { metric: "Return Rate",     periodA: p(a.summary.returnRate), periodB: p(b.summary.returnRate), delta: `${(b.summary.returnRate - a.summary.returnRate) > 0 ? "+" : ""}${((b.summary.returnRate - a.summary.returnRate) * 100).toFixed(1)}%`, direction: b.summary.returnRate > a.summary.returnRate ? "up" : "down", goodWhenUp: false },
  ];

  const dirColor = (r: PeriodDiff) => {
    if (r.direction === "neutral") return "#57606a";
    return (r.direction === "up") === r.goodWhenUp ? "#166534" : "#ef4444";
  };
  const arrow = (r: PeriodDiff) => r.direction === "up" ? "▲" : r.direction === "down" ? "▼" : "—";

  return `<div style="overflow-x:auto"><table ${TABLE_STYLE}>
<thead><tr>
  ${TH("Metric", "left")}
  ${TH(a.periodLabel)}
  ${TH(b.periodLabel)}
  ${TH("Change")}
</tr></thead>
<tbody>
${rows.map(r => `<tr>
  ${TD(`<strong>${r.metric}</strong>`, "left")}
  ${TD(r.periodA)}
  ${TD(r.periodB)}
  ${TD(`<span style="color:${dirColor(r)};font-weight:600">${arrow(r)} ${r.delta}</span>`)}
</tr>`).join("")}
</tbody>
</table></div>`;
}

// ── Build structured context for LLM — includes actual findings ──
export function buildLLMContext(audit: AuditResult, question: string): string {
  const { summary, score, scoreLabel, spendEfficiency, structureQuality, totalWaste, totalOpportunity, topWaste, topOpportunities, findings, asinCohorts } = audit;

  const cows    = asinCohorts.filter(a => a.cohort === "cash_cow").slice(0, 5);
  const loved   = asinCohorts.filter(a => a.cohort === "need_love").slice(0, 5);
  const paused  = asinCohorts.filter(a => a.cohort === "reduce_pause").slice(0, 5);

  return `You are an Amazon advertising analyst. Answer the user's question based ONLY on the data below. Be direct, confident, and specific. Always include dollar amounts and clear next actions. Never guess or fabricate data not shown below.

ACCOUNT SNAPSHOT (${summary.reportingDays}-day period):
- Health Score: ${score}/100 (${scoreLabel})
- Spend Efficiency: ${spendEfficiency}/70 | Structure Quality: ${structureQuality}/30
- Total Ad Spend: ${fmt$(summary.totalSpend)} | Ad-Attributed Sales: ${fmt$(summary.totalSales)}
- Ordered Revenue (Vendor Central): ${fmt$(summary.totalOrderedRevenue)} | Ordered Units: ${summary.totalOrderedUnits.toLocaleString()}
- Avg ACOS: ${fmtPct(summary.avgAcos)} | Avg CVR: ${fmtPct(summary.avgCvr)} | Avg CTR: ${fmtPct(summary.avgCtr)}
- Total Impressions: ${summary.totalImpressions.toLocaleString()} | Total Clicks: ${summary.totalClicks.toLocaleString()} | Total Orders: ${summary.totalOrders.toLocaleString()}
- Campaigns: ${summary.campaignCount} | Keywords: ${summary.keywordCount} | ASINs tracked: ${summary.asinCount}
- Page Views: ${summary.totalPageViews.toLocaleString()} | Return Rate: ${fmtPct(summary.returnRate)}
- Top Brand: ${summary.topBrand}
- Total Waste: ${fmt$(totalWaste)} | Monthly Opportunity Upside: ${fmt$(totalOpportunity)}
- Files loaded: ${audit.hasCampaignData ? "Bulk Campaign ✓" : "No campaign file"} | ${audit.hasSalesData ? "Vendor Central Sales + Traffic ✓" : "No sales file"}

TOP WASTE FINDINGS (${topWaste.length} shown):
${topWaste.slice(0, 8).map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n   Detail: ${f.detail}\n   Impact: ${fmt$(f.impact)} | Action: ${f.action}`).join("\n")}

TOP OPPORTUNITIES (${topOpportunities.length} shown):
${topOpportunities.slice(0, 8).map((f, i) => `${i + 1}. ${f.title}\n   Detail: ${f.detail}\n   Upside: ${fmt$(f.impact * 4)}/month | Action: ${f.action}`).join("\n")}

FINDINGS BREAKDOWN:
- Critical: ${findings.filter(f => f.severity === "critical").length} | High: ${findings.filter(f => f.severity === "high").length} | Medium: ${findings.filter(f => f.severity === "medium").length} | Low: ${findings.filter(f => f.severity === "low").length}
- Waste findings: ${findings.filter(f => f.category === "waste").length} | Opportunity: ${findings.filter(f => f.category === "opportunity").length} | Structure: ${findings.filter(f => f.category === "structure").length}

TOP ASIN COHORTS:
Cash Cows (${asinCohorts.filter(a => a.cohort === "cash_cow").length} total): ${cows.map(a => `${a.asin} (${fmt$(a.orderedRevenue)}, ${a.orderedUnits} units)`).join("; ")}
Need Love (${asinCohorts.filter(a => a.cohort === "need_love").length} total): ${loved.map(a => `${a.asin} (${fmt$(a.orderedRevenue)}, rev/view $${a.revenuePerView.toFixed(2)})`).join("; ")}
Reduce/Pause (${asinCohorts.filter(a => a.cohort === "reduce_pause").length} total): ${paused.map(a => `${a.asin} (${fmt$(a.orderedRevenue)})`).join("; ")}

USER QUESTION: ${question}

Instructions: Answer in 3–6 sentences. Be specific with numbers from the data above. End with 1–2 concrete next actions.`;
}

// ── Local (no-LLM) responses ──
export function buildLocalResponse(audit: AuditResult, intentParam: string, question: string): string {
  const intent = detectIntent(question); // always re-detect from full question for best accuracy
  const { summary, score, scoreLabel, spendEfficiency, structureQuality, totalWaste, totalOpportunity, topWaste, topOpportunities, findings, asinCohorts } = audit;

  switch (intent) {

    case "waste": {
      const lines = topWaste.slice(0, 5).map(f =>
        fc(f.title, f.detail, f.action, severityColor(f.severity))
      ).join("");
      return `Your account is wasting <strong>${fmt$(totalWaste)}</strong> in this ${summary.reportingDays}-day period — that's <strong>${fmt$(totalWaste * 12)}/year</strong> if not addressed:<br>${lines}<br><strong>Total recoverable: ${fmt$(totalWaste)}</strong>`;
    }

    case "score": {
      const draggers = findings.filter(f => f.severity === "critical" || f.severity === "high").slice(0, 3);
      const lines    = draggers.map(f => fc(f.title, f.detail, f.action)).join("");
      const potential = Math.min(27, findings.filter(f => f.severity === "critical").length * 5 + findings.filter(f => f.severity === "high").length * 2);
      return `Your health score is <strong>${score}/100 — ${scoreLabel}</strong>.<br>
        <div class="chip-row">
          <div class="chip-stat ${spendEfficiency < 50 ? 'red' : 'yellow'}"><span>${spendEfficiency}</span>Spend Eff /70</div>
          <div class="chip-stat ${structureQuality < 20 ? 'red' : 'yellow'}"><span>${structureQuality}</span>Structure /30</div>
          <div class="chip-stat red"><span>${findings.filter(f => f.severity === "critical").length}</span>Critical</div>
        </div>
        <strong>What's dragging it:</strong><br>${lines || "<div class='fc'><div class='fc-detail'>No critical issues found — score is limited by structure quality.</div></div>"}
        <strong>Fix critical issues → estimated score: ${Math.min(100, score + potential)}/100</strong>`;
    }

    case "keywords": {
      const kwWaste  = findings.filter(f => f.category === "waste" && f.id.startsWith("kw-"));
      const highAcos = findings.filter(f => f.id.startsWith("kw-acos-"));
      const lowCtr   = findings.filter(f => f.id.startsWith("kw-ctr-"));
      const zeroSales = kwWaste.filter(f => f.id.includes("waste"));
      const lines = kwWaste.slice(0, 5).map(f =>
        fc(f.title, f.detail, f.action)
      ).join("");
      return `Found <strong>${kwWaste.length} keywords</strong> with issues across ${summary.keywordCount} total:<br>
        <div class="chip-row">
          <div class="chip-stat red"><span>${highAcos.length}</span>High ACOS</div>
          <div class="chip-stat yellow"><span>${lowCtr.length}</span>Low CTR</div>
          <div class="chip-stat red"><span>${zeroSales.length}</span>Zero Sales</div>
        </div>
        ${lines || "<div class='fc'><div class='fc-detail'>No critical keyword issues found.</div></div>"}`;
    }

    case "topkeywords": {
      const kwOpp = findings.filter(f => f.category === "opportunity" && f.id.startsWith("kw-")).slice(0, 4);
      const lines = kwOpp.map(f => fc(f.title, f.detail, f.action, "#166534", "opp")).join("");
      return `Top performing keyword opportunities from ${summary.keywordCount} keywords:<br>${lines || "<div class='fc'><div class='fc-detail'>Upload a search term report to identify top-converting terms.</div></div>"}`;
    }

    case "campaigns": {
      const campF  = findings.filter(f => f.id.startsWith("camp-"));
      const lines  = campF.slice(0, 4).map(f =>
        fc(f.title, f.detail, f.action, f.category === "opportunity" ? "#166534" : "#ef4444", f.category === "opportunity" ? "opp" : "")
      ).join("");
      return `<strong>${summary.campaignCount} campaigns</strong> analyzed — ${campF.filter(f => f.severity === "critical").length} critical issues, ${campF.filter(f => f.category === "opportunity").length} opportunities:<br>
        ${lines || "<div class='fc'><div class='fc-detail'>No critical campaign issues detected.</div></div>"}`;
    }

    case "topcampaigns": {
      const campOpp = findings.filter(f => f.category === "opportunity" && f.id.startsWith("camp-")).slice(0, 4);
      const lines   = campOpp.map(f => fc(f.title, f.detail, f.action, "#166534", "opp")).join("");
      return `Top campaign opportunities across ${summary.campaignCount} campaigns:<br>${lines || "<div class='fc'><div class='fc-detail'>No campaign opportunities detected — check for underfunded campaigns.</div></div>"}`;
    }

    case "opportunities": {
      const lines = topOpportunities.slice(0, 5).map(f =>
        fc(f.title, f.detail, f.action, "#166534", "opp")
      ).join("");
      return `Found <strong>${findings.filter(f => f.category === "opportunity").length} growth opportunities</strong> — total upside <strong>${fmt$(totalOpportunity)}/month</strong>:<br>${lines || "<div class='fc opp'><div class='fc-detail'>Upload the bulk campaign file to unlock more opportunities.</div></div>"}`;
    }

    case "asins": {
      const cows   = asinCohorts.filter(a => a.cohort === "cash_cow");
      const love   = asinCohorts.filter(a => a.cohort === "need_love");
      const reduce = asinCohorts.filter(a => a.cohort === "reduce_pause");
      const topCow = cows[0];
      const topLove = love[0];
      return `ASIN cohort analysis across <strong>${asinCohorts.length} ASINs</strong>:
        <div class="chip-row">
          <div class="chip-stat green"><span>${cows.length}</span>Cash Cows</div>
          <div class="chip-stat yellow"><span>${love.length}</span>Need Love</div>
          <div class="chip-stat red"><span>${reduce.length}</span>Reduce/Pause</div>
        </div>
        ${topCow ? fc(`Cash Cow: ${topCow.asin}`, `${topCow.title.slice(0, 60)} · Revenue: ${fmt$(topCow.orderedRevenue)} · ${topCow.orderedUnits.toLocaleString()} units`, "Increase ad budget — this ASIN converts well", "#166534", "opp") : ""}
        ${topLove ? fc(`Needs Love: ${topLove.asin}`, `${topLove.title.slice(0, 60)} · Rev/View: $${topLove.revenuePerView.toFixed(2)} — high demand, underfunded`, "Create a dedicated Sponsored Products campaign", "#92400e", "warn") : ""}`;
    }

    case "searchterms": {
      const stWaste = findings.filter(f => f.id.startsWith("st-waste-"));
      const stOpp   = findings.filter(f => f.id.startsWith("st-opp-") || f.id.startsWith("st-expand-"));
      const lines   = [...stWaste.slice(0, 2), ...stOpp.slice(0, 2)].map(f =>
        fc(f.title, f.detail, f.action, f.category === "opportunity" ? "#166534" : "#ef4444", f.category === "opportunity" ? "opp" : "")
      ).join("");
      return `Search term analysis: <strong>${stWaste.length} wasted terms</strong> · <strong>${stOpp.length} expansion opportunities</strong>:<br>${lines || "<div class='fc'><div class='fc-detail'>Upload a Search Term Report for deeper query-level analysis.</div></div>"}`;
    }

    case "datainfo": {
      const rows = [
        audit.hasCampaignData
          ? fc("Bulk Campaign File", `${summary.campaignCount} campaigns · ${summary.keywordCount} keywords · ${summary.totalImpressions.toLocaleString()} impressions · ${summary.totalClicks.toLocaleString()} clicks`, "Data is loaded and analyzed", "#166534", "opp")
          : "",
        audit.hasSalesData
          ? fc("Vendor Central Sales + Traffic", `${summary.asinCount} ASINs · ${summary.totalOrderedUnits.toLocaleString()} ordered units · ${summary.totalPageViews.toLocaleString()} page views · Return rate ${fmtPct(summary.returnRate)}`, "Data is loaded and analyzed", "#166534", "opp")
          : "",
      ].filter(Boolean).join("");
      return `Your data covers approximately <strong>${summary.reportingDays} days</strong>:<br>
        ${rows}
        <div class="chip-row">
          <div class="chip-stat blue"><span>${summary.campaignCount}</span>Campaigns</div>
          <div class="chip-stat blue"><span>${summary.keywordCount}</span>Keywords</div>
          ${audit.hasSalesData ? `<div class="chip-stat green"><span>${summary.asinCount}</span>ASINs</div>` : ""}
        </div>
        Ad spend: <strong>${fmt$(summary.totalSpend)}</strong> · Ad sales: <strong>${fmt$(summary.totalSales)}</strong>`;
    }

    case "spend": {
      const wasteRatio = (summary.wasteRatio * 100).toFixed(1);
      return `Ad spend breakdown over ${summary.reportingDays} days:
        <div class="chip-row">
          <div class="chip-stat blue"><span>${fmt$(summary.totalSpend)}</span>Total Spend</div>
          <div class="chip-stat red"><span>${fmt$(totalWaste)}</span>Wasted</div>
          <div class="chip-stat green"><span>${fmt$(summary.totalSales)}</span>Sales</div>
        </div>
        ${wasteRatio}% of spend is wasted — <strong>${fmt$(totalWaste)}</strong> going to zero-converting keywords and poor campaigns.<br>
        ${topWaste[0] ? fc(`Biggest waste: ${topWaste[0].title}`, topWaste[0].detail, topWaste[0].action) : ""}
        Average ACOS: <strong>${fmtPct(summary.avgAcos)}</strong> · Avg CPC: <strong>${summary.totalClicks > 0 ? fmt$(summary.totalSpend / summary.totalClicks) : "N/A"}</strong>`;
    }

    case "revenue": {
      return `Revenue overview for ${summary.reportingDays}-day period:
        <div class="chip-row">
          <div class="chip-stat green"><span>${fmt$(summary.totalOrderedRevenue)}</span>Ordered Revenue</div>
          <div class="chip-stat blue"><span>${fmt$(summary.totalSales)}</span>Ad Sales</div>
          <div class="chip-stat blue"><span>${summary.totalOrderedUnits.toLocaleString()}</span>Units Ordered</div>
        </div>
        Ad-attributed sales represent <strong>${summary.totalOrderedRevenue > 0 ? ((summary.totalSales / summary.totalOrderedRevenue) * 100).toFixed(1) : "N/A"}%</strong> of total ordered revenue.<br>
        ACOS: <strong>${fmtPct(summary.avgAcos)}</strong> · CVR: <strong>${fmtPct(summary.avgCvr)}</strong> · Return Rate: <strong>${fmtPct(summary.returnRate)}</strong><br>
        ${topOpportunities[0] ? fc(`Top revenue opportunity: ${topOpportunities[0].title}`, topOpportunities[0].detail, topOpportunities[0].action, "#166534", "opp") : ""}`;
    }

    case "returns": {
      const returnFindings = findings.filter(f => f.id.includes("return")).slice(0, 3);
      const lines = returnFindings.map(f => fc(f.title, f.detail, f.action, "#f97316")).join("");
      return `Return rate analysis:
        <div class="chip-row">
          <div class="chip-stat ${summary.returnRate > 0.1 ? 'red' : summary.returnRate > 0.05 ? 'yellow' : 'green'}"><span>${fmtPct(summary.returnRate)}</span>Return Rate</div>
          <div class="chip-stat blue"><span>${summary.totalOrderedUnits.toLocaleString()}</span>Units Ordered</div>
        </div>
        ${summary.returnRate > 0.1 ? "⚠️ Return rate above 10% — review product listings, images, and descriptions." : summary.returnRate > 0.05 ? "Return rate is moderate — monitor for spikes by ASIN." : "Return rate looks healthy — below 5%."}
        ${lines || ""}`;
    }

    case "ctr": {
      const lowCtrF = findings.filter(f => f.id.startsWith("kw-ctr-")).slice(0, 4);
      const lines   = lowCtrF.map(f => fc(f.title, f.detail, f.action, "#f97316")).join("");
      return `Click-Through Rate (CTR) overview:
        <div class="chip-row">
          <div class="chip-stat ${summary.avgCtr < 0.002 ? 'red' : 'yellow'}"><span>${fmtPct(summary.avgCtr)}</span>Avg CTR</div>
          <div class="chip-stat blue"><span>${summary.totalImpressions.toLocaleString()}</span>Impressions</div>
          <div class="chip-stat blue"><span>${summary.totalClicks.toLocaleString()}</span>Clicks</div>
        </div>
        Amazon benchmark is ~0.35%. Your avg CTR of <strong>${fmtPct(summary.avgCtr)}</strong> is ${summary.avgCtr < 0.002 ? "below benchmark — ads may need better copy or images" : summary.avgCtr < 0.004 ? "near benchmark" : "above benchmark — strong ad relevance"}.<br>
        ${lines.length ? `Low CTR keywords to fix:<br>${lines}` : ""}`;
    }

    case "cvr": {
      return `Conversion Rate (CVR) overview:
        <div class="chip-row">
          <div class="chip-stat ${summary.avgCvr < 0.05 ? 'red' : 'yellow'}"><span>${fmtPct(summary.avgCvr)}</span>Avg CVR</div>
          <div class="chip-stat blue"><span>${summary.totalClicks.toLocaleString()}</span>Clicks</div>
          <div class="chip-stat blue"><span>${summary.totalOrders.toLocaleString()}</span>Orders</div>
        </div>
        Amazon average CVR is ~10–13%. Your CVR of <strong>${fmtPct(summary.avgCvr)}</strong> is ${summary.avgCvr < 0.05 ? "low — check product page content, pricing, and reviews" : summary.avgCvr < 0.10 ? "moderate — room to improve with better listings" : "strong — focus on scaling winning campaigns"}.<br>
        ACOS: <strong>${fmtPct(summary.avgAcos)}</strong> (a higher CVR will lower ACOS). ${topWaste[0] ? `Top action: ${topWaste[0].action}.` : ""}`;
    }

    case "impressions": {
      const impFindings = findings.filter(f => f.id.includes("impression") || f.id.includes("visibility")).slice(0, 3);
      const lines = impFindings.map(f => fc(f.title, f.detail, f.action, "#166534", "opp")).join("");
      return `Impressions & visibility:
        <div class="chip-row">
          <div class="chip-stat blue"><span>${(summary.totalImpressions / 1000).toFixed(0)}K</span>Impressions</div>
          <div class="chip-stat blue"><span>${(summary.totalPageViews / 1000).toFixed(0)}K</span>Page Views</div>
          <div class="chip-stat yellow"><span>${fmtPct(summary.avgCtr)}</span>CTR</div>
        </div>
        ${summary.totalImpressions.toLocaleString()} ad impressions across ${summary.keywordCount} keywords and ${summary.campaignCount} campaigns.<br>
        ${lines || (topOpportunities[0] ? fc(`Grow impressions: ${topOpportunities[0].title}`, topOpportunities[0].detail, topOpportunities[0].action, "#166534", "opp") : "")}`;
    }

    case "brands": {
      const brandCohorts = asinCohorts.slice(0, 6);
      const brandRevMap: Record<string, number> = {};
      asinCohorts.forEach(a => {
        brandRevMap[a.brand] = (brandRevMap[a.brand] ?? 0) + a.orderedRevenue;
      });
      const sortedBrands = Object.entries(brandRevMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const lines = sortedBrands.map(([brand, rev]) =>
        `<div class="fc opp"><div class="fc-title">${brand}</div><div class="fc-detail">Ordered Revenue: ${fmt$(rev)}</div></div>`
      ).join("");
      return `Brand performance — top brand: <strong>${summary.topBrand}</strong>:<br>${lines || "<div class='fc'><div class='fc-detail'>Upload Vendor Central sales data to see brand breakdown.</div></div>"}`;
    }

    case "summary": {
      return `Account snapshot — ${summary.reportingDays}-day period:
        <div class="chip-row">
          <div class="chip-stat ${score < 65 ? 'red' : score < 80 ? 'yellow' : 'green'}"><span>${score}</span>Health Score</div>
          ${totalWaste > 0 ? `<div class="chip-stat red"><span>${fmt$(totalWaste)}</span>Total Waste</div>` : ""}
          ${summary.totalOrderedRevenue > 0 ? `<div class="chip-stat green"><span>${fmt$(summary.totalOrderedRevenue)}</span>Revenue</div>` : ""}
          <div class="chip-stat ${findings.filter(f => f.severity === "critical").length > 0 ? 'red' : 'green'}"><span>${findings.filter(f => f.severity === "critical").length}</span>Critical</div>
        </div>
        <strong>${summary.campaignCount} campaigns</strong> · ${summary.keywordCount} keywords · ${summary.asinCount} ASINs · ${summary.totalImpressions.toLocaleString()} impressions<br>
        ${summary.totalSpend > 0 ? `ACOS: <strong>${fmtPct(summary.avgAcos)}</strong> · CVR: <strong>${fmtPct(summary.avgCvr)}</strong> · CTR: <strong>${fmtPct(summary.avgCtr)}</strong><br>` : ""}
        ${summary.totalOrderedRevenue > 0 ? `Revenue: <strong>${fmt$(summary.totalOrderedRevenue)}</strong> · Units: <strong>${summary.totalOrderedUnits.toLocaleString()}</strong> · Returns: <strong>${fmtPct(summary.returnRate)}</strong><br>` : ""}
        <strong>Top priority:</strong> ${topWaste[0] ? `${topWaste[0].title} — ${topWaste[0].action}` : "No critical issues found."}`;
    }

    case "table_campaigns": {
      if (!audit.campaignTable.length) {
        return `<div class="fc"><div class="fc-detail">No campaign data loaded. Upload a bulk campaign file to see the campaign breakdown table.</div></div>`;
      }
      return `Campaign breakdown — <strong>${audit.campaignTable.length} campaigns</strong> sorted by spend:<br>${campaignTableHtml(audit.campaignTable)}`;
    }

    case "table_asins": {
      if (!audit.asinTable.length) {
        return `<div class="fc opp"><div class="fc-detail">No Vendor Central data loaded. Upload Sales and Traffic files to see the ASIN breakdown table.</div></div>`;
      }
      return `ASIN breakdown — <strong>${audit.asinTable.length} ASINs</strong> sorted by revenue:<br>${asinTableHtml(audit.asinTable)}`;
    }

    case "compare": {
      // Single-period: explain what comparison requires
      return `<div class="fc">
        <div class="fc-title" style="color:#3b82d4">Period Comparison — upload 2 files to compare</div>
        <div class="fc-detail">
          To compare week-over-week or period-over-period:<br>
          1. Upload your <strong>current period</strong> bulk file → run the audit<br>
          2. Use the <strong>"Compare Period"</strong> button (coming in next upload) to upload a <strong>second file</strong><br>
          3. The app will show a side-by-side table of all key metrics with ▲▼ change indicators
        </div>
        <div class="fc-action">▶ For now, here's the current period breakdown:</div>
      </div>
      ${audit.campaignTable.length ? campaignTableHtml(audit.campaignTable, 10) : ""}`;
    }

    case "powerpoint":
      return `__POWERPOINT__`;

    default: {
      // Unknown intent — return a useful summary rather than a dead-end
      return `Here's a quick look at your account:<br>
        <div class="chip-row">
          <div class="chip-stat ${score < 65 ? 'red' : score < 80 ? 'yellow' : 'green'}"><span>${score}</span>Health Score</div>
          <div class="chip-stat red"><span>${fmt$(totalWaste)}</span>Waste</div>
          <div class="chip-stat green"><span>${fmt$(totalOpportunity)}</span>Opp/mo</div>
        </div>
        ${topWaste[0] ? `Top issue: <strong>${topWaste[0].title}</strong> — ${topWaste[0].action}<br>` : ""}
        Ask me: <em>"Show waste"</em> · <em>"Keyword issues"</em> · <em>"Growth opportunities"</em> · <em>"ASIN analysis"</em> · <em>"Why this score?"</em> · <em>"How many days of data?"</em>`;
    }
  }
}

export function getIntent(question: string): Intent {
  return detectIntent(question);
}
