import { NextRequest, NextResponse } from "next/server";
import { readLeads, readWeeklyReports, writeWeeklyReport } from "@/lib/leads/store";
import { buildWeeklyReport, isoWeek } from "@/lib/leads/weeklyReport";

export async function GET(req: NextRequest) {
  const week = req.nextUrl.searchParams.get("week") ?? isoWeek();
  const existing = readWeeklyReports().find((r) => r.week === week);
  if (existing) return NextResponse.json({ report: existing });

  const report = buildWeeklyReport(readLeads(), week);
  return NextResponse.json({ report });
}

export async function POST(req: NextRequest) {
  const week = req.nextUrl.searchParams.get("week") ?? isoWeek();
  const report = buildWeeklyReport(readLeads(), week);
  writeWeeklyReport(report);
  return NextResponse.json({ report });
}
