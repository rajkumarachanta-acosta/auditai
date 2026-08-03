"use client";

import { useState, useTransition } from "react";

export function EmailReportForm({ reportId }: { reportId: string }) {
  const [emails, setEmails] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const to = emails
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (to.length === 0) return;

    startTransition(async () => {
      const res = await fetch(`/api/reachy/reports/${reportId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus(json?.error?.message ?? "Failed to send");
      } else if (json.data.sent) {
        setStatus("Sent.");
      } else {
        setStatus(json.data.reason ?? "Not sent");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        placeholder="email1@company.com, email2@company.com"
        className="w-64 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-900 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email report"}
      </button>
      {status && <span className="text-xs text-neutral-500">{status}</span>}
    </form>
  );
}
