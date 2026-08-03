import PDFDocument from "pdfkit";
import type { ReportSections } from "../services/report.service";

interface ReportForPdf {
  type: string;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
  sections: ReportSections;
}

function section(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(1);
  doc.fontSize(14).fillColor("#111111").text(title, { underline: false });
  doc.moveDown(0.3);
  doc.fontSize(10.5).fillColor("#333333");
}

function bulletList(doc: PDFKit.PDFDocument, items: string[], empty = "None this period.") {
  if (items.length === 0) {
    doc.fillColor("#888888").text(empty);
    doc.fillColor("#333333");
    return;
  }
  for (const item of items) {
    doc.text(`•  ${item}`, { indent: 10 });
  }
}

export function renderReportPdf(report: ReportForPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const s = report.sections;

    doc.fontSize(20).fillColor("#111111").text("Reachy Weekly Intelligence Report", { align: "left" });
    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(
        `${report.type === "WEEKLY" ? "Weekly" : "On-demand"} report · ${report.periodStart.toDateString()} – ${report.periodEnd.toDateString()} · generated ${report.createdAt.toDateString()}`
      );

    section(doc, "Executive Summary");
    doc.text(s.executiveSummary);

    section(doc, "Top Pain Points");
    if (s.topPainPoints.length === 0) {
      doc.fillColor("#888888").text("No pain points detected this period.");
      doc.fillColor("#333333");
    } else {
      s.topPainPoints.forEach((p, i) => {
        doc.fillColor("#111111").text(`${i + 1}. [${p.opportunityScore}] ${p.problem}`, { indent: 0 });
        doc.fillColor("#666666").fontSize(9).text(`${p.category ?? "Uncategorized"} · ${p.sellerType}`, { indent: 14 });
        doc.fontSize(10.5).fillColor("#333333");
      });
    }

    section(doc, "Emerging Trends");
    bulletList(doc, s.emergingTrends);

    section(doc, "Competitor Analysis");
    if (s.competitorAnalysis.length === 0) {
      doc.fillColor("#888888").text("No competitor mentions this period.");
      doc.fillColor("#333333");
    } else {
      for (const c of s.competitorAnalysis) {
        doc.text(`•  ${c.competitorName} — ${c.mentionCount} mention(s)`, { indent: 10 });
      }
    }

    section(doc, "Feature Ideas");
    bulletList(doc, s.featureIdeas);

    section(doc, "Products Worth Building");
    bulletList(doc, s.productsWorthBuilding);

    section(doc, "Revenue Opportunities");
    bulletList(doc, s.revenueOpportunities);

    section(doc, "Recommendations");
    bulletList(doc, s.recommendations);

    doc.end();
  });
}
