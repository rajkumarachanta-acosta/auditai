import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { prisma } from "@/lib/reachy/db";
import { ValidationError } from "@/lib/reachy/errors";

const patchSchema = z.object({ role: z.enum(["ADMIN", "MANAGER", "VIEWER"]) });

export const PATCH = withErrorHandling(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireRole("ADMIN");
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) throw new ValidationError("Invalid role update", parsed.error.flatten());

  const updated = await prisma.user.update({ where: { id }, data: { role: parsed.data.role } });
  return NextResponse.json({ data: { id: updated.id, role: updated.role } });
});
