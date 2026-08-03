"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import clsx from "clsx";
import { AI_EMPLOYEES } from "@/lib/reachy/employees";

export function Sidebar({ user }: { user: { name?: string | null; email?: string | null; role: string } }) {
  const pathname = usePathname();
  const reachy = AI_EMPLOYEES.find((e) => e.id === "reachy")!;
  const comingSoon = AI_EMPLOYEES.filter((e) => !e.live);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-900 bg-neutral-950">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="text-sm font-semibold tracking-tight text-neutral-100">
          A <span className="text-emerald-400">One</span>
        </span>
      </div>

      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-neutral-900/60 px-2.5 py-2">
          <reachy.icon className="h-4 w-4 text-emerald-400" />
          <div className="leading-tight">
            <div className="text-sm font-medium text-neutral-100">{reachy.name}</div>
            <div className="text-[11px] text-neutral-500">{reachy.tagline}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {reachy.nav?.map((item) => {
          const active = item.href === "/reachy" ? pathname === "/reachy" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        <div className="mt-6 px-2.5 text-[11px] font-medium uppercase tracking-wider text-neutral-600">
          Future AI Employees
        </div>
        {comingSoon.map((employee) => (
          <div
            key={employee.id}
            className="flex cursor-not-allowed items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-neutral-600"
            title={`${employee.name} — ${employee.tagline}`}
          >
            <span className="flex items-center gap-2.5">
              <employee.icon className="h-4 w-4" />
              {employee.name}
            </span>
            <span className="rounded-full border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-600">
              Soon
            </span>
          </div>
        ))}
      </nav>

      <div className="border-t border-neutral-900 px-3 py-3">
        <div className="flex items-center justify-between gap-2 rounded-md px-1 py-1">
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm text-neutral-200">{user.name ?? user.email}</div>
            <div className="text-[11px] capitalize text-neutral-500">{user.role.toLowerCase()}</div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
