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
