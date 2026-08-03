import { NextResponse } from "next/server";
import { prisma } from "@/lib/reachy/db";
import { runSource } from "@/lib/reachy/services/ingestion.service";
import { processUnprocessedRawItems } from "@/lib/reachy/services/pain-point.service";
import { requireRole } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { NotFoundError } from "@/lib/reachy/errors";

export const POST = withErrorHandling(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireRole("ADMIN");
  const { id } = await params;

  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) throw new NotFoundError("Source not found");

  const result = await runSource(source.key);
  const analysis = await processUnprocessedRawItems({ sourceId: source.id });

  return NextResponse.json({ data: { ingestion: result, analysis } });
});
