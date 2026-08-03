import { NextResponse } from "next/server";
import { requireSession } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { getPainPointDetail } from "@/lib/reachy/repositories/pain-point.repository";
import { NotFoundError } from "@/lib/reachy/errors";

export const GET = withErrorHandling(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireSession();
  const { id } = await params;
  const painPoint = await getPainPointDetail(id);
  if (!painPoint) throw new NotFoundError("Pain point not found");
  return NextResponse.json({ data: painPoint });
});
