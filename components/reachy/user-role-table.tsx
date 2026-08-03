"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "MANAGER" | "VIEWER";
}

export function UserRoleTable({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function updateRole(id: string, role: string) {
    await fetch(`/api/reachy/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-900">
      <table className="w-full text-sm">
        <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium text-right">Role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-900">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3">
                <div className="text-neutral-200">{u.name ?? u.email}</div>
                <div className="text-xs text-neutral-500">{u.email}</div>
              </td>
              <td className="px-4 py-3 text-right">
                <select
                  defaultValue={u.role}
                  disabled={u.id === currentUserId}
                  onChange={(e) => updateRole(u.id, e.target.value)}
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 disabled:opacity-50"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
