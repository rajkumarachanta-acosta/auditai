import { NextResponse } from "next/server";
import { requireSession } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { getCompetitorDetail } from "@/lib/reachy/repositories/competitor.repository";
import { NotFoundError } from "@/lib/reachy/errors";

export const GET = withErrorHandling(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await params;
  const competitor = await getCompetitorDetail(id);
  if (!competitor) throw new NotFoundError("Competitor not found");
  return NextResponse.json({ data: competitor });
});
