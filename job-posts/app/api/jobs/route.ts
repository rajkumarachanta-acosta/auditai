import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const db = sql();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all"; // new | saved | applied | hidden | rejected | all
  const minScore = Number(searchParams.get("minScore") || 0);
  const q = searchParams.get("q")?.trim();

  const rows = q
    ? await db`
        select * from jobs
        where (status = ${status} or ${status} = 'all')
          and match_score >= ${minScore}
          and (title ilike ${"%" + q + "%"} or company ilike ${"%" + q + "%"})
        order by match_score desc nulls last, posted_at desc nulls last
        limit 200
      `
    : await db`
        select * from jobs
        where (status = ${status} or ${status} = 'all')
          and match_score >= ${minScore}
        order by match_score desc nulls last, posted_at desc nulls last
        limit 200
      `;

  return NextResponse.json({ jobs: rows });
}

export async function PATCH(req: NextRequest) {
  const db = sql();
  const { id, status, notes } = (await req.json()) as { id: string; status?: string; notes?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (status !== undefined) {
    await db`update jobs set status = ${status}, status_updated_at = now() where id = ${id}`;
  }
  if (notes !== undefined) {
    await db`update jobs set notes = ${notes} where id = ${id}`;
  }
  return NextResponse.json({ ok: true });
}
