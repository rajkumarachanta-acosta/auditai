import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireSession } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { listReports } from "@/lib/reachy/repositories/report.repository";
import { generateReport } from "@/lib/reachy/services/report.service";
import { ValidationError } from "@/lib/reachy/errors";

export const GET = withErrorHandling(async () => {
  await requireSession();
  const reports = await listReports();
  return NextResponse.json({ data: reports });
});

const postSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
});

export const POST = withErrorHandling(async (req: Request) => {
  const session = await requireRole("MANAGER");
  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) throw new ValidationError("Invalid report request", parsed.error.flatten());

  const periodStart = new Date(parsed.data.periodStart);
  const periodEnd = new Date(parsed.data.periodEnd);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodStart >= periodEnd) {
    throw new ValidationError("periodStart must be before periodEnd, both valid dates");
  }

  const report = await generateReport({ periodStart, periodEnd, type: "ON_DEMAND", requestedById: session.user.id });
  return NextResponse.json({ data: report }, { status: report.status === "FAILED" ? 502 : 201 });
});
