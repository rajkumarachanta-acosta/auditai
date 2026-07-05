// ── Compute Engine ──────────────────────────────────────────────────────────
// ALL calculations happen here — locally, zero tokens consumed.
// Output is a structured ComputedAnswer that GPT only needs to FORMAT into
// natural language. GPT never sees raw data — only pre-computed facts.
//
// Handles simple → complex queries:
//   "what is my ACOS?"
//   "top 10 products wasting budget"
//   "campaigns with high ACOS and low CVR"
//   "which ASINs have high returns and are still being advertised?"
//   "compare my best and worst campaigns"
//   "what should I do first to improve my score?"
// ────────────────────────────────────────────────────────────────────────────

import { AuditResult, AsinRow, CampaignRow, KeywordRow, SearchTermRow } from "./auditEngine";

// ── What the compute engine returns ──
export interface ComputedAnswer {
  intent: string;           // e.g. "top_waste_campaigns", "asin_high_return_high_cvr"
  headline: string;         // e.g. "3 campaigns wasting $4,200 with zero sales"
  facts: string[];          // bullet facts GPT will weave into response
  data: DataTable | null;   // optional ranked table
  nextSteps: string[];      // computed action items (GPT enriches language)
  hasData: boolean;
}

export interface DataTable {
  columns: string[];
  rows: (string | number)[][];
  csvReady: boolean;
}

// ── Safe division — never produces NaN/Infinity (fixes B1) ──
const safeDiv = (a: number, b: number, fallback = 0): number =>
  b > 0 && Number.isFinite(a) && Number.isFinite(b) ? a / b : fallback;

