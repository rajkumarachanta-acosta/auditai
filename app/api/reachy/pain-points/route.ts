import { NextResponse } from "next/server";
import { requireSession } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { searchPainPoints } from "@/lib/reachy/repositories/pain-point.repository";
import { parsePainPointFilters } from "@/lib/reachy/pain-point-query";

export const GET = withErrorHandling(async (req: Request) => {
  await requireSession();
  const { searchParams } = new URL(req.url);
  const filters = parsePainPointFilters(searchParams);
  const result = await searchPainPoints(filters);
  return NextResponse.json(result);
});
