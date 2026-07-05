import { NextRequest, NextResponse } from "next/server";
import { AuditResult } from "@/lib/auditEngine";
import { ComputedAnswer } from "@/lib/computeEngine";

// ── AuditAI — expert Amazon analyst persona ──────────────────────────────────
// GPT is a FORMATTER only. It receives pre-computed facts and writes prose.
// It may NEVER invent, recalculate, or round any number not already in the DATA.
// temperature: 0 — deterministic, no drift.
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the analytical voice of AuditAI — a Senior Director of Amazon Advertising with 15+ years running Sponsored Products, Sponsored Brands, and Sponsored Display for Vendor and Seller Central accounts. You speak to brand managers, VPs, and CSMs. Your tone is decisive, quantified, and executive — never hedging.

ABSOLUTE RULES — violating these makes your answer worthless:

1. NUMBERS ARE SACRED. Every number, dollar figure, percentage, ASIN, campaign name, and keyword in your response MUST come verbatim from the DATA block provided. You may NEVER invent, estimate, round differently, recalculate, or infer a number that is not explicitly in the DATA. If a number is not in the DATA, do not state it.

2. YOU DO NOT DO MATH. The analysis engine already computed everything. Your job is to translate pre-computed facts into clear, confident prose. If you feel tempted to calculate, stop — the answer is already in the DATA.

3. LEAD WITH THE HEADLINE. Open with the single most important finding (usually the provided headline), stated plainly. Then support it with the facts. Then give the action.

4. BE SPECIFIC AND DIRECTIVE. Say "Pause these 6 campaigns to recover $1,847" not "you may want to consider reviewing some campaigns." Name the ASIN, quote the ACOS, state the dollar recovery. An Amazon director does not hedge.

5. RESPECT THE TABLE. A data table will be shown to the user separately, below your text. Do NOT reproduce the full table in your prose. Reference it ("the table below ranks all 14") and highlight only the top 1–3 rows that matter most.

6. NEXT STEPS ARE COMMANDS. Frame the provided next steps as a prioritized action list the reader can execute today. Preserve every dollar figure exactly.

7. LENGTH. 2–4 tight paragraphs OR a short lead + up to 5 bullet actions. Never pad. If the DATA says there's nothing to report, say so in one line — don't manufacture concern.

8. NO DISCLAIMERS. Never say "as an AI," never apologize, never caveat the data quality unless the DATA explicitly flags missing data.

You are the expert the reader wishes they could hire. Sound like it.`;

function buildUserPayload(computed: ComputedAnswer, question: string, audit: AuditResult): string {
  const tablePreview =
    computed.data && computed.data.rows.length
      ? `TABLE (${computed.data.rows.length} rows, shown separately — reference but don't reproduce):
Columns: ${computed.data.columns.join(" | ")}
Top rows:
${computed.data.rows.slice(0, 5).map(r => r.join(" | ")).join("\n")}`
      : "TABLE: none";

  // Minimal account context so GPT can reference totals if needed
  const s = audit.summary;
  const f$ = (n: number) => !Number.isFinite(n) ? "$0" : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;
  const fp = (n: number) => Number.isFinite(n) ? `${(n*100).toFixed(2)}%` : "0%";

  const accountCtx = `ACCOUNT TOTALS (reference only — use exact strings from FACTS above):
Spend: ${f$(s.totalSpend)} | Sales: ${f$(s.totalSales)} | ACOS: ${fp(s.avgAcos)} | CVR: ${fp(s.avgCvr)}
Campaigns: ${s.campaignCount} | Keywords: ${s.keywordCount} | ASINs: ${s.asinCount}
Health: ${audit.score}/100 (${audit.scoreLabel}) | Waste: ${f$(audit.totalWaste)}`;

  return `USER QUESTION: "${question}"

=== PRE-COMPUTED DATA (ground truth — every number you use must appear here) ===

HEADLINE: ${computed.headline}

FACTS:
${computed.facts.map(f => `• ${f}`).join("\n")}

${tablePreview}

RECOMMENDED NEXT STEPS:
${computed.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

${accountCtx}

=== END DATA ===

Write the expert response now. Lead with the headline finding, support with the facts, close with the prioritized actions. Every number verbatim from above.`;
}

export async function POST(req: NextRequest) {
  try {
    const { question, computed, audit } = await req.json() as {
      question: string;
      computed: ComputedAnswer;
      audit: AuditResult;
    };

    if (!question || !computed) {
      return NextResponse.json({ error: "Missing question or computed answer" }, { status: 400 });
    }

    // Greetings and PowerPoint don't need GPT — return directly
    if (computed.intent === "greeting" || computed.intent === "powerpoint") {
      return NextResponse.json({ answer: computed.headline, source: "direct" });
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "NO_API_KEY" }, { status: 200 });
    }

    const payload = buildUserPayload(computed, question, audit);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",      // fast + cheap; gpt-4o for sharpest answers
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: payload },
        ],
        temperature: 0,            // deterministic — no drift, no invented numbers
        max_tokens: 1000,
        top_p: 1,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return NextResponse.json({ error: err.error?.message ?? `OpenAI ${response.status}`, source: "fallback" }, { status: 200 });
    }

    const out = await response.json();
    const answer = out?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) {
      return NextResponse.json({ error: "Empty GPT response", source: "fallback" }, { status: 200 });
    }

    // Return computed alongside GPT prose — the table comes from computed.data,
    // NOT from GPT. The client renders both: prose on top, table below.
    return NextResponse.json({ answer, computed, source: "gpt", model: "gpt-4o-mini" });

  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
