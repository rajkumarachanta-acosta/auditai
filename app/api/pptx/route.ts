import { NextRequest, NextResponse } from "next/server";
import { generatePptx } from "@/lib/pptxGenerator";
import { AuditResult } from "@/lib/auditEngine";

export async function POST(req: NextRequest) {
  try {
    const { audit, brandName } = await req.json() as { audit: AuditResult; brandName?: string };
    if (!audit) return NextResponse.json({ error: "Missing audit data" }, { status: 400 });

    const buffer = await generatePptx(audit, brandName ?? "Your Account");
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${(brandName ?? "Account").replace(/\s+/g, "_")}_Audit.pptx"`,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to generate presentation" }, { status: 500 });
  }
}
