import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/reachy/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Optimistic, Edge-safe route gating (per Next.js 16 Proxy guidance: fast
 * checks only, not the full auth story). The real, database-backed check
 * still runs in `app/reachy/layout.tsx` (session) and inside each
 * `/api/reachy/*` route (role checks), both on the Node.js runtime.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/reachy/cron")) {
    return NextResponse.next();
  }

  if (!req.auth?.user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in required" } }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAdminWrite = pathname.startsWith("/api/reachy/sources") && req.method !== "GET";
  if (isAdminWrite && req.auth.user.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Admin only" } }, { status: 403 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/reachy/:path*", "/api/reachy/:path*"],
};
