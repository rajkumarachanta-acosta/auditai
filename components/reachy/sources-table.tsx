"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2 } from "lucide-react";
import clsx from "clsx";

export interface SourceRow {
  id: string | null;
  key: string;
  name: string;
  description: string;
  implemented: boolean;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

export function SourcesTable({ sources, isAdmin }: { sources: SourceRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function toggle(source: SourceRow) {
    if (!source.id) return;
    setPendingKey(source.key);
    await fetch(`/api/reachy/sources/${source.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !source.enabled }),
    });
    setPendingKey(null);
    startTransition(() => router.refresh());
  }

  async function runNow(source: SourceRow) {
    if (!source.id) return;
    setPendingKey(source.key);
    await fetch(`/api/reachy/sources/${source.id}/run`, { method: "POST" });
    setPendingKey(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-900">
      <table className="w-full text-sm">
        <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Last run</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-900">
          {sources.map((source) => (
            <tr key={source.key}>
              <td className="px-4 py-3">
                <div className="font-medium text-neutral-200">{source.name}</div>
                <div className="mt-0.5 max-w-md text-xs text-neutral-500">{source.description}</div>
              </td>
              <td className="px-4 py-3">
                {!source.implemented ? (
                  <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-xs text-neutral-500">Stub</span>
                ) : source.enabled ? (
                  <span className="rounded-full border border-emerald-900 bg-emerald-950 px-2 py-0.5 text-xs text-emerald-400">
                    Enabled
                  </span>
                ) : (
                  <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-xs text-neutral-500">Disabled</span>
                )}
                {source.lastStatus === "ERROR" && (
                  <span className="ml-2 text-xs text-red-400" title={source.lastError ?? ""}>
                    last run errored
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-400">
                {source.lastRunAt ? new Date(source.lastRunAt).toLocaleString() : "Never"}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  {isAdmin && source.implemented && (
                    <button
                      onClick={() => toggle(source)}
                      disabled={pendingKey === source.key}
                      className={clsx(
                        "rounded-md border px-2.5 py-1 text-xs font-medium transition",
                        source.enabled
                          ? "border-neutral-800 text-neutral-300 hover:bg-neutral-900"
                          : "border-emerald-900 text-emerald-400 hover:bg-emerald-950"
                      )}
                    >
                      {source.enabled ? "Disable" : "Enable"}
                    </button>
                  )}
                  {isAdmin && source.implemented && source.enabled && (
                    <button
                      onClick={() => runNow(source)}
                      disabled={pendingKey === source.key}
                      className="flex items-center gap-1 rounded-md border border-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-900"
                    >
                      {pendingKey === source.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Run now
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
