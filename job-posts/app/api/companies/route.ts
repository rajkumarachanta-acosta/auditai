import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  const db = sql();
  const rows = await db`select * from target_companies order by ats, token`;
  return NextResponse.json({ companies: rows });
}

export async function POST(req: NextRequest) {
  const db = sql();
  const body = (await req.json()) as {
    ats: "greenhouse" | "lever" | "workday";
    token: string;
    workday_dc?: string;
    workday_site?: string;
    display_name?: string;
  };

  if (!body.ats || !body.token) {
    return NextResponse.json({ error: "ats and token are required" }, { status: 400 });
  }
  if (body.ats === "workday" && (!body.workday_dc || !body.workday_site)) {
    return NextResponse.json({ error: "workday_dc and workday_site are required for Workday companies" }, { status: 400 });
  }

  await db`
    insert into target_companies (ats, token, workday_dc, workday_site, display_name)
    values (${body.ats}, ${body.token}, ${body.workday_dc ?? null}, ${body.workday_site ?? null}, ${body.display_name ?? body.token})
    on conflict (ats, token, workday_site) do update set enabled = true
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const db = sql();
  const { id } = (await req.json()) as { id: number };
  await db`delete from target_companies where id = ${id}`;
  return NextResponse.json({ ok: true });
}
