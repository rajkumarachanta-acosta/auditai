import { NextRequest, NextResponse } from "next/server";
import { AuditResult } from "@/lib/auditEngine";
import { computeAnswer, ComputedAnswer } from "@/lib/computeEngine";

// ── Build a tiny GPT prompt from pre-computed facts ──
// GPT only formats language — all numbers are already computed locally.
// This uses ~10x fewer tokens than sending raw data.
function buildSmartPrompt(computed: ComputedAnswer, question: string): string {
  const factsText   = computed.facts.map((f, i) => `${i+1}. ${f}`).join("\n");
  const stepsText   = computed.nextSteps.map((s, i) => `${i+1}. ${s}`).join("\n");
  const tableText   = computed.data
    ? `\nDATA TABLE:\n${computed.data.columns.join(" | ")}\n${computed.data.rows.map(r => r.join(" | ")).join("\n")}`
    : "";

  return `You are an expert Amazon advertising analyst speaking directly to a client.

The client asked: "${question}"

Pre-computed facts (use these exact numbers — do not change them):
${factsText}${tableText}

Next actions to recommend:
${stepsText}

Reply in 3-5 flowing sentences like a real analyst on a call — no bullet points, no headers, no markdown. Just plain conversational text. Start directly with the insight, use the exact numbers, name specific campaigns or ASINs where available, and end with the top 1-2 actions the client should take today.`;
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

    // ── Step 1: Compute answer locally (zero tokens) ──
    const computed = computeAnswer(audit, question);

    // PowerPoint special case
    if (computed.intent === "powerpoint") {
      return NextResponse.json({ error: "POWERPOINT" }, { status: 200 });
    }

    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      return NextResponse.json({ error: "NO_API_KEY", computed }, { status: 200 });
    }

    // ── Step 2: GPT formats the pre-computed facts into natural language ──
    const prompt = buildSmartPrompt(computed, question);

    const models = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];

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
            {
              role: "system",
              content: "You are a world-class Amazon advertising analyst. Be direct, specific, and actionable. Always use the exact numbers provided — never make up or change figures.",
            },
            { role: "user", content: prompt },
          ],
          max_tokens: 600,   // Small — GPT only formats, doesn't compute
          temperature: 0.3,
        }),
      });

      if (response.status === 404 || response.status === 400) continue;

      if (!response.ok) {
        const err = await response.json();
        // Fall back to local computed answer
        return NextResponse.json({ error: err.error?.message ?? "OpenAI error", computed }, { status: 200 });
      }

      const data   = await response.json();
      const answer = data.choices?.[0]?.message?.content ?? "";
      return NextResponse.json({ answer, computed, model });
    }

    return NextResponse.json({ error: "No model available", computed }, { status: 200 });

  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
