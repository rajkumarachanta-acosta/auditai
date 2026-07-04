import { NextRequest, NextResponse } from "next/server";
import { AuditResult } from "@/lib/auditEngine";

function buildContext(audit: AuditResult): string {
  const { summary, score, scoreLabel, spendEfficiency, structureQuality,
    totalWaste, totalOpportunity, findings, asinCohorts,
    campaignTable, asinTable, keywordTable, hasCampaignData, hasSalesData } = audit;

  const f$ = (n: number) => n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;
  const fp = (n: number) => `${(n*100).toFixed(2)}%`;
  const fn = (n: number) => n.toLocaleString();

  const wasteFindings  = findings.filter(f => f.category === "waste").sort((a,b) => b.impact - a.impact);
  const oppFindings    = findings.filter(f => f.category === "opportunity").sort((a,b) => b.impact - a.impact);
  const critFindings   = findings.filter(f => f.severity === "critical");

  const camps = campaignTable.slice(0, 60).map((c,i) =>
    `${i+1}. "${c.name}" | Spend:${f$(c.spend)} Sales:${f$(c.sales)} ACOS:${fp(c.acos)} CVR:${fp(c.cvr)} CTR:${fp(c.ctr)} Orders:${c.orders} Clicks:${fn(c.clicks)}`
  ).join("\n");

  const keywords = (keywordTable ?? []).slice(0, 80).map((k,i) =>
    `${i+1}. "${k.keyword}" [${k.matchType}] | Campaign:${k.campaignName} | Spend:${f$(k.spend)} Sales:${f$(k.sales)} ACOS:${fp(k.acos)} CTR:${fp(k.ctr)} CVR:${fp(k.cvr)} Orders:${k.orders} Clicks:${fn(k.clicks)}`
  ).join("\n");

  const asins = asinTable.slice(0, 60).map((a,i) =>
    `${i+1}. ${a.asin} "${a.title.slice(0,45)}" Brand:${a.brand} | Revenue:${f$(a.orderedRevenue)} Units:${fn(a.orderedUnits)} Views:${fn(a.pageViews)} CVR:${fp(a.cvr)} ACOS:${fp(a.acos)} Returns:${fp(a.returnRate)} AdSpend:${f$(a.adSpend)}`
  ).join("\n");

  const waste = wasteFindings.slice(0, 20).map((f,i) =>
    `${i+1}. [${f.severity.toUpperCase()}] ${f.title} | Impact:${f$(f.impact)} | ${f.detail} | Fix: ${f.action}`
  ).join("\n");

  const opps = oppFindings.slice(0, 10).map((f,i) =>
    `${i+1}. ${f.title} | Upside:${f$(f.impact*4)}/mo | ${f.detail} | Action: ${f.action}`
  ).join("\n");

  const cohorts = asinCohorts.slice(0, 30).map(a =>
    `${a.asin} [${a.cohort}] Rev:${f$(a.orderedRevenue)} Units:${fn(a.orderedUnits)} RevPerView:$${a.revenuePerView.toFixed(3)} Returns:${fp(a.returnRate)}`
  ).join("\n");

  return `ACCOUNT DATA:
Health Score: ${score}/100 (${scoreLabel}) | Spend Efficiency: ${spendEfficiency}/70 | Structure: ${structureQuality}/30
Ad Spend: ${f$(summary.totalSpend)} | Ad Sales: ${f$(summary.totalSales)} | ACOS: ${fp(summary.avgAcos)} | CVR: ${fp(summary.avgCvr)} | CTR: ${fp(summary.avgCtr)}
Impressions: ${fn(summary.totalImpressions)} | Clicks: ${fn(summary.totalClicks)} | Orders: ${fn(summary.totalOrders)}
Ordered Revenue: ${f$(summary.totalOrderedRevenue)} | Units: ${fn(summary.totalOrderedUnits)} | Return Rate: ${fp(summary.returnRate)}
Campaigns: ${summary.campaignCount} | Keywords: ${summary.keywordCount} | ASINs: ${summary.asinCount} | Top Brand: ${summary.topBrand}
Total Waste: ${f$(totalWaste)} | Monthly Opportunity: ${f$(totalOpportunity)}
Files: ${hasCampaignData ? "Bulk Campaign ✓" : "No campaign file"} | ${hasSalesData ? "Vendor Central ✓" : "No sales file"}

WASTE FINDINGS (${wasteFindings.length} total, ${critFindings.length} critical):
${waste || "None"}

OPPORTUNITIES (${oppFindings.length} total):
${opps || "None"}

ALL KEYWORDS (${(keywordTable ?? []).length} total, sorted by spend):
${keywords || "No keyword data"}

ALL CAMPAIGNS (${campaignTable.length} total, sorted by spend):
${camps || "No campaign data"}

ALL ASINs (${asinTable.length} total, sorted by revenue):
${asins || "No ASIN data"}

ASIN COHORTS:
${cohorts || "No cohort data"}`;
}

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

    const context = buildContext(audit);

    const systemPrompt = `You are AuditAI — an expert Amazon advertising analyst. You have full access to the account data below. You think like a senior PPC strategist who has managed hundreds of Amazon accounts.

ACCOUNT DATA:
${context}

Rules:
- Answer based ONLY on the data above — never guess or hallucinate numbers
- Be conversational, direct, and confident — like an analyst on a call with a client
- Use exact numbers, campaign names, and ASINs from the data when relevant
- If asked for a ranked list (top 10, top 20 etc), provide exactly that many items
- Always end with 1-3 specific, prioritized next actions
- For greetings or meta questions ("what is your name", "what can you do"), introduce yourself and list what you can help with
- Keep responses focused and concise — no padding`;

    const models = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo-16k"];

    for (const model of models) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
          ],
          max_tokens: 800,
          temperature: 0.3,
        }),
      });

      if (response.status === 404 || response.status === 400) continue;

      if (!response.ok) {
        const err = await response.json();
        return NextResponse.json({ error: err.error?.message ?? "OpenAI error" }, { status: 200 });
      }

      const data   = await response.json();
      const answer = data.choices?.[0]?.message?.content ?? "";
      return NextResponse.json({ answer, model });
    }

    return NextResponse.json({ error: "No model available" }, { status: 200 });

  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
