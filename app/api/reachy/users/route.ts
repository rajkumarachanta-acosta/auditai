import { NextResponse } from "next/server";
import { requireRole } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { prisma } from "@/lib/reachy/db";

export const GET = withErrorHandling(async () => {
  await requireRole("ADMIN");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return NextResponse.json({ data: users });
});
