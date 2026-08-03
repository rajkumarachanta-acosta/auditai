"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, subDays } from "date-fns";

export function GenerateReportForm() {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/reachy/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodStart, periodEnd }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Failed to generate report");
        return;
      }
      router.push(`/reachy/reports/${json.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-900 bg-neutral-900/30 p-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500" htmlFor="periodStart">
          From
        </label>
        <input
          id="periodStart"
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500" htmlFor="periodEnd">
          To
        </label>
        <input
          id="periodEnd"
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-60"
      >
        {pending ? "Generating…" : "Generate report"}
      </button>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </form>
  );
}