// ── NaN-proof formatters (fixes B1) ──
const f$ = (n: number): string => {
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  return abs >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M`
       : abs >= 1_000     ? `$${(n/1_000).toFixed(1)}K`
       : `$${n.toFixed(2)}`;
};
const fp = (n: number): string => Number.isFinite(n) ? `${(n * 100).toFixed(2)}%` : "0.00%";
const fn = (n: number): string => Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";

// ── Extract "top N" — only when a ranking word is present (fixes B8) ──
function extractN(q: string, def = 10): number {
  const m = q.match(/\b(?:top|bottom|worst|best|first|show|list|give\s+me)\s+(\d{1,3})\b/i);
  if (m) return Math.min(parseInt(m[1], 10), 100);
  const m2 = q.match(/\b(?:top|bottom|worst|best)\s*(\d{1,3})\b/i);
  return m2 ? Math.min(parseInt(m2[1], 10), 100) : def;
}

// ── Signal scoring ──
function score(q: string, patterns: RegExp[]): number {
  return patterns.reduce((s, p) => s + (p.test(q) ? 1 : 0), 0);
}

// ── Main compute function ──
export function computeAnswer(audit: AuditResult, question: string): ComputedAnswer {
  const q = question.toLowerCase().trim();
  const limit = extractN(q);

  // ── 1. GREETING ──────────────────────────────────────────────────────────────
  if (/^(hi|hello|hey|yo|sup|what is your name|who are you|what are you|what can you do|help\b)/i.test(q)) {
    const { summary, score: sc, scoreLabel, totalWaste } = audit;
    return {
      intent: "greeting",
      headline: `I'm AuditAI — your Amazon advertising expert`,
      facts: [
        `Account analyzed: ${summary.campaignCount} campaigns, ${summary.keywordCount} keywords, ${summary.asinCount} ASINs`,
        `Health score: ${sc}/100 (${scoreLabel})`,
        `Identified waste: $${totalWaste.toFixed(0)} recoverable`,
        `Ask me about campaigns, keywords, ASINs, search terms, spend, ACOS, CVR, CTR, returns, TACOS, match types, negatives, harvest list, or get a full action plan`,
      ],
      data: null,
      nextSteps: [
        `Try: "What should I fix first?"`,
        `Try: "Which keywords are killing my ACOS?"`,
        `Try: "Show me my harvest list"`,
        `Try: "Which campaigns should I pause today?"`,
      ],
      hasData: true,
    };
  }

  // ── 2. POWERPOINT ─────────────────────────────────────────────────────────────
  if (/powerpoint|pptx|\bslide|\bdeck\b|presentat|export.*ppt|ppt.*export/i.test(q)) {
    return { intent: "powerpoint", headline: "PowerPoint export", facts: [], data: null, nextSteps: [], hasData: false };
  }

  // ── 3. SPECIFIC ENTITY LOOKUP — user mentions a specific ASIN, campaign, or keyword name ──
  // e.g. "what's going on with B0D511BPK2", "tell me about the dickies campaign"
  const asinMatch = q.match(/\b(b0[a-z0-9]{8}|b[0-9][a-z0-9]{8})\b/i);
  if (asinMatch) {
    const asin = asinMatch[1].toUpperCase();
    return computeSpecificAsin(audit, asin, q);
  }

  // ── 4. WEIGHTED INTENT SCORING ────────────────────────────────────────────────
  // Each intent has patterns with individual weights. Highest weighted score wins.
  // This replaces the flat regex counting with a priority-aware system.

  const W = (patterns: [RegExp, number][]): number =>
    patterns.reduce((s, [p, w]) => s + (p.test(q) ? w : 0), 0);

  const intents = {
    // ── Meta ──
    priority:       W([[/what.*should.*i.*(do|fix|change|prioriti|start)/i,10],[/what.*first/i,10],[/quick.*win/i,9],[/biggest.*problem/i,9],[/most.*import/i,8],[/where.*start/i,8],[/top.*action/i,7],[/\bpriority\b/i,6],[/kill.*list/i,8],[/pause.*list/i,8],[/what.*kill.*(today|now)/i,10]]),
    summary:        W([[/\boverview\b/i,8],[/\bsummary\b/i,8],[/\bsnapshot\b/i,8],[/how.*\b(doing|healthy|performing)\b/i,8],[/\boverall\b/i,6],[/\bstatus\b/i,6],[/tl;?dr/i,9],[/health.*check/i,9],[/account.*performance/i,8],[/give.*overview/i,8]]),
    datainfo:       W([[/how many days/i,9],[/date range/i,9],[/reporting period/i,9],[/what data/i,8],[/what.*upload/i,8],[/which report/i,8],[/how long/i,6]]),
    scoreAnalysis:  W([[/\bscore\b/i,7],[/health.*score/i,9],[/why.*\b(low|bad|poor)\b/i,7],[/improve.*score/i,9],[/\bgrade\b/i,7],[/dragging.*score/i,9],[/redesign.*score/i,9],[/recalculate.*score/i,9],[/update.*score/i,9],[/what.*score.*mean/i,8]]),

    // ── Waste / Kill ──
    killList:       W([[/kill.*list/i,12],[/pause.*list/i,12],[/what.*pause.*(today|now|immediately)/i,12],[/what.*shut.*down/i,11],[/campaigns.*to.*pause/i,11],[/should.*i.*pause/i,10],[/which.*pause/i,9],[/what.*kill/i,10]]),
    zeroConversion: W([[/(zero|no)\s*(convers|order)/i,10],[/spend.*no.*sale/i,10],[/no.*sales.*spend/i,10],[/ad.*spend.*no.*order/i,10],[/paying.*nothing/i,10],[/dead.*spend/i,10],[/burn.*no.*conver/i,9],[/wast.*ad.*spend/i,8],[/bleed.*budget/i,8]]),
    wasteOverall:   W([[/\bwaste\b/i,8],[/\bburn(ing)?\b/i,7],[/\bbleed(ing)?\b/i,7],[/money.*drain/i,9],[/losing.*money/i,8],[/inefficien/i,7],[/where.*money.*going/i,10],[/where.*budget.*going/i,10],[/hemorrhag/i,8]]),

    // ── ACOS / Efficiency ──
    highAcos:       W([[/high.*acos/i,9],[/acos.*high/i,9],[/acos.*above/i,8],[/acos.*over/i,8],[/\bacos\b/i,6],[/\btacos\b/i,7],[/total.*acos/i,9],[/blended.*acos/i,9],[/overspend/i,6],[/too.*expensive/i,7],[/killing.*acos/i,10],[/acos.*killing/i,10],[/what.*acos/i,7]]),

    // ── CVR ──
    lowCvr:         W([[/low.*cvr/i,9],[/cvr.*low/i,9],[/poor.*convers/i,8],[/not.*convert/i,8],[/bad.*convers/i,8],[/click.*no.*buy/i,10],[/getting.*click.*not.*order/i,10],[/click.*not.*convert/i,10],[/weak.*convers/i,8]]),
    highCvr:        W([[/high.*cvr/i,9],[/cvr.*high/i,9],[/best.*convers/i,8],[/top.*convers/i,8],[/convert.*well/i,8],[/converting.*well/i,8],[/best.*performing/i,7],[/winning.*product/i,8],[/cash.*cow/i,8],[/scale.*product/i,8]]),

    // ── Returns ──
    highReturn:     W([[/high.*return/i,9],[/return.*rate/i,9],[/return.*problem/i,9],[/\brefund/i,8],[/sent.*back/i,8],[/coming.*back/i,7],[/return.*issue/i,9],[/too.*many.*return/i,10],[/return.*killing/i,10]]),

    // ── Keywords / Bids ──
    keywords:       W([[/\bkeyword/i,8],[/\bbid\b/i,7],[/\bbids\b/i,7],[/match.*type/i,9],[/\bexact\b.*match/i,9],[/\bbroad\b.*match/i,9],[/\bphrase\b.*match/i,9],[/\bnegative/i,9],[/bid.*strategy/i,9],[/\bkw\b/i,7],[/under.*bid/i,9],[/overbid/i,9],[/raise.*bid/i,8],[/lower.*bid/i,8],[/bid.*headroom/i,10],[/bid.*too.*low/i,9],[/bid.*too.*high/i,9]]),
    negatives:      W([[/\bnegative/i,10],[/add.*negative/i,11],[/negative.*keyword/i,11],[/block.*keyword/i,10],[/irrelevant.*search/i,10],[/negative.*gap/i,11],[/missing.*negative/i,11]]),
    matchType:      W([[/match.*type/i,10],[/match.*strateg/i,10],[/broad.*vs.*exact/i,11],[/exact.*vs.*broad/i,11],[/phrase.*match/i,9],[/broad.*match/i,9],[/match.*mix/i,10],[/match.*breakdown/i,10]]),

    // ── Search Terms ──
    searchTerms:    W([[/search.*term/i,10],[/customer.*quer/i,10],[/actual.*quer/i,10],[/search.*quer/i,9],[/what.*customer.*search/i,10],[/customer.*search/i,9],[/harvest.*list/i,11],[/harvest.*term/i,11],[/promote.*term/i,9],[/term.*to.*keyword/i,10]]),

    // ── Placement / Visibility ──
    placement:      W([[/placement/i,10],[/top.*of.*search/i,11],[/tos\b/i,10],[/rest.*of.*search/i,10],[/product.*page.*placement/i,10],[/where.*ad.*show/i,9],[/above.*fold/i,9]]),

    // ── CTR ──
    ctr:            W([[/\bctr\b/i,9],[/click.*through/i,9],[/click.*rate/i,8],[/not.*getting.*click/i,10],[/low.*click/i,8],[/click.*problem/i,9],[/impression.*no.*click/i,10]]),

    // ── Impressions / Visibility ──
    impressions:    W([[/impression/i,8],[/visibility/i,8],[/\breach\b/i,7],[/not.*showing/i,9],[/not.*seen/i,9],[/impression.*share/i,10],[/page.*view/i,7],[/not.*getting.*impression/i,10]]),

    // ── Revenue / Spend ──
    revenue:        W([[/\brevenue\b/i,8],[/total.*sales/i,7],[/ordered.*revenue/i,9],[/how.*much.*making/i,9],[/gross.*sales/i,8],[/earning/i,7],[/income/i,6]]),
    spend:          W([[/total.*spend/i,8],[/ad.*budget/i,8],[/how.*much.*spending/i,9],[/\bcpc\b/i,9],[/cost.*per.*click/i,9],[/daily.*budget/i,8]]),

    // ── TACOS ──
    tacos:          W([[/\btacos\b/i,12],[/total.*acos/i,11],[/blended.*acos/i,11],[/organic.*ratio/i,10],[/ad.*vs.*organic/i,10],[/advertising.*cost.*total/i,10]]),

    // ── Brand ──
    brands:         W([[/by.*brand/i,9],[/brand.*breakdown/i,9],[/brand.*performance/i,9],[/per.*brand/i,9],[/brand.*revenue/i,8]]),
    brandedKw:      W([[/branded.*keyword/i,11],[/brand.*defense/i,11],[/brand.*campaign/i,10],[/protect.*brand/i,10],[/competitor.*keyword/i,10],[/conquesting/i,11],[/branded.*vs.*non/i,11],[/non.*brand/i,9]]),

    // ── ASIN-level ──
    asinOverview:   W([[/\basin.*overview/i,9],[/\basin.*list/i,8],[/all.*asin/i,8],[/my.*product/i,6],[/product.*list/i,7]]),
    newVsMature:    W([[/new.*asin/i,10],[/new.*product/i,9],[/launch/i,8],[/ramp.*up/i,9],[/mature.*asin/i,10],[/established.*product/i,9]]),

    // ── Campaign-level ──
    campaigns:      W([[/campaign/i,7],[/ad.*group/i,7]]),

    // ── Opportunities ──
    opportunities:  W([[/opportunit/i,8],[/\bgrow\b/i,7],[/\bscale\b/i,8],[/\bupside\b/i,9],[/potential/i,7],[/where.*win/i,9],[/room.*grow/i,9],[/increase.*sales/i,8],[/expand/i,6]]),

    // ── Compare ──
    compare:        W([[/compar/i,8],[/\bvs\b/i,8],[/versus/i,8],[/best.*vs.*worst/i,10],[/side.*by.*side/i,9],[/differ/i,7],[/best.*and.*worst/i,9]]),
  };

  // ── 5. ENTITY-FOCUS DETECTION ────────────────────────────────────────────────
  const isSearchTermFocus = intents.searchTerms >= 9;
  const isNegativeFocus   = intents.negatives   >= 9;
  const isMatchTypeFocus  = intents.matchType   >= 9;
  const isKeywordFocus    = !isSearchTermFocus && !isNegativeFocus && !isMatchTypeFocus &&
                            (intents.keywords >= 6);
  const isCampaignFocus   = !isSearchTermFocus && !isKeywordFocus &&
                            (intents.campaigns >= 6 || (intents.asinOverview === 0 && (intents.highAcos >= 6 || intents.wasteOverall >= 6 || intents.ctr >= 6)));
  const isAsinFocus       = !isKeywordFocus && !isSearchTermFocus &&
                            (intents.asinOverview >= 6 || intents.highReturn >= 6 || (intents.revenue >= 6 && intents.campaigns < 6));

  // ── 6. SORTED INTENTS ────────────────────────────────────────────────────────
  const sorted = Object.entries(intents).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const second = sorted[1];

  // ── 7. HIGH-SPECIFICITY ROUTES (always win) ──────────────────────────────────

  if (intents.tacos >= 10) return computeTacos(audit);
  if (intents.killList >= 10) return computeKillList(audit, limit);
  if (isNegativeFocus) return computeNegativeGaps(audit, limit);
  if (isMatchTypeFocus) return computeMatchTypeBreakdown(audit);
  if (intents.brandedKw >= 9) return computeBrandedKeywords(audit, limit);
  if (intents.placement >= 9) return computePlacement(audit);

  if (isSearchTermFocus) return computeSearchTerms(audit, q, limit);

  if (intents.zeroConversion >= 8) {
    if (isKeywordFocus) return computeZeroConversionKeywords(audit, q, limit);
    if (isCampaignFocus) return computeZeroConversionCampaigns(audit, limit);
    return computeZeroConversionAsins(audit, limit);
  }

  if (isKeywordFocus) return computeKeywords(audit, q, limit);

  // ── 8. PRIORITY / SUMMARY ────────────────────────────────────────────────────
  if (intents.priority >= 8) return computePriority(audit);
  if (intents.summary >= 7 && intents.priority < 5) return computeSummary(audit);

  // ── 9. COMPLEX MULTI-FILTER ──────────────────────────────────────────────────
  const s = { // legacy format for complex query functions
    highReturn: intents.highReturn, highCvr: intents.highCvr,
    lowCvr: intents.lowCvr, highAcos: intents.highAcos,
    waste: intents.wasteOverall, campaigns: intents.campaigns,
    ctr: intents.ctr, asins: intents.asinOverview,
  };
  const isComplexFilter = (s.highReturn >= 6 && s.highCvr >= 6) ||
                          (s.highAcos >= 6 && s.lowCvr >= 6) ||
                          (s.lowCvr >= 6 && s.highReturn >= 6);

  if (isComplexFilter && isAsinFocus) return computeComplexAsinQuery(audit, q, limit, s);
  if (isComplexFilter && isCampaignFocus) return computeComplexCampaignQuery(audit, q, limit, s);

  // ── 10. SINGLE-TOPIC ROUTING ─────────────────────────────────────────────────
  if (top[1] === 0) return computeSummary(audit);

  let result: ComputedAnswer;
  switch (top[0]) {
    case "killList":       result = computeKillList(audit, limit); break;
    case "zeroConversion": result = computeZeroConversionAsins(audit, limit); break;
    case "wasteOverall":   result = isCampaignFocus ? computeWasteCampaigns(audit, limit) : computeWasteOverall(audit); break;
    case "highAcos":       result = isCampaignFocus ? computeHighAcosCampaigns(audit, limit) : computeHighAcosAsins(audit, limit); break;
    case "lowCvr":         result = isCampaignFocus ? computeLowCvrCampaigns(audit, limit) : computeLowCvrAsins(audit, limit); break;
    case "highCvr":        result = isCampaignFocus ? computeHighCvrCampaigns(audit, limit) : computeHighCvrAsins(audit, limit); break;
    case "highReturn":     result = computeHighReturnAsins(audit, limit); break;
    case "campaigns":      result = computeCampaignOverview(audit, limit); break;
    case "asinOverview":   result = computeAsinOverview(audit, limit); break;
    case "keywords":       result = computeKeywords(audit, q, limit); break;
    case "negatives":      result = computeNegativeGaps(audit, limit); break;
    case "matchType":      result = computeMatchTypeBreakdown(audit); break;
    case "searchTerms":    result = computeSearchTerms(audit, q, limit); break;
    case "tacos":          result = computeTacos(audit); break;
    case "brandedKw":      result = computeBrandedKeywords(audit, limit); break;
    case "placement":      result = computePlacement(audit); break;
    case "scoreAnalysis":  result = computeScoreAnalysis(audit); break;
    case "opportunities":  result = computeOpportunities(audit, limit); break;
    case "revenue":        result = computeRevenue(audit); break;
    case "spend":          result = computeSpend(audit); break;
    case "highReturn":     result = computeHighReturnAsins(audit, limit); break;
    case "returns":        result = computeReturns(audit, limit); break;
    case "ctr":            result = computeCtr(audit, limit); break;
    case "impressions":    result = computeImpressions(audit); break;
    case "brands":         result = computeBrands(audit); break;
    case "brandedKw":      result = computeBrandedKeywords(audit, limit); break;
    case "compare":        result = computeCompare(audit); break;
    case "datainfo":       result = computeDataInfo(audit); break;
    case "priority":       result = computePriority(audit); break;
    case "summary":
    default:               result = computeSummary(audit); break;
  }

  // ── 11. SECONDARY INTENT: if question also mentions score, merge context ──────
  if (top[0] !== "scoreAnalysis" && intents.scoreAnalysis >= 6) {
    const scoreCtx = computeScoreAnalysis(audit);
    result = {
      ...result,
      facts: [...result.facts, `--- Score context ---`, ...scoreCtx.facts],
      nextSteps: [...result.nextSteps, ...scoreCtx.nextSteps],
    };
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPUTE FUNCTIONS — each returns a ComputedAnswer with pre-calculated facts
// ══════════════════════════════════════════════════════════════════════════════

function computeWasteOverall(audit: AuditResult): ComputedAnswer {
  const { totalWaste, topWaste, summary, findings } = audit;
  const wasteFindings = findings.filter(f => f.category === "waste").sort((a,b) => b.impact - a.impact);
  const criticalWaste = wasteFindings.filter(f => f.severity === "critical");
  const zeroSalCamps  = audit.campaignTable.filter(c => c.spend > 0 && c.sales === 0);
  const highAcosCamps = audit.campaignTable.filter(c => c.acos > 0.5 && c.sales > 0);

  return {
    intent: "waste_overall",
    headline: `${f$(totalWaste)} wasted this period — ${f$(totalWaste * 12)} annualized`,
    facts: [
      `Total waste: ${f$(totalWaste)} over ${summary.reportingDays} days`,
      `Waste ratio: ${fp(summary.wasteRatio)} of total ad spend`,
      `${criticalWaste.length} critical waste issues, ${wasteFindings.length} total`,
      `${zeroSalCamps.length} campaigns spending with zero sales — ${f$(zeroSalCamps.reduce((s,c)=>s+c.spend,0))} wasted`,
      `${highAcosCamps.length} campaigns above 50% ACOS — inefficient spend`,
      topWaste[0] ? `Biggest single waste: ${topWaste[0].title} — ${f$(topWaste[0].impact)} impact` : "",
      topWaste[1] ? `Second biggest: ${topWaste[1].title} — ${f$(topWaste[1].impact)} impact` : "",
    ].filter(Boolean),
    data: topWaste.length ? {
      columns: ["#", "Issue", "Impact", "Severity", "Action"],
      rows: topWaste.slice(0, 8).map((f, i) => [i+1, f.title, f$(f.impact), f.severity.toUpperCase(), f.action]),
      csvReady: true,
    } : null,
    nextSteps: [
      zeroSalCamps.length > 0 ? `Pause ${zeroSalCamps.length} zero-sales campaigns immediately — recover ${f$(zeroSalCamps.reduce((s,c)=>s+c.spend,0))}` : "",
      highAcosCamps.length > 0 ? `Reduce bids 20-30% in ${highAcosCamps.length} high-ACOS campaigns` : "",
      `Review top waste finding: ${topWaste[0]?.action ?? "No critical issues"}`,
    ].filter(Boolean),
    hasData: true,
  };
}

function computeWasteCampaigns(audit: AuditResult, limit: number): ComputedAnswer {
  const zero    = audit.campaignTable.filter(c => c.spend > 0 && c.sales === 0).sort((a,b) => b.spend - a.spend);
  const highA   = audit.campaignTable.filter(c => c.acos > 0.5 && c.sales > 0).sort((a,b) => b.acos - a.acos);
  const allWaste = [...zero, ...highA.filter(c => !zero.find(z => z.name === c.name))].slice(0, limit);
  const totalW  = allWaste.reduce((s,c) => s + (c.sales === 0 ? c.spend : c.spend - c.sales * 0.4), 0);

  return {
    intent: "waste_campaigns",
    headline: `${allWaste.length} campaigns wasting ${f$(totalW)} — ${zero.length} with zero sales, ${highA.length} with high ACOS`,
    facts: [
      `${zero.length} campaigns have spent ${f$(zero.reduce((s,c)=>s+c.spend,0))} with zero sales`,
      `${highA.length} campaigns running above 50% ACOS`,
      `Total recoverable waste: ${f$(totalW)}`,
      zero[0] ? `Worst offender: "${zero[0].name}" — ${f$(zero[0].spend)} spent, $0 sales` : "",
      highA[0] ? `Highest ACOS: "${highA[0].name}" at ${fp(highA[0].acos)}` : "",
    ].filter(Boolean),
    data: {
      columns: ["#", "Campaign", "Spend", "Sales", "ACOS", "Issue"],
      rows: allWaste.map((c, i) => [i+1, c.name.slice(0,45), f$(c.spend), f$(c.sales), fp(c.acos), c.sales === 0 ? "Zero Sales" : "High ACOS"]),
      csvReady: true,
    },
    nextSteps: [
      zero.length > 0 ? `Pause ${zero.length} zero-sales campaigns — ${f$(zero.reduce((s,c)=>s+c.spend,0))} immediately recoverable` : "",
      highA.length > 0 ? `Reduce bids 25% in top ${Math.min(5, highA.length)} high-ACOS campaigns` : "",
      `Reallocate saved budget to top-performing campaigns`,
    ].filter(Boolean),
    hasData: true,
  };
}

function computeHighAcosCampaigns(audit: AuditResult, limit: number): ComputedAnswer {
  const q      = audit.campaignTable.filter(c => c.acos > 0.5 && c.sales > 0).sort((a,b) => b.acos - a.acos).slice(0, limit);
  const avgAcos = q.length ? q.reduce((s,c)=>s+c.acos,0)/q.length : 0;

  return {
    intent: "high_acos_campaigns",
    headline: `${q.length} campaigns above 50% ACOS — avg ${fp(avgAcos)} among these`,
    facts: [
      `Account avg ACOS: ${fp(audit.summary.avgAcos)}`,
      `${q.length} campaigns above 50% ACOS threshold`,
      `Total spend in high-ACOS campaigns: ${f$(q.reduce((s,c)=>s+c.spend,0))}`,
      q[0] ? `Highest ACOS: "${q[0].name}" at ${fp(q[0].acos)} — spend ${f$(q[0].spend)}, sales ${f$(q[0].sales)}` : "",
      q[1] ? `Second: "${q[1].name}" at ${fp(q[1].acos)}` : "",
    ].filter(Boolean),
    data: {
      columns: ["#", "Campaign", "ACOS", "Spend", "Sales", "Orders", "CVR"],
      rows: q.map((c, i) => [i+1, c.name.slice(0,45), fp(c.acos), f$(c.spend), f$(c.sales), fn(c.orders), fp(c.cvr)]),
      csvReady: true,
    },
    nextSteps: [
      q.length > 0 ? `Reduce keyword bids by ${Math.round((1 - 0.35/avgAcos)*100)}% in top ACOS campaigns to hit 35% target` : "",
      `Add negative keywords to reduce irrelevant traffic in these campaigns`,
      `Review search term reports for these campaigns — likely wasting on irrelevant queries`,
    ].filter(Boolean),
    hasData: q.length > 0,
  };
}

function computeHighAcosAsins(audit: AuditResult, limit: number): ComputedAnswer {
  const q = audit.asinTable.filter(a => a.acos > 0.5 && a.adSpend > 0).sort((a,b) => b.acos - a.acos).slice(0, limit);

  return {
    intent: "high_acos_asins",
    headline: `${q.length} ASINs with ACOS above 50%`,
    facts: [
      `${q.length} ASINs running at over 50% ACOS`,
      `Total ad spend on these ASINs: ${f$(q.reduce((s,a)=>s+a.adSpend,0))}`,
      q[0] ? `Worst: ${q[0].asin} "${q[0].title.slice(0,40)}" at ${fp(q[0].acos)}` : "",
    ].filter(Boolean),
    data: {
      columns: ["#", "ASIN", "Product", "ACOS", "Ad Spend", "Ad Sales", "CVR", "Return %"],
      rows: q.map((a, i) => [i+1, a.asin, a.title.slice(0,35), fp(a.acos), f$(a.adSpend), f$(a.adSales), fp(a.cvr), fp(a.returnRate)]),
      csvReady: true,
    },
    nextSteps: [
      `Reduce bids on high-ACOS ASINs or pause if CVR is also low`,
      `Check product listings for these ASINs — poor relevance may be causing expensive clicks`,
      `Consider tightening to exact-match keywords only for these ASINs`,
    ],
    hasData: q.length > 0,
  };
}

function computeLowCvrCampaigns(audit: AuditResult, limit: number): ComputedAnswer {
  const q = audit.campaignTable.filter(c => c.cvr > 0 && c.cvr < 0.05 && c.clicks > 30).sort((a,b) => a.cvr - b.cvr).slice(0, limit);

  return {
    intent: "low_cvr_campaigns",
    headline: `${q.length} campaigns with low CVR (under 5%) — clicks not converting`,
    facts: [
      `Account avg CVR: ${fp(audit.summary.avgCvr)}`,
      `${q.length} campaigns below 5% CVR with 30+ clicks`,
      `Total clicks wasted on low-CVR campaigns: ${fn(q.reduce((s,c)=>s+c.clicks,0))}`,
      q[0] ? `Lowest: "${q[0].name}" at ${fp(q[0].cvr)} CVR — ${fn(q[0].clicks)} clicks, ${q[0].orders} orders` : "",
    ].filter(Boolean),
    data: {
      columns: ["#", "Campaign", "CVR", "Clicks", "Orders", "Spend", "ACOS"],
      rows: q.map((c, i) => [i+1, c.name.slice(0,45), fp(c.cvr), fn(c.clicks), fn(c.orders), f$(c.spend), fp(c.acos)]),
      csvReady: true,
    },
    nextSteps: [
      `Review product listings for low-CVR campaigns — images, price, reviews`,
      `Check if keywords are relevant to the actual product being advertised`,
      `A/B test main image and title for ASINs in these campaigns`,
    ],
    hasData: q.length > 0,
  };
}

function computeLowCvrAsins(audit: AuditResult, limit: number): ComputedAnswer {
  const q = audit.asinTable.filter(a => a.cvr > 0 && a.cvr < 0.05 && a.adClicks > 30).sort((a,b) => a.cvr - b.cvr).slice(0, limit);

  return {
    intent: "low_cvr_asins",
    headline: `${q.length} ASINs getting clicks but not converting (CVR under 5%)`,
    facts: [
      `${q.length} ASINs below 5% CVR with meaningful click volume`,
      `Total ad spend on these poorly-converting ASINs: ${f$(q.reduce((s,a)=>s+a.adSpend,0))}`,
      q[0] ? `Lowest converting: ${q[0].asin} "${q[0].title.slice(0,35)}" at ${fp(q[0].cvr)}` : "",
    ].filter(Boolean),
    data: {
      columns: ["#", "ASIN", "Product", "CVR", "Clicks", "Orders", "Ad Spend", "Return %"],
      rows: q.map((a, i) => [i+1, a.asin, a.title.slice(0,35), fp(a.cvr), fn(a.adClicks), fn(a.adOrders), f$(a.adSpend), fp(a.returnRate)]),
      csvReady: true,
    },
    nextSteps: [
      `Audit product listings for these ASINs — improve images, bullet points, pricing`,
      `Pause advertising on ASINs with CVR below 3% until listing is fixed`,
      `Check competitor listings to understand why customers aren't converting`,
    ],
    hasData: q.length > 0,
  };
}

function computeHighCvrCampaigns(audit: AuditResult, limit: number): ComputedAnswer {
  const q = audit.campaignTable.filter(c => c.cvr > 0.10 && c.clicks > 10).sort((a,b) => b.cvr - a.cvr).slice(0, limit);

  return {
    intent: "high_cvr_campaigns",
    headline: `${q.length} high-converting campaigns (CVR above 10%) — scale these`,
    facts: [
      `${q.length} campaigns converting above 10%`,
      `Total current spend on these winners: ${f$(q.reduce((s,c)=>s+c.spend,0))}`,
      `Total sales from these campaigns: ${f$(q.reduce((s,c)=>s+c.sales,0))}`,
      q[0] ? `Best converter: "${q[0].name}" at ${fp(q[0].cvr)} CVR — ${f$(q[0].sales)} sales` : "",
    ].filter(Boolean),
    data: {
      columns: ["#", "Campaign", "CVR", "Sales", "Spend", "ACOS", "Orders"],
      rows: q.map((c, i) => [i+1, c.name.slice(0,45), fp(c.cvr), f$(c.sales), f$(c.spend), fp(c.acos), fn(c.orders)]),
      csvReady: true,
    },
    nextSteps: [
      `Increase daily budgets on top ${Math.min(3, q.length)} converting campaigns by 20-30%`,
      `Expand keyword lists for these campaigns — they're proving demand`,
      `Redirect budget from zero-sales campaigns to these winners`,
    ],
    hasData: q.length > 0,
  };
}

function computeHighCvrAsins(audit: AuditResult, limit: number): ComputedAnswer {
  const q = audit.asinTable.filter(a => a.cvr > 0.10 && a.adClicks > 10).sort((a,b) => b.cvr - a.cvr).slice(0, limit);

  return {
    intent: "high_cvr_asins",
    headline: `${q.length} ASINs with strong conversion rate (above 10%)`,
    facts: [
      `${q.length} ASINs converting above 10%`,
      `Total revenue from these ASINs: ${f$(q.reduce((s,a)=>s+a.orderedRevenue,0))}`,
      q[0] ? `Best: ${q[0].asin} "${q[0].title.slice(0,35)}" at ${fp(q[0].cvr)} CVR` : "",
    ].filter(Boolean),
    data: {
      columns: ["#", "ASIN", "Product", "CVR", "Revenue", "Units", "Ad Spend", "ACOS"],
      rows: q.map((a, i) => [i+1, a.asin, a.title.slice(0,35), fp(a.cvr), f$(a.orderedRevenue), fn(a.orderedUnits), f$(a.adSpend), fp(a.acos)]),
      csvReady: true,
    },
    nextSteps: [
      `Increase bids and budgets for these high-CVR ASINs — proven converters`,
      `Use these ASINs as targets for Sponsored Display retargeting`,
      `Add more relevant keywords to campaigns featuring these ASINs`,
    ],
    hasData: q.length > 0,
  };
}

function computeHighReturnAsins(audit: AuditResult, limit: number): ComputedAnswer {
  const q = audit.asinTable.filter(a => a.returnRate > 0.05 && a.orderedUnits > 5).sort((a,b) => b.returnRate - a.returnRate).slice(0, limit);
  const avgReturn = audit.summary.returnRate;

  return {
    intent: "high_return_asins",
    headline: `${q.length} ASINs with above-average return rates — account avg ${fp(avgReturn)}`,
    facts: [
      `Account average return rate: ${fp(avgReturn)}`,
      `${q.length} ASINs with return rate above 5%`,
      `${q.filter(a=>a.returnRate>0.15).length} ASINs above 15% return rate (critical)`,
      q[0] ? `Highest: ${q[0].asin} "${q[0].title.slice(0,35)}" at ${fp(q[0].returnRate)} — ${fn(q[0].orderedUnits)} units ordered` : "",
      q[0] ? `Revenue at risk: ${f$(q[0].orderedRevenue * q[0].returnRate)} being returned` : "",
    ].filter(Boolean),
    data: {
      columns: ["#", "ASIN", "Product", "Return %", "Units Ordered", "Revenue", "Ad Spend", "CVR"],
      rows: q.map((a, i) => [i+1, a.asin, a.title.slice(0,35), fp(a.returnRate), fn(a.orderedUnits), f$(a.orderedRevenue), f$(a.adSpend), fp(a.cvr)]),
      csvReady: true,
    },
    nextSteps: [
      `Review product listings for top return ASINs — sizing charts, descriptions, images`,
      `Consider pausing ads on ASINs with >15% returns until listing issues are fixed`,
      `Read 1-star reviews for these ASINs to identify the root cause of returns`,
    ],
    hasData: q.length > 0,
  };
}

function computeComplexAsinQuery(audit: AuditResult, q: string, limit: number, s: Record<string, number>): ComputedAnswer {
  let rows = [...audit.asinTable];
  const appliedFilters: string[] = [];

  // Apply all matching filters
  if (s.highReturn > 0) {
    rows = rows.filter(a => a.returnRate > 0.08);
    appliedFilters.push(`return rate >8%`);
  }
  if (s.highCvr > 0) {
    rows = rows.filter(a => a.cvr > 0.08);
    appliedFilters.push(`CVR >8%`);
  }
  if (s.lowCvr > 0) {
    rows = rows.filter(a => a.cvr > 0 && a.cvr < 0.05);
    appliedFilters.push(`CVR <5%`);
  }
  if (s.highAcos > 0) {
    rows = rows.filter(a => a.acos > 0.5 && a.adSpend > 0);
    appliedFilters.push(`ACOS >50%`);
  }
  if (s.waste > 0) {
    rows = rows.filter(a => a.orderedRevenue === 0 || (a.adSpend > 0 && a.acos > 0.8));
    appliedFilters.push(`wasting budget`);
  }

  // Sort by most relevant metric
  if (s.highReturn > s.highCvr) rows.sort((a,b) => b.returnRate - a.returnRate);
  else if (s.highCvr > 0)       rows.sort((a,b) => b.cvr - a.cvr);
  else if (s.highAcos > 0)      rows.sort((a,b) => b.acos - a.acos);
  else                           rows.sort((a,b) => b.orderedRevenue - a.orderedRevenue);

  const total = rows.length;
  const shown = rows.slice(0, limit);

  const nextSteps: string[] = [];
  if (shown.filter(a=>a.returnRate>0.15).length > 0) nextSteps.push(`Urgently review listings for ${shown.filter(a=>a.returnRate>0.15).length} ASINs with >15% returns`);
  if (shown.filter(a=>a.cvr>0.15).length > 0)        nextSteps.push(`Scale budgets on ${shown.filter(a=>a.cvr>0.15).length} high-converting ASINs immediately`);
  if (shown.filter(a=>a.acos>0.7).length > 0)        nextSteps.push(`Pause or drastically cut bids on ${shown.filter(a=>a.acos>0.7).length} ASINs above 70% ACOS`);
  if (!nextSteps.length)                              nextSteps.push(`Monitor these ASINs weekly — adjust bids based on CVR and return rate trends`);

  return {
    intent: "complex_asin_filter",
    headline: `${shown.length} ASINs matching: ${appliedFilters.join(" AND ")}${total > limit ? ` (${total} total found)` : ""}`,
    facts: [
      `Filters applied: ${appliedFilters.join(", ")}`,
      `${total} ASINs matched, showing top ${shown.length}`,
      shown[0] ? `Top result: ${shown[0].asin} "${shown[0].title.slice(0,35)}" — CVR ${fp(shown[0].cvr)}, Returns ${fp(shown[0].returnRate)}, ACOS ${fp(shown[0].acos)}` : "No ASINs matched the criteria",
      shown.length > 0 ? `Combined revenue: ${f$(shown.reduce((s,a)=>s+a.orderedRevenue,0))}` : "",
      shown.length > 0 ? `Combined ad spend: ${f$(shown.reduce((s,a)=>s+a.adSpend,0))}` : "",
    ].filter(Boolean),
    data: shown.length > 0 ? {
      columns: ["#", "ASIN", "Product", "Brand", "CVR", "Return %", "ACOS", "Revenue", "Ad Spend"],
      rows: shown.map((a, i) => [i+1, a.asin, a.title.slice(0,35), a.brand, fp(a.cvr), fp(a.returnRate), fp(a.acos), f$(a.orderedRevenue), f$(a.adSpend)]),
      csvReady: true,
    } : null,
    nextSteps,
    hasData: shown.length > 0,
  };
}

function computeComplexCampaignQuery(audit: AuditResult, q: string, limit: number, s: Record<string, number>): ComputedAnswer {
  let rows = [...audit.campaignTable];
  const appliedFilters: string[] = [];

  // B2 fix: the old right-hand side (s.highAcos === 0 && s.waste > 0) was always
  // false when the left was false — dead code. Now: waste and highAcos are separate
  // filters that each independently narrow the result set.
  if (s.waste > 0) {
    rows = rows.filter(c => c.spend > 0 && c.sales === 0);
    appliedFilters.push("zero sales");
  }
  if (s.highAcos > 0) {
    rows = rows.filter(c => c.acos > 0.5 && c.sales > 0);
    appliedFilters.push("ACOS >50%");
  }
  if (s.lowCvr > 0) {
    rows = rows.filter(c => c.cvr > 0 && c.cvr < 0.05 && c.clicks > 20);
    appliedFilters.push("CVR <5%");
  }
  if (s.ctr > 0) {
    rows = rows.filter(c => c.ctr < 0.002 && c.impressions > 500);
    appliedFilters.push("low CTR");
  }

  rows.sort((a,b) => b.spend - a.spend);
  const total = rows.length;
  const shown = rows.slice(0, limit);

  const nextSteps: string[] = [];
  if (shown.filter(c=>c.sales===0).length > 0) nextSteps.push(`Pause ${shown.filter(c=>c.sales===0).length} zero-sales campaigns — ${f$(shown.filter(c=>c.sales===0).reduce((s,c)=>s+c.spend,0))} recoverable`);
  if (shown.filter(c=>c.acos>0.5).length > 0)  nextSteps.push(`Reduce bids 25% in ${shown.filter(c=>c.acos>0.5).length} high-ACOS campaigns`);
  if (!nextSteps.length)                        nextSteps.push(`Review and optimize these campaigns weekly`);

  return {
    intent: "complex_campaign_filter",
    headline: `${shown.length} campaigns matching: ${appliedFilters.join(" AND ")}`,
    facts: [
      `Filters: ${appliedFilters.join(", ")}`,
      `${total} campaigns matched, showing top ${shown.length}`,
      `Total spend in these campaigns: ${f$(shown.reduce((s,c)=>s+c.spend,0))}`,
      shown[0] ? `Top: "${shown[0].name}" — spend ${f$(shown[0].spend)}, ACOS ${fp(shown[0].acos)}` : "",
    ].filter(Boolean),
    data: shown.length > 0 ? {
      columns: ["#", "Campaign", "Spend", "Sales", "ACOS", "CVR", "CTR", "Orders"],
      rows: shown.map((c, i) => [i+1, c.name.slice(0,45), f$(c.spend), f$(c.sales), fp(c.acos), fp(c.cvr), fp(c.ctr), fn(c.orders)]),
      csvReady: true,
    } : null,
    nextSteps,
    hasData: shown.length > 0,
  };
}

// ── Zero Conversion: ASINs with ad spend but zero orders ────────────────────
// This is the FIX for the screenshot bug — deterministic, exact, never hallucinated
function computeZeroConversionAsins(audit: AuditResult, limit: number): ComputedAnswer {
  const MIN_SPEND = 5; // ignore noise under $5
  const rows = audit.asinTable
    .filter(a => a.adSpend >= MIN_SPEND && a.adOrders === 0)
    .sort((a, b) => b.adSpend - a.adSpend)
    .slice(0, limit);

  const totalSpend   = rows.reduce((s, a) => s + a.adSpend, 0);
  const totalClicks  = rows.reduce((s, a) => s + a.adClicks, 0);
  const costPerClick = safeDiv(totalSpend, totalClicks);

  return {
    intent: "zero_conversion_asins",
    headline: rows.length > 0
      ? `${rows.length} ASINs burning ${f$(totalSpend)} in ad spend with zero orders`
      : "No ASINs found with ad spend and zero orders — good sign",
    facts: [
      `${rows.length} ASINs have ad spend ≥ $5 and zero ad orders`,
      `Total ad spend wasted: ${f$(totalSpend)}`,
      `Total clicks that never converted: ${fn(totalClicks)}`,
      costPerClick > 0 ? `Average wasted CPC: ${f$(costPerClick)}` : "",
      rows[0] ? `Biggest offender: ${rows[0].asin} "${rows[0].title.slice(0,40)}" — ${f$(rows[0].adSpend)} spend, ${fn(rows[0].adClicks)} clicks, $0 orders` : "",
      rows[1] ? `Second: ${rows[1].asin} "${rows[1].title.slice(0,40)}" — ${f$(rows[1].adSpend)} spend` : "",
    ].filter(Boolean),
    data: rows.length > 0 ? {
      columns: ["#", "ASIN", "Product", "Ad Spend", "Clicks", "Orders", "Revenue", "Return %"],
      rows: rows.map((a, i) => [
        i + 1, a.asin, a.title.slice(0, 38),
        f$(a.adSpend), fn(a.adClicks), 0,
        f$(a.orderedRevenue), fp(a.returnRate),
      ]),
      csvReady: true,
    } : null,
    nextSteps: rows.length > 0 ? [
      `Pause ads on these ${rows.length} ASINs immediately — recover ${f$(totalSpend)}`,
      `Before re-enabling: fix listing images, bullet points, and price for each`,
      `Check if these ASINs have organic sales — if not, consider removing them from catalog`,
    ] : [
      `All advertised ASINs are generating orders — no action needed here`,
    ],
    hasData: rows.length > 0,
  };
}

// ── Zero Conversion: Campaigns with spend and zero orders ────────────────────
function computeZeroConversionCampaigns(audit: AuditResult, limit: number): ComputedAnswer {
  const rows = audit.campaignTable
    .filter(c => c.spend > 5 && c.orders === 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);

  const totalSpend = rows.reduce((s, c) => s + c.spend, 0);
  const totalClicks = rows.reduce((s, c) => s + c.clicks, 0);

  return {
    intent: "zero_conversion_campaigns",
    headline: rows.length > 0
      ? `${rows.length} campaigns spending ${f$(totalSpend)} with zero orders`
      : "All campaigns with meaningful spend are generating orders",
    facts: [
      `${rows.length} campaigns have spend >$5 and zero orders`,
      `Total recoverable spend: ${f$(totalSpend)}`,
      `Total wasted clicks: ${fn(totalClicks)}`,
      rows[0] ? `Worst: "${rows[0].name}" — ${f$(rows[0].spend)} spend, ${fn(rows[0].clicks)} clicks, 0 orders` : "",
      rows[1] ? `Second: "${rows[1].name}" — ${f$(rows[1].spend)}` : "",
    ].filter(Boolean),
    data: rows.length > 0 ? {
      columns: ["#", "Campaign", "Spend", "Clicks", "Impressions", "CTR", "Orders"],
      rows: rows.map((c, i) => [i+1, c.name.slice(0,45), f$(c.spend), fn(c.clicks), fn(c.impressions), fp(c.ctr), 0]),
      csvReady: true,
    } : null,
    nextSteps: rows.length > 0 ? [
      `Pause all ${rows.length} zero-order campaigns — ${f$(totalSpend)} is immediately recoverable`,
      `Review keyword relevance before re-enabling — these campaigns may be targeting the wrong audience`,
      `Reallocate budget to campaigns already generating orders`,
    ] : [`All campaigns generating orders — no zero-conversion campaigns found`],
    hasData: rows.length > 0,
  };
}

// ── Zero Conversion: Keywords with spend and zero sales ──────────────────────
function computeZeroConversionKeywords(audit: AuditResult, q: string, limit: number): ComputedAnswer {
  const kwTable = audit.keywordTable ?? [];
  const enabledOnly = /enabled|active|running|live/i.test(q);
  const rows = kwTable
    .filter(k => k.spend >= 5 && k.sales === 0)
    .filter(k => !enabledOnly || k.state === "enabled")
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
  const stateNote = enabledOnly ? " (enabled keywords only)" : "";

  const totalSpend  = rows.reduce((s, k) => s + k.spend, 0);
  const totalClicks = rows.reduce((s, k) => s + k.clicks, 0);

  return {
    intent: "zero_conversion_keywords",
    headline: rows.length > 0
      ? `${rows.length} keywords burning ${f$(totalSpend)} with zero sales${stateNote}`
      : `No keywords found spending ≥$5 with zero sales${stateNote}`,
    facts: [
      `${rows.length} keywords have ≥$5 spend and zero attributed sales`,
      `Total spend to recover: ${f$(totalSpend)}`,
      `Total clicks that produced nothing: ${fn(totalClicks)}`,
      rows[0] ? `Worst: "${rows[0].keyword}" [${rows[0].matchType}] in "${rows[0].campaignName}" — ${f$(rows[0].spend)} spent` : "",
      rows[1] ? `Second: "${rows[1].keyword}" — ${f$(rows[1].spend)} spent, ${fn(rows[1].clicks)} clicks` : "",
    ].filter(Boolean),
    data: rows.length > 0 ? {
      columns: ["#", "Keyword", "Match", "Campaign", "Spend", "Clicks", "Sales"],
      rows: rows.map((k, i) => [i+1, k.keyword.slice(0,35), k.matchType, k.campaignName.slice(0,30), f$(k.spend), fn(k.clicks), "$0"]),
      csvReady: true,
    } : null,
    nextSteps: rows.length > 0 ? [
      `Pause these ${rows.length} zero-sales keywords immediately — recover ${f$(totalSpend)}`,
      `Add as negatives to prevent them re-triggering on broad/phrase campaigns`,
      `If keyword is relevant, check listing for relevance + conversion rate before re-enabling`,
    ] : [`All spending keywords have generated at least some sales — healthy`],
    hasData: rows.length > 0,
  };
}

function computePriority(audit: AuditResult): ComputedAnswer {
  const { findings, totalWaste, totalOpportunity, score, summary } = audit;
  const critical = findings.filter(f => f.severity === "critical").sort((a,b) => b.impact - a.impact);
  const high     = findings.filter(f => f.severity === "high").sort((a,b) => b.impact - a.impact);
  const top5     = [...critical, ...high].slice(0, 5);
  const zeroSal  = audit.campaignTable.filter(c => c.spend > 0 && c.sales === 0);
  const potGain  = Math.min(25, critical.length * 5 + high.length * 2);

  return {
    intent: "priority_actions",
    headline: `${critical.length} critical issues to fix first — score can go from ${score} to ~${Math.min(100, score + potGain)}/100`,
    facts: [
      `Current health score: ${score}/100`,
      `${critical.length} critical issues, ${high.length} high-priority issues`,
      `Total waste: ${f$(totalWaste)} — ${f$(totalWaste * 12)} annualized`,
      `Total opportunity upside: ${f$(totalOpportunity)}/month`,
      zeroSal.length > 0 ? `Quick win: pause ${zeroSal.length} zero-sales campaigns — ${f$(zeroSal.reduce((s,c)=>s+c.spend,0))} instantly recovered` : "",
      top5[0] ? `Priority 1: ${top5[0].title} — ${f$(top5[0].impact)} impact` : "",
      top5[1] ? `Priority 2: ${top5[1].title} — ${f$(top5[1].impact)} impact` : "",
      top5[2] ? `Priority 3: ${top5[2].title} — ${f$(top5[2].impact)} impact` : "",
    ].filter(Boolean),
    data: top5.length > 0 ? {
      columns: ["Priority", "Issue", "Impact", "Severity", "Action"],
      rows: top5.map((f, i) => [i+1, f.title, f$(f.impact), f.severity.toUpperCase(), f.action]),
      csvReady: true,
    } : null,
    nextSteps: top5.slice(0, 3).map((f, i) => `${i+1}. ${f.action}`),
    hasData: top5.length > 0,
  };
}

function computeScoreAnalysis(audit: AuditResult): ComputedAnswer {
  const { score, scoreLabel, spendEfficiency, structureQuality, findings } = audit;
  const critical = findings.filter(f => f.severity === "critical");
  const high     = findings.filter(f => f.severity === "high");
  const potGain  = Math.min(27, critical.length * 5 + high.length * 2);

  return {
    intent: "score_analysis",
    headline: `Health score ${score}/100 (${scoreLabel}) — can reach ~${Math.min(100, score + potGain)} by fixing critical issues`,
    facts: [
      `Overall score: ${score}/100 — ${scoreLabel}`,
      `Spend efficiency: ${spendEfficiency}/70 points`,
      `Structure quality: ${structureQuality}/30 points`,
      `${critical.length} critical issues dragging the score`,
      `${high.length} high-priority issues`,
      `Waste ratio: ${fp(audit.summary.wasteRatio)} of spend is wasted`,
      `Avg ACOS: ${fp(audit.summary.avgAcos)} (target: 30%)`,
      critical[0] ? `Biggest drag: ${critical[0].title}` : "",
    ].filter(Boolean),
    data: [...critical, ...high].slice(0, 6).length > 0 ? {
      columns: ["Severity", "Issue", "Impact", "Action"],
      rows: [...critical, ...high].slice(0, 6).map(f => [f.severity.toUpperCase(), f.title, f$(f.impact), f.action]),
      csvReady: false,
    } : null,
    nextSteps: [
      critical[0] ? `Fix: ${critical[0].action}` : "",
      critical[1] ? `Fix: ${critical[1].action}` : "",
      high[0] && critical.length < 2 ? `Address: ${high[0].action}` : "",
    ].filter(Boolean),
    hasData: true,
  };
}

function computeOpportunities(audit: AuditResult, limit: number): ComputedAnswer {
  const { topOpportunities, totalOpportunity, findings } = audit;
  const opps = findings.filter(f => f.category === "opportunity").sort((a,b) => b.impact - a.impact).slice(0, limit);

  return {
    intent: "opportunities",
    headline: `${opps.length} growth opportunities — ${f$(totalOpportunity)}/month total upside`,
    facts: [
      `${opps.length} growth opportunities identified`,
      `Total monthly upside: ${f$(totalOpportunity)}`,
      `Annual upside if captured: ${f$(totalOpportunity * 12)}`,
      opps[0] ? `Best opportunity: ${opps[0].title} — ${f$(opps[0].impact * 4)}/month` : "",
      opps[1] ? `Second: ${opps[1].title} — ${f$(opps[1].impact * 4)}/month` : "",
    ].filter(Boolean),
    data: opps.length > 0 ? {
      columns: ["#", "Opportunity", "Monthly Upside", "Action"],
      rows: opps.map((f, i) => [i+1, f.title, f$(f.impact * 4), f.action]),
      csvReady: false,
    } : null,
    nextSteps: opps.slice(0, 3).map(f => f.action),
    hasData: opps.length > 0,
  };
}

function computeCampaignOverview(audit: AuditResult, limit: number): ComputedAnswer {
  const camps    = audit.campaignTable.slice(0, limit);
  const zero     = audit.campaignTable.filter(c => c.spend > 0 && c.sales === 0).length;
  const highAcos = audit.campaignTable.filter(c => c.acos > 0.5 && c.sales > 0).length;
  const healthy  = audit.campaignTable.filter(c => c.acos > 0 && c.acos < 0.35 && c.sales > 0).length;

  return {
    intent: "campaign_overview",
    headline: `${audit.summary.campaignCount} campaigns — ${zero} with zero sales, ${highAcos} high ACOS, ${healthy} healthy`,
    facts: [
      `Total campaigns: ${audit.summary.campaignCount}`,
      `Healthy campaigns (ACOS <35%): ${healthy}`,
      `Zero-sales campaigns: ${zero}`,
      `High-ACOS campaigns (>50%): ${highAcos}`,
      `Total spend: ${f$(audit.summary.totalSpend)} | Total sales: ${f$(audit.summary.totalSales)}`,
      `Avg ACOS: ${fp(audit.summary.avgAcos)} | Avg CVR: ${fp(audit.summary.avgCvr)} | Avg CTR: ${fp(audit.summary.avgCtr)}`,
    ],
    data: {
      columns: ["#", "Campaign", "Spend", "Sales", "ACOS", "Orders", "CVR"],
      rows: camps.map((c, i) => [i+1, c.name.slice(0,45), f$(c.spend), f$(c.sales), fp(c.acos), fn(c.orders), fp(c.cvr)]),
      csvReady: true,
    },
    nextSteps: [
      zero > 0 ? `Pause ${zero} zero-sales campaigns` : "",
      highAcos > 0 ? `Reduce bids in ${highAcos} high-ACOS campaigns` : "",
      `Scale budgets on the ${healthy} healthy campaigns`,
    ].filter(Boolean),
    hasData: true,
  };
}

function computeAsinOverview(audit: AuditResult, limit: number): ComputedAnswer {
  const cows   = audit.asinCohorts.filter(a => a.cohort === "cash_cow").length;
  const love   = audit.asinCohorts.filter(a => a.cohort === "need_love").length;
  const reduce = audit.asinCohorts.filter(a => a.cohort === "reduce_pause").length;
  const shown  = audit.asinTable.slice(0, limit);

  return {
    intent: "asin_overview",
    headline: `${audit.asinTable.length} ASINs — ${cows} cash cows, ${love} need love, ${reduce} should reduce/pause`,
    facts: [
      `Total ASINs: ${audit.asinTable.length}`,
      `Cash cows (high revenue, scale): ${cows}`,
      `Need love (underfunded, opportunity): ${love}`,
      `Reduce/pause (poor return): ${reduce}`,
      `Total ordered revenue: ${f$(audit.summary.totalOrderedRevenue)}`,
      `Total ordered units: ${fn(audit.summary.totalOrderedUnits)}`,
      `Average return rate: ${fp(audit.summary.returnRate)}`,
    ],
    data: {
      columns: ["#", "ASIN", "Product", "Brand", "Revenue", "Units", "CVR", "Return %"],
      rows: shown.map((a, i) => [i+1, a.asin, a.title.slice(0,35), a.brand, f$(a.orderedRevenue), fn(a.orderedUnits), fp(a.cvr), fp(a.returnRate)]),
      csvReady: true,
    },
    nextSteps: [
      cows > 0   ? `Increase ad budget on ${cows} cash cow ASINs` : "",
      love > 0   ? `Create dedicated campaigns for ${love} underfunded ASINs` : "",
      reduce > 0 ? `Reduce or pause ads on ${reduce} poor-performing ASINs` : "",
    ].filter(Boolean),
    hasData: true,
  };
}

function computeKeywords(audit: AuditResult, q: string, limit: number): ComputedAnswer {
  const kwTable = audit.keywordTable ?? [];
  const enabledOnly = /enabled|active|running|live/i.test(q);
  const filteredTable = enabledOnly ? kwTable.filter(k => k.state === "enabled") : kwTable;
  const stateNote = enabledOnly ? " (enabled only)" : "";

  // ── ONE canonical zero-sales set (spend ≥ $5, sales = 0) used everywhere ──
  const zeroSaleRows = filteredTable.filter(k => k.spend >= 5 && k.sales === 0);
  const zeroCount    = zeroSaleRows.length;
  const zeroWaste    = zeroSaleRows.reduce((s, k) => s + k.spend, 0);

  const highAcosRows = filteredTable.filter(k => k.sales > 0 && k.acos > 0.5);
  const lowCtrRows   = filteredTable.filter(k => k.impressions >= 500 && safeDiv(k.clicks, k.impressions) < 0.002);
  const totalKwSpend = filteredTable.reduce((s, k) => s + k.spend, 0);

  // Table: show zero-sales rows; fall back to top spenders if none
  const tableRows = zeroCount > 0
    ? zeroSaleRows.slice(0, limit)
    : filteredTable.slice(0, limit);

  return {
    intent: "keyword_analysis",
    headline: `${filteredTable.length} keywords${stateNote} — ${zeroCount} zero-sales wasting ${f$(zeroWaste)}`,
    facts: [
      `Total keywords${stateNote}: ${filteredTable.length}`,
      `Total keyword spend: ${f$(totalKwSpend)}`,
      // Single sentence with both the count AND the dollar — they belong together
      `Zero-sales keywords (spend ≥$5, $0 attributed sales): ${zeroCount} keywords wasting ${f$(zeroWaste)}`,
      `High-ACOS keywords (>50%): ${highAcosRows.length}`,
      `Low-CTR keywords (CTR <0.20%): ${lowCtrRows.length}`,
      zeroSaleRows[0] ? `Biggest zero-sales offender: "${zeroSaleRows[0].keyword}" [${zeroSaleRows[0].matchType}] in "${zeroSaleRows[0].campaignName}" — ${f$(zeroSaleRows[0].spend)} wasted` : "",
    ].filter(Boolean),
    data: tableRows.length > 0 ? {
      columns: ["#", "Keyword", "Match", "Campaign", "Spend", "Sales", "ACOS", "Clicks"],
      rows: tableRows.map((k, i) => [
        i + 1, k.keyword.slice(0, 32), k.matchType,
        k.campaignName.slice(0, 28), f$(k.spend), f$(k.sales), fp(k.acos), fn(k.clicks),
      ]),
      csvReady: true,
    } : null,
    nextSteps: [
      // nextStep count matches headline count — both zeroCount
      zeroCount > 0       ? `Pause all ${zeroCount} zero-sales keywords — recover ${f$(zeroWaste)}` : "",
      highAcosRows.length > 0 ? `Reduce bids 20-30% on ${highAcosRows.length} high-ACOS keywords` : "",
      lowCtrRows.length > 0   ? `Review ad relevance for ${lowCtrRows.length} low-CTR keywords` : "",
    ].filter(Boolean),
    hasData: filteredTable.length > 0,
  };
}

// ── Search Terms — actual customer queries (NOT keywords) ────────────────────
// This is what the customer actually typed. Separate from keywordTable.
function computeSearchTerms(audit: AuditResult, q: string, limit: number): ComputedAnswer {
  const stTable = audit.searchTermTable ?? [];
  if (stTable.length === 0) {
    return {
      intent: "search_terms",
      headline: "No Search Term report uploaded",
      facts: [
        "The Search Term report (from your Bulk file) was not found in the uploaded data.",
        "Upload a bulk file that includes the SP Search Term Report sheet to get search term analysis.",
      ],
      data: null,
      nextSteps: ["Re-download your Amazon Bulk file and include the Search Term sheet"],
      hasData: false,
    };
  }

  // Filter by intent: zero-sales, high-converting, or general (default: zero-sales wasters)
  const wantZeroSales    = /zero|no.*sale|no.*conver|wast|burn/i.test(q);
  const wantHighConverting = /high.*conver|winning|harvest|promot|add.*keyword/i.test(q);

  let tableRows: typeof stTable;
  let intent = "search_terms";
  let headline = "";

  if (wantHighConverting) {
    tableRows = stTable.filter(s => s.orders > 0 && s.cvr > 0.1).sort((a, b) => b.cvr - a.cvr).slice(0, limit);
    intent = "search_term_harvest";
    headline = `${tableRows.length} high-converting search terms to promote to keywords`;
  } else {
    // Default: zero-sales wasters sorted by spend
    tableRows = stTable.filter(s => s.spend >= 5 && s.sales === 0).sort((a, b) => b.spend - a.spend).slice(0, limit);
    intent = "search_term_waste";
    const totalWaste = tableRows.reduce((s, r) => s + r.spend, 0);
    headline = tableRows.length > 0
      ? `${tableRows.length} search terms wasting ${f$(totalWaste)} with zero attributed sales`
      : "No zero-sales search terms found with spend ≥$5";
  }

  const totalSpend  = tableRows.reduce((s, r) => s + r.spend, 0);
  const totalClicks = tableRows.reduce((s, r) => s + r.clicks, 0);
  const allZeroWaste = stTable.filter(s => s.spend >= 5 && s.sales === 0).reduce((s, r) => s + r.spend, 0);
  const allZeroCount = stTable.filter(s => s.spend >= 5 && s.sales === 0).length;

  return {
    intent,
    headline,
    facts: [
      `Total search terms in report: ${stTable.length}`,
      `Zero-sales search terms (spend ≥$5): ${allZeroCount} — ${f$(allZeroWaste)} wasted`,
      `Showing top ${tableRows.length} by ${wantHighConverting ? "conversion rate" : "wasted spend"}`,
      tableRows[0] ? `Top result: "${tableRows[0].searchTerm}" — ${f$(tableRows[0].spend)} spend, ${tableRows[0].orders} orders` : "",
      tableRows[1] ? `Second: "${tableRows[1].searchTerm}" — ${f$(tableRows[1].spend)} spend` : "",
    ].filter(Boolean),
    data: tableRows.length > 0 ? {
      columns: ["#", "Search Term", "Match", "Campaign", "Spend", "Sales", "ACOS", "Clicks"],
      rows: tableRows.map((s, i) => [
        i + 1, s.searchTerm.slice(0, 35), s.matchType,
        s.campaignName.slice(0, 28), f$(s.spend), f$(s.sales), fp(s.acos), fn(s.clicks),
      ]),
      csvReady: true,
    } : null,
    nextSteps: wantHighConverting ? [
      `Add top ${Math.min(5, tableRows.length)} converting search terms as exact-match keywords`,
      `Increase bids on campaigns where these terms trigger`,
    ] : [
      allZeroCount > 0 ? `Add ${allZeroCount} zero-sales search terms as negative exact keywords` : "",
      `Review campaigns triggering irrelevant terms — tighten match types`,
      `Set up a weekly search term harvest cadence`,
    ].filter(Boolean),
    hasData: tableRows.length > 0,
  };
}

// ── Specific ASIN deep-dive ────────────────────────────────────────────────────
function computeSpecificAsin(audit: AuditResult, asin: string, q: string): ComputedAnswer {
  const row = audit.asinTable.find(a => a.asin.toUpperCase() === asin);
  if (!row) {
    return {
      intent: "specific_asin",
      headline: `${asin} not found in uploaded data`,
      facts: [`ASIN ${asin} was not found in the Vendor Central sales or campaign data`, `Make sure the correct files are uploaded`],
      data: null, nextSteps: [`Upload Vendor Central and bulk campaign files that include ${asin}`], hasData: false,
    };
  }
  return {
    intent: "specific_asin",
    headline: `${asin} "${row.title.slice(0, 50)}" — ${f$(row.orderedRevenue)} revenue, ${fp(row.acos)} ACOS`,
    facts: [
      `ASIN: ${asin} | Brand: ${row.brand}`,
      `Ordered revenue: ${f$(row.orderedRevenue)} | Units: ${fn(row.orderedUnits)} | Page views: ${fn(row.pageViews)}`,
      `Return rate: ${fp(row.returnRate)} | Revenue per view: $${row.revenuePerView.toFixed(3)}`,
      `Ad spend: ${f$(row.adSpend)} | Ad sales: ${f$(row.adSales)} | Ad orders: ${fn(row.adOrders)}`,
      `ACOS: ${fp(row.acos)} | CVR: ${fp(row.cvr)} | CTR: ${fp(row.ctr)}`,
      row.acos > 0.5 ? `⚠️ ACOS above 50% — reduce bids` : row.acos > 0 && row.acos < 0.25 ? `✅ ACOS healthy — consider scaling` : "",
      row.returnRate > 0.15 ? `⚠️ High return rate (${fp(row.returnRate)}) — review listing` : "",
      row.adOrders === 0 && row.adSpend > 5 ? `⚠️ ${f$(row.adSpend)} ad spend with ZERO orders — pause ads immediately` : "",
    ].filter(Boolean),
    data: null,
    nextSteps: [
      row.adOrders === 0 && row.adSpend > 0 ? `Pause all ads for ${asin} — ${f$(row.adSpend)} wasted` : "",
      row.acos > 0.5 ? `Reduce bids by ${Math.round((1 - 0.35/row.acos)*100)}% to hit 35% ACOS target` : "",
      row.returnRate > 0.15 ? `Urgent: fix listing for ${asin} — ${fp(row.returnRate)} return rate` : "",
      row.adSpend > 0 && row.acos < 0.25 && row.adOrders > 0 ? `Scale: increase daily budget on campaigns featuring ${asin}` : "",
    ].filter(Boolean),
    hasData: true,
  };
}

// ── Kill list — exactly what to pause today ──────────────────────────────────
function computeKillList(audit: AuditResult, limit: number): ComputedAnswer {
  const zeroCamps = audit.campaignTable.filter(c => c.spend > 10 && c.orders === 0).sort((a,b) => b.spend - a.spend);
  const highAcos  = audit.campaignTable.filter(c => c.acos > 0.8 && c.sales > 0).sort((a,b) => b.spend - a.spend);
  const zeroKw    = (audit.keywordTable ?? []).filter(k => k.spend >= 20 && k.sales === 0 && k.state === "enabled").sort((a,b) => b.spend - a.spend).slice(0, 10);
  const killCamps = [...zeroCamps, ...highAcos.filter(c => !zeroCamps.find(z => z.name === c.name))].slice(0, limit);
  const totalRecover = killCamps.reduce((s,c) => s + c.spend, 0) + zeroKw.reduce((s,k) => s + k.spend, 0);

  return {
    intent: "kill_list",
    headline: `Pause ${killCamps.length} campaigns + ${zeroKw.length} keywords — recover ${f$(totalRecover)} today`,
    facts: [
      `Zero-order campaigns: ${zeroCamps.length} — ${f$(zeroCamps.reduce((s,c)=>s+c.spend,0))} to recover`,
      `High-ACOS campaigns (>80%): ${highAcos.length} — reduce bids or pause`,
      `Enabled keywords with $0 sales (≥$20 spend): ${zeroKw.length} — ${f$(zeroKw.reduce((s,k)=>s+k.spend,0))}`,
      zeroCamps[0] ? `Top campaign to kill: "${zeroCamps[0].name}" — ${f$(zeroCamps[0].spend)} spend, 0 orders` : "",
      zeroKw[0]   ? `Top keyword to pause: "${zeroKw[0].keyword}" [${zeroKw[0].matchType}] — ${f$(zeroKw[0].spend)}` : "",
    ].filter(Boolean),
    data: killCamps.length > 0 ? {
      columns: ["#", "Campaign", "Spend", "Sales", "ACOS", "Orders", "Action"],
      rows: killCamps.map((c,i) => [i+1, c.name.slice(0,40), f$(c.spend), f$(c.sales), fp(c.acos), fn(c.orders), c.orders===0 ? "PAUSE NOW" : "CUT BIDS 50%"]),
      csvReady: true,
    } : null,
    nextSteps: [
      killCamps.length > 0 ? `Pause ${killCamps.length} campaigns — ${f$(killCamps.reduce((s,c)=>s+c.spend,0))} recoverable` : "",
      zeroKw.length > 0   ? `Pause ${zeroKw.length} zero-sales keywords — ${f$(zeroKw.reduce((s,k)=>s+k.spend,0))} recoverable` : "",
      `Reallocate recovered budget to campaigns with ACOS below 30%`,
    ].filter(Boolean),
    hasData: killCamps.length > 0 || zeroKw.length > 0,
  };
}

// ── TACOS ────────────────────────────────────────────────────────────────────
function computeTacos(audit: AuditResult): ComputedAnswer {
  const { summary } = audit;
  const tacos = safeDiv(summary.totalSpend, summary.totalOrderedRevenue);
  const adSalesRatio = safeDiv(summary.totalSales, summary.totalOrderedRevenue);
  const tacosLabel = tacos < 0.08 ? "Excellent" : tacos < 0.15 ? "Good" : tacos < 0.25 ? "Elevated" : "High";
  return {
    intent: "tacos",
    headline: `TACOS: ${fp(tacos)} (${tacosLabel}) — ACOS: ${fp(summary.avgAcos)} | Ad-driven: ${fp(adSalesRatio)} of revenue`,
    facts: [
      `TACOS (ad spend ÷ total ordered revenue): ${fp(tacos)} — ${tacosLabel}`,
      `ACOS (ad spend ÷ ad-attributed sales): ${fp(summary.avgAcos)}`,
      `Total ad spend: ${f$(summary.totalSpend)}`,
      `Total ordered revenue: ${f$(summary.totalOrderedRevenue)}`,
      `Ad-attributed sales: ${f$(summary.totalSales)} (${fp(adSalesRatio)} of total revenue)`,
      `Organic/other: ~${fp(1 - adSalesRatio)} of revenue`,
      tacos > 0.20 ? `TACOS above 20% — ads are expensive relative to total business` : "",
      tacos < 0.08 ? `TACOS below 8% — efficient, healthy organic contribution` : "",
    ].filter(Boolean),
    data: null,
    nextSteps: [
      tacos > 0.20 ? `Reduce TACOS by cutting ${f$(audit.totalWaste)} in wasted spend` : "",
      tacos > 0.15 ? `Improve organic rank to reduce reliance on paid traffic` : "",
      `Target TACOS of 8-15% for a healthy ad-to-organic balance`,
    ].filter(Boolean),
    hasData: true,
  };
}

// ── Negative keyword gaps ────────────────────────────────────────────────────
function computeNegativeGaps(audit: AuditResult, limit: number): ComputedAnswer {
  const stTable = audit.searchTermTable ?? [];
  const candidates = stTable.filter(s => s.spend >= 5 && s.sales === 0).sort((a,b) => b.spend - a.spend).slice(0, limit);
  const totalWasted = candidates.reduce((s,r) => s + r.spend, 0);
  const kwTable = audit.keywordTable ?? [];
  const broadCount  = kwTable.filter(k => k.matchType.toLowerCase().includes("broad")).length;
  const phraseCount = kwTable.filter(k => k.matchType.toLowerCase().includes("phrase")).length;

  return {
    intent: "negative_gaps",
    headline: candidates.length > 0
      ? `${candidates.length} search terms to add as negatives — ${f$(totalWasted)} currently wasted`
      : "No obvious negative keyword gaps found — upload Search Term report for full analysis",
    facts: [
      stTable.length > 0 ? `${candidates.length} zero-sales search terms (≥$5 spend) are candidates for negatives` : "No Search Term report uploaded",
      stTable.length > 0 ? `Total wasted on these terms: ${f$(totalWasted)}` : "Upload bulk file with SP Search Term Report sheet",
      `Broad match keywords: ${broadCount} — highest risk for irrelevant traffic`,
      `Phrase match keywords: ${phraseCount}`,
      candidates[0] ? `Top negative candidate: "${candidates[0].searchTerm}" — ${f$(candidates[0].spend)} wasted` : "",
    ].filter(Boolean),
    data: candidates.length > 0 ? {
      columns: ["#", "Add as Negative", "Campaign", "Wasted Spend", "Clicks"],
      rows: candidates.map((s,i) => [i+1, s.searchTerm.slice(0,38), s.campaignName.slice(0,28), f$(s.spend), fn(s.clicks)]),
      csvReady: true,
    } : null,
    nextSteps: [
      candidates.length > 0 ? `Add top ${Math.min(20, candidates.length)} terms as negative exact in their campaigns` : "",
      broadCount > 0 ? `Add campaign-level negatives to ${broadCount} broad match campaigns` : "",
      `Set a weekly negative review cadence — 30 min/week protects significant budget`,
    ].filter(Boolean),
    hasData: candidates.length > 0,
  };
}

// ── Match type breakdown ─────────────────────────────────────────────────────
function computeMatchTypeBreakdown(audit: AuditResult): ComputedAnswer {
  const kwTable = audit.keywordTable ?? [];
  const byType: Record<string, { count: number; spend: number; sales: number; clicks: number; orders: number }> = {};
  for (const k of kwTable) {
    const mt = (k.matchType || "Unknown").toLowerCase();
    if (!byType[mt]) byType[mt] = { count: 0, spend: 0, sales: 0, clicks: 0, orders: 0 };
    byType[mt].count++;
    byType[mt].spend  += k.spend;
    byType[mt].sales  += k.sales;
    byType[mt].clicks += k.clicks;
    byType[mt].orders += k.orders;
  }
  const rows = Object.entries(byType).sort((a,b) => b[1].spend - a[1].spend)
    .map(([mt, d], i) => [i+1, mt, d.count, f$(d.spend), f$(d.sales), fp(safeDiv(d.spend, d.sales)), fp(safeDiv(d.orders, d.clicks))]);
  const broadData = byType["broad"] ?? byType["broad match"] ?? { spend:0, sales:0, orders:0, clicks:0, count:0 };
  const exactData = byType["exact"] ?? byType["exact match"] ?? { spend:0, sales:0, orders:0, clicks:0, count:0 };

  return {
    intent: "match_type_breakdown",
    headline: `Match type breakdown — ${Object.keys(byType).length} types across ${fn(kwTable.length)} keywords`,
    facts: [
      ...Object.entries(byType).map(([mt, d]) => `${mt}: ${d.count} keywords, ${f$(d.spend)} spend, ACOS ${fp(safeDiv(d.spend, d.sales))}`),
      broadData.spend > exactData.spend ? `Broad match dominates spend — higher risk of irrelevant traffic` : `Exact match dominates — good control`,
    ].filter(Boolean),
    data: rows.length > 0 ? {
      columns: ["#", "Match Type", "Keywords", "Spend", "Sales", "ACOS", "CVR"],
      rows,
      csvReady: true,
    } : null,
    nextSteps: [
      broadData.spend > 0 ? `Review search terms for ${f$(broadData.spend)} in broad match — likely negative gaps` : "",
      `Migrate converting broad/phrase search terms to exact match`,
      exactData.count === 0 ? `No exact match keywords — add exact match for your proven terms` : "",
    ].filter(Boolean),
    hasData: rows.length > 0,
  };
}

// ── Branded vs non-branded keywords ─────────────────────────────────────────
function computeBrandedKeywords(audit: AuditResult, limit: number): ComputedAnswer {
  const kwTable  = audit.keywordTable ?? [];
  const topBrand = (audit.summary.topBrand || "").toLowerCase();
  const brandedKw    = topBrand ? kwTable.filter(k => k.keyword.toLowerCase().includes(topBrand)) : [];
  const nonBrandedKw = topBrand ? kwTable.filter(k => !k.keyword.toLowerCase().includes(topBrand)) : kwTable;
  const brandedSpend  = brandedKw.reduce((s,k)=>s+k.spend,0);
  const nonBrandSpend = nonBrandedKw.reduce((s,k)=>s+k.spend,0);
  const brandedAcos   = safeDiv(brandedKw.reduce((s,k)=>s+k.spend,0), brandedKw.reduce((s,k)=>s+k.sales,0));
  const nonBrandAcos  = safeDiv(nonBrandedKw.reduce((s,k)=>s+k.spend,0), nonBrandedKw.reduce((s,k)=>s+k.sales,0));

  return {
    intent: "branded_vs_nonbranded",
    headline: `Branded: ${f$(brandedSpend)} (ACOS ${fp(brandedAcos)}) | Non-branded: ${f$(nonBrandSpend)} (ACOS ${fp(nonBrandAcos)})`,
    facts: [
      `Top brand detected: ${audit.summary.topBrand || "Not detected"}`,
      `Branded keywords: ${brandedKw.length} — ${f$(brandedSpend)} spend, ${fp(brandedAcos)} ACOS`,
      `Non-branded keywords: ${nonBrandedKw.length} — ${f$(nonBrandSpend)} spend, ${fp(nonBrandAcos)} ACOS`,
      brandedAcos < nonBrandAcos ? `Branded terms have lower ACOS — brand defense is working` : `Non-branded ACOS is lower — strong generic keyword performance`,
      brandedKw.length === 0 ? `No branded keywords detected — brand defense may be missing` : "",
    ].filter(Boolean),
    data: nonBrandedKw.slice(0, limit).length > 0 ? {
      columns: ["#", "Keyword", "Match", "Spend", "Sales", "ACOS", "Orders"],
      rows: nonBrandedKw.slice(0, limit).map((k,i) => [i+1, k.keyword.slice(0,35), k.matchType, f$(k.spend), f$(k.sales), fp(k.acos), fn(k.orders)]),
      csvReady: true,
    } : null,
    nextSteps: [
      brandedKw.length === 0 ? `Create brand defense campaign targeting "${audit.summary.topBrand}"` : "",
      nonBrandAcos > 0.5 ? `Non-branded ACOS at ${fp(nonBrandAcos)} — add negatives and tighten match types` : "",
      `Isolate competitor conquesting keywords in separate campaigns for better control`,
    ].filter(Boolean),
    hasData: kwTable.length > 0,
  };
}

// ── Placement ────────────────────────────────────────────────────────────────
function computePlacement(audit: AuditResult): ComputedAnswer {
  return {
    intent: "placement",
    headline: `Placement data not in current upload — here's what to check`,
    facts: [
      `Top of Search (TOS) typically has 2-3x higher CVR than product page placements`,
      `Account avg CVR: ${fp(audit.summary.avgCvr)} | Avg ACOS: ${fp(audit.summary.avgAcos)}`,
      `If ACOS is high, TOS bid multipliers may be set too aggressively`,
      `Product page placements can be cost-effective for lower-funnel shoppers`,
      `Upload the Placement Report from Amazon Ads Console → Reports → Placements`,
    ],
    data: null,
    nextSteps: [
      `Download Placement Report from Amazon Ads Console`,
      `If overall ACOS above 40%, reduce TOS bid multiplier by 20-30%`,
      `Test 0% product page modifier for campaigns with low CVR`,
    ],
    hasData: false,
  };
}

function computeRevenue(audit: AuditResult): ComputedAnswer {
  const { summary, topOpportunities } = audit;
  const adShare = summary.totalOrderedRevenue > 0 ? (summary.totalSales / summary.totalOrderedRevenue) * 100 : 0;

  return {
    intent: "revenue",
    headline: `${f$(summary.totalOrderedRevenue)} ordered revenue — ${f$(summary.totalSales)} from ads (${adShare.toFixed(1)}%)`,
    facts: [
      `Total ordered revenue: ${f$(summary.totalOrderedRevenue)}`,
      `Ad-attributed sales: ${f$(summary.totalSales)} (${adShare.toFixed(1)}% of total)`,
      `Total ordered units: ${fn(summary.totalOrderedUnits)}`,
      `Average order value: ${summary.totalOrderedUnits > 0 ? f$(safeDiv(summary.totalOrderedRevenue, summary.totalOrderedUnits)) : "N/A"}`,
      `Return rate: ${fp(summary.returnRate)}`,
      `Revenue at risk from returns: ${f$(summary.totalOrderedRevenue * summary.returnRate)}`,
      `ACOS: ${fp(summary.avgAcos)} | CVR: ${fp(summary.avgCvr)}`,
    ],
    data: null,
    nextSteps: [
      topOpportunities[0] ? `${topOpportunities[0].action}` : "",
      `Focus ad spend on top-revenue ASINs to improve ad sales share`,
      summary.returnRate > 0.1 ? `Address high return rate (${fp(summary.returnRate)}) to protect revenue` : "",
    ].filter(Boolean),
    hasData: true,
  };
}

function computeSpend(audit: AuditResult): ComputedAnswer {
  const { summary, totalWaste } = audit;
  const cpc = summary.totalClicks > 0 ? summary.totalSpend / summary.totalClicks : 0;
  const zeroSalCamps = audit.campaignTable.filter(c => c.spend > 0 && c.sales === 0);

  return {
    intent: "spend_analysis",
    headline: `${f$(summary.totalSpend)} total ad spend — ${fp(summary.wasteRatio)} wasted (${f$(totalWaste)})`,
    facts: [
      `Total ad spend: ${f$(summary.totalSpend)}`,
      `Wasted spend: ${f$(totalWaste)} (${fp(summary.wasteRatio)})`,
      `Productive spend: ${f$(summary.totalSpend - totalWaste)}`,
      `Avg CPC: ${f$(cpc)}`,
      `ACOS: ${fp(summary.avgAcos)}`,
      `${zeroSalCamps.length} campaigns wasting ${f$(zeroSalCamps.reduce((s,c)=>s+c.spend,0))} with zero sales`,
      `Total clicks: ${fn(summary.totalClicks)} | Total orders: ${fn(summary.totalOrders)}`,
    ],
    data: null,
    nextSteps: [
      `Recover ${f$(totalWaste)} by pausing zero-sales campaigns and reducing high-ACOS bids`,
      `Target ACOS of 30% — currently at ${fp(summary.avgAcos)}`,
      `Reallocate budget from worst to best performing campaigns`,
    ],
    hasData: true,
  };
}

function computeReturns(audit: AuditResult, limit: number): ComputedAnswer {
  const highReturn = audit.asinTable.filter(a => a.returnRate > 0.05 && a.orderedUnits > 3).sort((a,b) => b.returnRate - a.returnRate).slice(0, limit);

  return {
    intent: "returns_analysis",
    headline: `${fp(audit.summary.returnRate)} average return rate — ${highReturn.length} ASINs above 5%`,
    facts: [
      `Account return rate: ${fp(audit.summary.returnRate)}`,
      `Total units ordered: ${fn(audit.summary.totalOrderedUnits)}`,
      `${highReturn.length} ASINs with return rate above 5%`,
      `${highReturn.filter(a=>a.returnRate>0.15).length} ASINs above 15% (critical)`,
      highReturn[0] ? `Highest: ${highReturn[0].asin} at ${fp(highReturn[0].returnRate)} — ${fn(highReturn[0].orderedUnits)} units` : "",
    ].filter(Boolean),
    data: highReturn.length > 0 ? {
      columns: ["#", "ASIN", "Product", "Return %", "Units", "Revenue", "Ad Spend"],
      rows: highReturn.map((a, i) => [i+1, a.asin, a.title.slice(0,35), fp(a.returnRate), fn(a.orderedUnits), f$(a.orderedRevenue), f$(a.adSpend)]),
      csvReady: true,
    } : null,
    nextSteps: [
      `Read 1-3 star reviews for high-return ASINs to find root cause`,
      highReturn.filter(a=>a.returnRate>0.15).length > 0 ? `Consider pausing ads on ${highReturn.filter(a=>a.returnRate>0.15).length} ASINs above 15% returns` : "",
      `Fix product listings — sizing, descriptions, images for top-return items`,
    ].filter(Boolean),
    hasData: highReturn.length > 0,
  };
}

function computeCtr(audit: AuditResult, limit: number): ComputedAnswer {
  const lowCtr = audit.campaignTable.filter(c => c.ctr < 0.002 && c.impressions > 500).sort((a,b) => a.ctr - b.ctr).slice(0, limit);

  return {
    intent: "ctr_analysis",
    headline: `Avg CTR ${fp(audit.summary.avgCtr)} — ${lowCtr.length} campaigns below benchmark`,
    facts: [
      `Account avg CTR: ${fp(audit.summary.avgCtr)} (Amazon benchmark ~0.35%)`,
      `Total impressions: ${fn(audit.summary.totalImpressions)}`,
      `Total clicks: ${fn(audit.summary.totalClicks)}`,
      `${lowCtr.length} campaigns below 0.2% CTR`,
      lowCtr[0] ? `Lowest CTR: "${lowCtr[0].name}" at ${fp(lowCtr[0].ctr)} — ${fn(lowCtr[0].impressions)} impressions, only ${fn(lowCtr[0].clicks)} clicks` : "",
    ].filter(Boolean),
    data: lowCtr.length > 0 ? {
      columns: ["#", "Campaign", "CTR", "Impressions", "Clicks", "Spend"],
      rows: lowCtr.map((c, i) => [i+1, c.name.slice(0,45), fp(c.ctr), fn(c.impressions), fn(c.clicks), f$(c.spend)]),
      csvReady: true,
    } : null,
    nextSteps: [
      `Improve main product images for low-CTR campaigns — this is the #1 CTR driver`,
      `Test different ad copy and headline variations`,
      `Review keyword match types — broad match often wastes impressions on irrelevant queries`,
    ],
    hasData: lowCtr.length > 0,
  };
}

function computeCvr(audit: AuditResult, limit: number): ComputedAnswer {
  const lowCvr = audit.campaignTable.filter(c => c.cvr > 0 && c.cvr < 0.05 && c.clicks > 20).sort((a,b) => a.cvr - b.cvr).slice(0, limit);

  return {
    intent: "cvr_analysis",
    headline: `Avg CVR ${fp(audit.summary.avgCvr)} — Amazon avg is 10-13%`,
    facts: [
      `Account avg CVR: ${fp(audit.summary.avgCvr)}`,
      `Total clicks: ${fn(audit.summary.totalClicks)} | Total orders: ${fn(audit.summary.totalOrders)}`,
      `${lowCvr.length} campaigns below 5% CVR`,
      audit.summary.avgCvr < 0.05 ? "Below industry average — focus on listing quality" : audit.summary.avgCvr < 0.10 ? "Moderate — room to improve" : "Strong CVR — focus on scaling",
    ],
    data: lowCvr.length > 0 ? {
      columns: ["#", "Campaign", "CVR", "Clicks", "Orders", "Spend", "ACOS"],
      rows: lowCvr.map((c, i) => [i+1, c.name.slice(0,45), fp(c.cvr), fn(c.clicks), fn(c.orders), f$(c.spend), fp(c.acos)]),
      csvReady: true,
    } : null,
    nextSteps: [
      `Improve product listings for low-CVR campaigns — images, price, reviews are key`,
      `Use A+ Content and enhanced brand content to improve conversion`,
      `Review pricing vs competitors for low-converting ASINs`,
    ],
    hasData: true,
  };
}

function computeImpressions(audit: AuditResult): ComputedAnswer {
  return {
    intent: "impressions",
    headline: `${fn(audit.summary.totalImpressions)} ad impressions — ${fn(audit.summary.totalPageViews)} total page views`,
    facts: [
      `Total ad impressions: ${fn(audit.summary.totalImpressions)}`,
      `Total page views (organic + paid): ${fn(audit.summary.totalPageViews)}`,
      `Total clicks: ${fn(audit.summary.totalClicks)}`,
      `CTR: ${fp(audit.summary.avgCtr)}`,
      `Campaigns running: ${audit.summary.campaignCount}`,
      `Keywords active: ${audit.summary.keywordCount}`,
    ],
    data: null,
    nextSteps: [
      `Improve CTR (${fp(audit.summary.avgCtr)}) by testing better product images`,
      `Expand keyword lists to increase impression share`,
      `Review search term reports to add high-volume keywords`,
    ],
    hasData: true,
  };
}

function computeBrands(audit: AuditResult): ComputedAnswer {
  const brandRevMap: Record<string, { revenue: number; units: number; asins: number }> = {};
  audit.asinTable.forEach(a => {
    if (!brandRevMap[a.brand]) brandRevMap[a.brand] = { revenue: 0, units: 0, asins: 0 };
    brandRevMap[a.brand].revenue += a.orderedRevenue;
    brandRevMap[a.brand].units   += a.orderedUnits;
    brandRevMap[a.brand].asins++;
  });
  const sorted = Object.entries(brandRevMap).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 10);

  return {
    intent: "brand_analysis",
    headline: `${sorted.length} brands — top brand: ${sorted[0]?.[0] ?? "N/A"} with ${f$(sorted[0]?.[1].revenue ?? 0)}`,
    facts: [
      `Top brand: ${audit.summary.topBrand}`,
      ...sorted.slice(0, 5).map(([b, d]) => `${b}: ${f$(d.revenue)} revenue, ${fn(d.units)} units, ${d.asins} ASINs`),
    ],
    data: sorted.length > 0 ? {
      columns: ["#", "Brand", "Revenue", "Units", "ASINs"],
      rows: sorted.map(([b, d], i) => [i+1, b, f$(d.revenue), fn(d.units), d.asins]),
      csvReady: true,
    } : null,
    nextSteps: [
      `Focus ad spend on top-revenue brand: ${audit.summary.topBrand}`,
      `Identify underperforming brands and review their listings`,
    ],
    hasData: sorted.length > 0,
  };
}

