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

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: context }],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return NextResponse.json({ error: err.error?.message ?? "OpenAI error" }, { status: 200 });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
