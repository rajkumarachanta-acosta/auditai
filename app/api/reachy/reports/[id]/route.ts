import { NextResponse } from "next/server";
import { requireSession } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { getReportDetail } from "@/lib/reachy/repositories/report.repository";
import { NotFoundError } from "@/lib/reachy/errors";

export const GET = withErrorHandling(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await params;
  const report = await getReportDetail(id);
  if (!report) throw new NotFoundError("Report not found");
  return NextResponse.json({ data: report });
});
