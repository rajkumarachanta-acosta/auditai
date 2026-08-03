"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";

export function LoginForm({ callbackUrl, googleEnabled }: { callbackUrl: string; googleEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await signIn("credentials", { email, password, redirect: false, callbackUrl });
      if (res?.error) {
        setError("Invalid email or password.");
        return;
      }
      window.location.href = res?.url ?? callbackUrl;
    });
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm text-neutral-400" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm text-neutral-400" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-neutral-600">
            <div className="h-px flex-1 bg-neutral-800" />
            OR
            <div className="h-px flex-1 bg-neutral-800" />
          </div>
          <button
            onClick={() => signIn("google", { callbackUrl })}
            className="w-full rounded-lg border border-neutral-800 px-3 py-2 text-sm font-medium text-neutral-100 transition hover:bg-neutral-900"
          >
            Continue with Google
          </button>
        </>
      )}
    </div>
  );
}
