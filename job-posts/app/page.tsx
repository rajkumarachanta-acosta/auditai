"use client";

import { useEffect, useState, useCallback } from "react";

interface Job {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  visa_sponsorship: boolean | null;
  url: string;
  match_score: number | null;
  match_reason: string | null;
  status: string;
  posted_at: string | null;
  notes: string | null;
}

const STATUS_TABS = ["new", "saved", "applied", "all", "hidden", "rejected"] as const;

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("new");
  const [minScore, setMinScore] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status, minScore: String(minScore) });
    if (q) params.set("q", q);
    const res = await fetch(`/api/jobs?${params}`);
    const data = await res.json();
    setJobs(data.jobs ?? []);
    setLoading(false);
  }, [status, minScore, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function setJobStatus(id: string, newStatus: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
  }

  async function runNow() {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await fetch("/api/collect", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setRunMsg(`Found ${data.fetched}, scored ${data.matched} (capped at ${data.processed}) across ${data.companiesQueried} target companies.`);
        load();
      } else {
        setRunMsg(`Failed: ${data.error}`);
      }
    } catch (e) {
      setRunMsg(e instanceof Error ? e.message : "Failed to run collection");
    }
    setRunning(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setStatus(t)}
              className={`rounded-full px-3 py-1 text-sm capitalize ${
                status === t
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-neutral-200 dark:bg-neutral-800"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {running ? "Running…" : "Run collection now"}
        </button>
      </div>

      {runMsg && <p className="text-sm text-neutral-600 dark:text-neutral-400">{runMsg}</p>}

      <div className="flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or company…"
          className="flex-1 min-w-[200px] rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm dark:border-neutral-700"
        />
        <label className="flex items-center gap-2 text-sm">
          Min score {minScore}
          <input
            type="range"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No jobs here yet. Set up your profile, then click &quot;Run collection now&quot; (or wait for the daily cron).
        </p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <a href={j.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                    {j.title}
                  </a>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {j.company}
                    {j.location ? ` · ${j.location}` : ""}
                    {j.remote ? " · Remote" : ""}
                    {j.visa_sponsorship ? " · Visa sponsorship likely" : ""}
                    {" · via "}
                    {j.source}
                  </p>
                  {j.match_reason && <p className="mt-1 text-sm text-neutral-500">{j.match_reason}</p>}
                </div>
                {j.match_score !== null && (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-xs font-semibold dark:bg-neutral-800">
                    {j.match_score}/100
                  </span>
                )}
              </div>
              <div className="mt-3 flex gap-2 text-sm">
                <button onClick={() => setJobStatus(j.id, "saved")} className="rounded-md border px-2 py-1 dark:border-neutral-700">
                  Save
                </button>
                <button onClick={() => setJobStatus(j.id, "applied")} className="rounded-md border px-2 py-1 dark:border-neutral-700">
                  Applied
                </button>
                <button onClick={() => setJobStatus(j.id, "hidden")} className="rounded-md border px-2 py-1 dark:border-neutral-700">
                  Hide
                </button>
                <button onClick={() => setJobStatus(j.id, "rejected")} className="rounded-md border px-2 py-1 dark:border-neutral-700">
                  Not interested
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
