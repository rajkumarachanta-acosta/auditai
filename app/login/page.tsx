import { LoginForm } from "@/components/reachy/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="flex flex-col items-center gap-8">
        <div className="text-center">
          <div className="text-2xl font-semibold text-neutral-100">
            A <span className="text-emerald-400">One</span>
          </div>
          <p className="mt-1 text-sm text-neutral-500">Sign in to reach your AI workforce</p>
        </div>
        <LoginForm
          callbackUrl={callbackUrl ?? "/reachy"}
          googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID)}
        />
      </div>
    </main>
  );
}
