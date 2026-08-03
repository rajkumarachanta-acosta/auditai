import { UnauthorizedError } from "./errors";

export function requireCronSecret(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new Error("CRON_SECRET is not configured");

  const header = req.headers.get("authorization");
  if (header !== `Bearer ${expected}`) throw new UnauthorizedError("Invalid cron secret");
}
