import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  const db = sql();
  const rows = await db`select * from profile where id = 1`;
  return NextResponse.json({ profile: rows[0] ?? null });
}

export async function PUT(req: NextRequest) {
  const db = sql();
  const body = await req.json();

  await db`
    update profile set
      target_titles = ${body.target_titles ?? []},
      skills = ${body.skills ?? []},
      years_experience = ${body.years_experience ?? null},
      seniority = ${body.seniority ?? null},
      locations = ${body.locations ?? []},
      remote_only = ${body.remote_only ?? false},
      visa_sponsorship_needed = ${body.visa_sponsorship_needed ?? false},
      visa_from_country = ${body.visa_from_country ?? null},
      visa_to_countries = ${body.visa_to_countries ?? []},
      salary_floor = ${body.salary_floor ?? null},
      salary_currency = ${body.salary_currency ?? "USD"},
      excluded_companies = ${body.excluded_companies ?? []},
      excluded_keywords = ${body.excluded_keywords ?? []},
      resume_text = ${body.resume_text ?? null},
      updated_at = now()
    where id = 1
  `;

  return NextResponse.json({ ok: true });
}
