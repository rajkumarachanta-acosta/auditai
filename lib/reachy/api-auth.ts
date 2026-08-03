import { auth, hasRole } from "./auth";
import type { Role } from "./generated/prisma/enums";
import { ForbiddenError, UnauthorizedError } from "./errors";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  return session;
}

export async function requireRole(minimum: Role) {
  const session = await requireSession();
  if (!hasRole(session.user.role, minimum)) throw new ForbiddenError();
  return session;
}
