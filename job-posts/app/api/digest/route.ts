import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  visa_sponsorship: boolean | null;
  url: string;
  match_score: number | null;
  match_reason: string | null;
}

async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = sql();
  const rows = (await db`
    select id, title, company, location, remote, visa_sponsorship, url, match_score, match_reason
    from jobs
    where status = 'new' and collected_at > now() - interval '26 hours'
    order by match_score desc nulls last
    limit 20
  `) as JobRow[];

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_TO_EMAIL;
  const from = process.env.DIGEST_FROM_EMAIL;

  if (!apiKey || !to || !from) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY, DIGEST_TO_EMAIL, and DIGEST_FROM_EMAIL must be set" }, { status: 200 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: "no new matches" });
  }

  const html = `
    <h2>${rows.length} new job match${rows.length === 1 ? "" : "es"}</h2>
    <ol>
      ${rows
        .map(
          (j) => `<li style="margin-bottom:12px">
            <a href="${j.url}"><strong>${j.title}</strong></a> — ${j.company}
            ${j.location ? ` · ${j.location}` : ""}${j.remote ? " · Remote" : ""}${j.visa_sponsorship ? " · Visa sponsorship likely" : ""}
            <br/><span style="color:#666">Score ${j.match_score ?? "?"}/100 — ${j.match_reason ?? ""}</span>
          </li>`
        )
        .join("")}
    </ol>
  `;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject: `${rows.length} new job match${rows.length === 1 ? "" : "es"}`,
    html,
  });

  await db`insert into digest_log (job_count) values (${rows.length})`;

  return NextResponse.json({ ok: true, sent: true, count: rows.length });
}
