import type { NextAuthConfig } from "next-auth";
import type { Role } from "./generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
  interface User {
    role?: Role;
  }
}

export type ReachyJWT = { id?: string; role?: Role; [key: string]: unknown };

/**
 * Edge-safe config: no Prisma adapter, no providers that touch Node APIs
 * (bcrypt, the database). This is what `proxy.ts` runs on the Edge runtime
 * for optimistic route gating. The authoritative check still happens in
 * `app/reachy/layout.tsx` and each API route via the full config in `auth.ts`.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token }) {
      return token;
    },
    async session({ session, token }) {
      const t = token as ReachyJWT;
      if (session.user) {
        session.user.id = t.id ?? "";
        session.user.role = t.role ?? "VIEWER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
