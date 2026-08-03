import { redirect } from "next/navigation";
import { auth } from "@/lib/reachy/auth";
import { Sidebar } from "@/components/reachy/sidebar";

export default async function ReachyLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/reachy");
  }

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <Sidebar user={session.user} />
      <div className="flex-1 overflow-x-hidden">{children}</div>
    </div>
  );
}
