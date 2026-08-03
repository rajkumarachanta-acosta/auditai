import { NextResponse } from "next/server";
import { requireSession } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { listCompetitorsWithStats } from "@/lib/reachy/repositories/competitor.repository";

export const GET = withErrorHandling(async () => {
  await requireSession();
  const competitors = await listCompetitorsWithStats();
  return NextResponse.json({
    data: competitors.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      website: c.website,
      strengths: c.strengths,
      weaknesses: c.weaknesses,
      marketGaps: c.marketGaps,
      features: c.features,
      pricing: c.pricing,
      mentionCount: c._count.mentions,
      lastCheckedAt: c.lastCheckedAt,
    })),
  });
});