function computeCompare(audit: AuditResult): ComputedAnswer {
  const best  = [...audit.campaignTable].filter(c => c.sales > 0).sort((a,b) => b.sales - a.sales).slice(0, 3);
  const worst = [...audit.campaignTable].filter(c => c.spend > 0).sort((a,b) => a.sales - b.sales).slice(0, 3);

  return {
    intent: "compare",
    headline: `Best campaigns generating ${f$(best.reduce((s,c)=>s+c.sales,0))} vs worst wasting ${f$(worst.reduce((s,c)=>s+c.spend,0))}`,
    facts: [
      `Top campaign: "${best[0]?.name ?? "N/A"}" — ${f$(best[0]?.sales ?? 0)} sales, ${fp(best[0]?.acos ?? 0)} ACOS`,
      `Second best: "${best[1]?.name ?? "N/A"}" — ${f$(best[1]?.sales ?? 0)} sales`,
      `Worst: "${worst[0]?.name ?? "N/A"}" — ${f$(worst[0]?.spend ?? 0)} spend, ${f$(worst[0]?.sales ?? 0)} sales`,
      `Gap between best and worst: ${f$((best[0]?.sales ?? 0) - (worst[0]?.sales ?? 0))} in sales`,
    ],
    data: {
      columns: ["#", "Campaign", "Spend", "Sales", "ACOS", "CVR", "Type"],
      rows: [
        ...best.map((c, i) => [i+1, c.name.slice(0,40), f$(c.spend), f$(c.sales), fp(c.acos), fp(c.cvr), "✅ Best"]),
        ...worst.map((c, i) => [i+1, c.name.slice(0,40), f$(c.spend), f$(c.sales), fp(c.acos), fp(c.cvr), "❌ Worst"]),
      ],
      csvReady: true,
    },
    nextSteps: [
      `Scale budget on top campaign: "${best[0]?.name ?? "N/A"}"`,
      `Pause or restructure worst campaign: "${worst[0]?.name ?? "N/A"}"`,
      `Study what makes best campaigns work and replicate the structure`,
    ],
    hasData: best.length > 0,
  };
}

