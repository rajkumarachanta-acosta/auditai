import { Resend } from "resend";
import { createLogger } from "../logger";
import type { ReportSections } from "../services/report.service";

const logger = createLogger("email");

function reportHtml(report: { periodStart: Date; periodEnd: Date; sections: ReportSections }): string {
  const s = report.sections;
  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : "<p><em>None this period.</em></p>");

  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; color:#111; max-width:640px;">
      <h1 style="font-size:20px;">Reachy Weekly Intelligence Report</h1>
      <p style="color:#666; font-size:12px;">${report.periodStart.toDateString()} – ${report.periodEnd.toDateString()}</p>
      <h2 style="font-size:15px;">Executive Summary</h2>
      <p>${escapeHtml(s.executiveSummary)}</p>
      <h2 style="font-size:15px;">Top Pain Points</h2>
      <ol>${s.topPainPoints.map((p) => `<li><strong>[${p.opportunityScore}]</strong> ${escapeHtml(p.problem)}</li>`).join("")}</ol>
      <h2 style="font-size:15px;">Emerging Trends</h2>
      ${list(s.emergingTrends)}
      <h2 style="font-size:15px;">Recommendations</h2>
      ${list(s.recommendations)}
      <p style="color:#999; font-size:11px; margin-top:24px;">Full report, including competitor analysis and revenue opportunities, is attached as a PDF.</p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendReportEmail(args: {
  to: string[];
  report: { periodStart: Date; periodEnd: Date; sections: ReportSections };
  pdfBuffer: Buffer;
}) {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY not set — skipping report email");
    return { sent: false, reason: "RESEND_API_KEY not set" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.REACHY_REPORT_FROM_EMAIL || "reachy@a-one.local";

  await resend.emails.send({
    from,
    to: args.to,
    subject: `Reachy Weekly Intelligence Report — ${args.report.periodStart.toDateString()}`,
    html: reportHtml(args.report),
    attachments: [{ filename: "reachy-weekly-report.pdf", content: args.pdfBuffer }],
  });

  return { sent: true };
}
