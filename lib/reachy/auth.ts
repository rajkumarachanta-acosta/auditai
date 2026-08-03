import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { Role } from "./generated/prisma/enums";
import { authConfig, type ReachyJWT } from "./auth.config";

const providers: NonNullable<NextAuthConfig["providers"]> = [
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email as string | undefined;
      const password = credentials?.password as string | undefined;
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.password) return null;

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return null;

      return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      const t = token as ReachyJWT;
      if (user) {
        t.id = user.id;
        t.role = (user.role as Role) ?? "VIEWER";
      } else if (t.id && !t.role) {
        const dbUser = await prisma.user.findUnique({ where: { id: t.id } });
        t.role = dbUser?.role ?? "VIEWER";
      }
      return t;
    },
  },
});

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  MANAGER: 1,
  ADMIN: 2,
};

export function hasRole(role: Role | undefined, minimum: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