function computeDataInfo(audit: AuditResult): ComputedAnswer {
  return {
    intent: "data_info",
    headline: `${audit.summary.reportingDays} days of data — ${audit.hasCampaignData ? "campaign ✓" : "no campaign data"}, ${audit.hasSalesData ? "sales ✓" : "no sales data"}`,
    facts: [
      `Reporting period: ~${audit.summary.reportingDays} days`,
      `Campaigns loaded: ${audit.summary.campaignCount}`,
      `Keywords loaded: ${audit.summary.keywordCount}`,
      `ASINs loaded: ${audit.summary.asinCount}`,
      `Total rows analyzed: ${audit.summary.campaignCount + audit.summary.keywordCount + audit.summary.asinCount}`,
      `Files: ${audit.hasCampaignData ? "Bulk Campaign ✓" : "Missing bulk campaign"} | ${audit.hasSalesData ? "Vendor Central ✓" : "Missing Vendor Central"}`,
    ],
    data: null,
    nextSteps: [
      !audit.hasCampaignData ? "Upload bulk campaign file to unlock keyword and ACOS analysis" : "",
      !audit.hasSalesData ? "Upload Vendor Central sales + traffic files to unlock ASIN analysis" : "",
    ].filter(Boolean),
    hasData: true,
  };
}

