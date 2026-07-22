import { NextRequest } from "next/server";

// Vercel Cron sends "Authorization: Bearer $CRON_SECRET" automatically when a
// CRON_SECRET env var is set — this stops randoms from POSTing your endpoints
// and triggering paid OpenAI calls or emails on your behalf.
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured yet — allow (dev/local convenience)
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
