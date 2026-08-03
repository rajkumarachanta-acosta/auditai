import { PageHeader } from "@/components/reachy/stat-card";
import { UserRoleTable } from "@/components/reachy/user-role-table";
import { requireSession } from "@/lib/reachy/api-auth";
import { prisma } from "@/lib/reachy/db";

export default async function SettingsPage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "ADMIN";

  const users = isAdmin
    ? await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true } })
    : [];

  return (
    <div>
      <PageHeader title="Settings" description="Your profile and workspace access." />
      <div className="space-y-8 px-8 py-6">
        <div className="rounded-xl border border-neutral-900 bg-neutral-900/30 p-4 text-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Signed in as</div>
          <div className="mt-1 text-neutral-200">{session.user.name ?? session.user.email}</div>
          <div className="text-neutral-500">{session.user.email}</div>
          <div className="mt-2 inline-block rounded-full border border-neutral-800 px-2 py-0.5 text-xs capitalize text-neutral-400">
            {session.user.role.toLowerCase()}
          </div>
        </div>

        {isAdmin && (
          <div>
            <h2 className="mb-3 text-sm font-medium text-neutral-300">Users</h2>
            <UserRoleTable users={users} currentUserId={session.user.id} />
          </div>
        )}
      </div>
    </div>
  );
}
