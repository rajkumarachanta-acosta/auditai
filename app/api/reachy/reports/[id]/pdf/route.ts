import { requireSession } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { getReportDetail } from "@/lib/reachy/repositories/report.repository";
import { renderReportPdf } from "@/lib/reachy/pdf/report-pdf";
import { NotFoundError, ValidationError } from "@/lib/reachy/errors";
import type { ReportSections } from "@/lib/reachy/services/report.service";

export const GET = withErrorHandling(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await params;
  const report = await getReportDetail(id);
  if (!report) throw new NotFoundError("Report not found");
  if (!report.sections) throw new ValidationError("Report has no sections yet");

  const pdfBuffer = await renderReportPdf({
    type: report.type,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    createdAt: report.createdAt,
    sections: report.sections as unknown as ReportSections,
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="reachy-report-${report.id}.pdf"`,
    },
  });
});