function computeSummary(audit: AuditResult): ComputedAnswer {
  const { summary, score, scoreLabel, totalWaste, totalOpportunity, findings } = audit;
  const critical = findings.filter(f => f.severity === "critical").length;
  const high     = findings.filter(f => f.severity === "high").length;

  return {
    intent: "summary",
    headline: `Health score ${score}/100 (${scoreLabel}) — ${f$(totalWaste)} waste, ${f$(totalOpportunity)}/month opportunity`,
    facts: [
      `Health score: ${score}/100 — ${scoreLabel}`,
      `Total ad spend: ${f$(summary.totalSpend)} | Total ad sales: ${f$(summary.totalSales)}`,
      `ACOS: ${fp(summary.avgAcos)} | CVR: ${fp(summary.avgCvr)} | CTR: ${fp(summary.avgCtr)}`,
      `Ordered revenue: ${f$(summary.totalOrderedRevenue)} | Units: ${fn(summary.totalOrderedUnits)}`,
      `Total waste: ${f$(totalWaste)} | Monthly opportunity: ${f$(totalOpportunity)}`,
      `${critical} critical issues, ${high} high-priority issues`,
      `${summary.campaignCount} campaigns | ${summary.keywordCount} keywords | ${summary.asinCount} ASINs`,
      `Return rate: ${fp(summary.returnRate)} | Top brand: ${summary.topBrand}`,
    ],
    data: null,
    nextSteps: [
      `Address ${critical} critical issues to improve health score`,
      `Recover ${f$(totalWaste)} in wasted ad spend`,
      `Capture ${f$(totalOpportunity)}/month in identified opportunities`,
    ],
    hasData: true,
  };
}
