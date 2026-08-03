import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/reachy/cron-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { generateWeeklyReport } from "@/lib/reachy/services/report.service";
import { renderReportPdf } from "@/lib/reachy/pdf/report-pdf";
import { sendReportEmail } from "@/lib/reachy/email/report-email";
import { prisma } from "@/lib/reachy/db";
import { createLogger } from "@/lib/reachy/logger";
import type { ReportSections } from "@/lib/reachy/services/report.service";

const logger = createLogger("cron:report");

export const maxDuration = 300;

const handler = withErrorHandling(async (req: Request) => {
  requireCronSecret(req);

  const report = await generateWeeklyReport();

  let emailResult: { sent: boolean; reason?: string } = { sent: false, reason: "Report not ready" };
  if (report.status === "READY" && report.sections) {
    const admins = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "MANAGER"] } }, select: { email: true } });
    const recipients = admins.map((a) => a.email);
    if (recipients.length > 0) {
      const sections = report.sections as unknown as ReportSections;
      const pdfBuffer = await renderReportPdf({
        type: report.type,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        createdAt: report.createdAt,
        sections,
      });
      emailResult = await sendReportEmail({
        to: recipients,
        report: { periodStart: report.periodStart, periodEnd: report.periodEnd, sections },
        pdfBuffer,
      });
      if (emailResult.sent) {
        await prisma.report.update({ where: { id: report.id }, data: { emailedTo: recipients } });
      }
    }
  }

  logger.info("Weekly report cron complete", { reportId: report.id, status: report.status, email: emailResult });

  return NextResponse.json({ data: { report, email: emailResult } });
});

export const GET = handler;
export const POST = handler;
