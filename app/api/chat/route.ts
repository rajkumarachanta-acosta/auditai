import { NextRequest, NextResponse } from "next/server";
import { buildLLMContext } from "@/lib/chatEngine";
import { AuditResult } from "@/lib/auditEngine";

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

    const context = buildLLMContext(audit, question);

    // gpt-4o-mini: best value — smart enough for expert analysis at ~1/10th the cost of gpt-4o
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
              content: "You are a world-class Amazon advertising analyst. You have deep expertise in PPC, ACOS optimization, campaign structure, and retail analytics. Always answer based strictly on the data provided. Be specific, use exact numbers, and provide actionable recommendations.",
            },
            {
              role: "user",
              content: context,
            },
          ],
          max_tokens: 1500,
          temperature: 0.2, // Low temperature = factual, consistent answers
        }),
      });

      if (response.status === 404 || response.status === 400) {
        // Model not available, try next
        continue;
      }

      if (!response.ok) {
        const err = await response.json();
        return NextResponse.json({ error: err.error?.message ?? "OpenAI error" }, { status: 200 });
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content ?? "";
      return NextResponse.json({ answer, model });
    }

    return NextResponse.json({ error: "No available model responded" }, { status: 200 });

  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
