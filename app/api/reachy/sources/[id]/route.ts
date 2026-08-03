import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/reachy/db";
import { Prisma } from "@/lib/reachy/generated/prisma/client";
import { getConnector } from "@/lib/reachy/connectors/registry";
import { requireRole } from "@/lib/reachy/api-auth";
import { withErrorHandling } from "@/lib/reachy/api-handler";
import { NotFoundError, ValidationError } from "@/lib/reachy/errors";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = withErrorHandling(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireRole("ADMIN");
  const { id } = await params;

  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) throw new NotFoundError("Source not found");

  const connector = getConnector(source.key);
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) throw new ValidationError("Invalid source update", parsed.error.flatten());

  if (parsed.data.enabled && connector && !connector.implemented) {
    throw new ValidationError(`${connector.name} isn't implemented yet and can't be enabled.`);
  }

  const updated = await prisma.source.update({
    where: { id },
    data: {
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.config !== undefined ? { config: parsed.data.config as Prisma.InputJsonValue } : {}),
    },
  });

  return NextResponse.json({ data: updated });
});
