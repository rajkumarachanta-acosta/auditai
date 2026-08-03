import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { getReportDetail } from "@/lib/reachy/repositories/report.repository";
import { renderReportPdf } from "@/lib/reachy/pdf/report-pdf";
import { sendReportEmail } from "@/lib/reachy/email/report-email";
import { prisma } from "@/lib/reachy/db";
import { NotFoundError, ValidationError } from "@/lib/reachy/errors";
import type { ReportSections } from "@/lib/reachy/services/report.service";

const bodySchema = z.object({ to: z.array(z.email()).min(1) });

export const POST = withErrorHandling(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireRole("MANAGER");
  const { id } = await params;

  const report = await getReportDetail(id);
  if (!report) throw new NotFoundError("Report not found");
  if (!report.sections) throw new ValidationError("Report has no sections yet");

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) throw new ValidationError("Invalid recipients", parsed.error.flatten());

  const sections = report.sections as unknown as ReportSections;
  const pdfBuffer = await renderReportPdf({
    type: report.type,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    createdAt: report.createdAt,
    sections,
  });

  const result = await sendReportEmail({ to: parsed.data.to, report: { periodStart: report.periodStart, periodEnd: report.periodEnd, sections }, pdfBuffer });

  if (result.sent) {
    const existing = Array.isArray(report.emailedTo) ? (report.emailedTo as string[]) : [];
    await prisma.report.update({
      where: { id: report.id },
      data: { emailedTo: [...new Set([...existing, ...parsed.data.to])] },
    });
  }

  return NextResponse.json({ data: result });
});
