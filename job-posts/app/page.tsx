"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { timeAgo, scoreTone } from "@/lib/format";

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

const STATUS_TABS = [
  { key: "new", label: "New" },
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "all", label: "All" },
  { key: "hidden", label: "Hidden" },
  { key: "rejected", label: "Not interested" },
] as const;

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface-card rounded-xl px-4 py-3.5">
      <div className="text-[13px]" style={{ color: "var(--ink-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function JobCardSkeleton() {
  return (
    <div className="surface-card animate-pulse rounded-xl p-4">
      <div className="h-4 w-2/3 rounded" style={{ background: "var(--surface-2)" }} />
      <div className="mt-2 h-3 w-1/3 rounded" style={{ background: "var(--surface-2)" }} />
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-16 rounded-full" style={{ background: "var(--surface-2)" }} />
        <div className="h-6 w-16 rounded-full" style={{ background: "var(--surface-2)" }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]["key"]>("new");
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

  const stats = useMemo(() => {
    const scored = jobs.filter((j) => j.match_score !== null);
    const avg = scored.length ? Math.round(scored.reduce((s, j) => s + (j.match_score ?? 0), 0) / scored.length) : 0;
    const remote = jobs.filter((j) => j.remote).length;
    const visa = jobs.filter((j) => j.visa_sponsorship).length;
    return { count: jobs.length, avg, remote, visa };
  }, [jobs]);

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

  const inputStyle = "w-full rounded-lg px-3 py-2 text-sm outline-none transition-shadow";
  const inputBorder = { background: "var(--surface-1)", border: "1px solid var(--border)" };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--ink-muted)" }}>
            Matched postings ranked by fit to your profile.
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {running ? "Running…" : "Run collection now"}
        </button>
      </div>

      {runMsg && (
        <div className="rounded-lg px-3.5 py-2.5 text-sm" style={{ background: "var(--accent-soft)", color: "var(--ink-secondary)" }}>
          {runMsg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Showing" value={stats.count} />
        <StatTile label="Avg. match score" value={stats.count ? `${stats.avg}/100` : "—"} />
        <StatTile label="Remote" value={stats.remote} />
        <StatTile label="Visa sponsorship" value={stats.visa} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full p-1" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className="rounded-full px-3 py-1.5 text-sm font-medium transition-colors"
              style={
                status === t.key
                  ? { background: "var(--accent)", color: "white" }
                  : { color: "var(--ink-secondary)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or company…"
          className={inputStyle + " min-w-[220px] flex-1"}
          style={inputBorder}
        />
        <label className="flex items-center gap-2.5 text-sm whitespace-nowrap" style={{ color: "var(--ink-secondary)" }}>
          Min score <span className="w-8 text-right font-medium" style={{ color: "var(--ink-primary)" }}>{minScore}</span>
          <input type="range" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
        </label>
      </div>

      {loading ? (
        <div className="space-y-3">
          <JobCardSkeleton />
          <JobCardSkeleton />
          <JobCardSkeleton />
        </div>
      ) : jobs.length === 0 ? (
        <div className="surface-card rounded-xl px-6 py-14 text-center">
          <p className="text-sm font-medium">No jobs here yet</p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
            Set up your profile, then run a collection — or wait for tomorrow&apos;s automatic run.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => {
            const tone = scoreTone(j.match_score);
            return (
              <li
                key={j.id}
                className="surface-card overflow-hidden rounded-xl border-l-4 p-4"
                style={{ borderLeftColor: tone.fg }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <a href={j.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      {j.title}
                    </a>
                    <p className="mt-0.5 text-sm" style={{ color: "var(--ink-secondary)" }}>
                      {j.company}
                      {j.location ? ` · ${j.location}` : ""}
                      {j.posted_at ? ` · ${timeAgo(j.posted_at)}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {j.remote && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                          Remote
                        </span>
                      )}
                      {j.visa_sponsorship && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--good-soft)", color: "var(--good)" }}>
                          Visa sponsorship likely
                        </span>
                      )}
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--surface-2)", color: "var(--ink-muted)" }}>
                        via {j.source}
                      </span>
                    </div>
                    {j.match_reason && (
                      <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
                        {j.match_reason}
                      </p>
                    )}
                  </div>
                  {j.match_score !== null && (
                    <div className="shrink-0 text-right">
                      <div
                        className="rounded-lg px-2.5 py-1 text-sm font-semibold"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {j.match_score}
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: "var(--ink-muted)" }}>
                        {tone.label}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2 text-sm">
                  <button onClick={() => setJobStatus(j.id, "saved")} className="rounded-lg px-2.5 py-1.5 font-medium transition-colors" style={inputBorder}>
                    Save
                  </button>
                  <button onClick={() => setJobStatus(j.id, "applied")} className="rounded-lg px-2.5 py-1.5 font-medium transition-colors" style={inputBorder}>
                    Applied
                  </button>
                  <button onClick={() => setJobStatus(j.id, "hidden")} className="rounded-lg px-2.5 py-1.5 font-medium transition-colors" style={inputBorder}>
                    Hide
                  </button>
                  <button onClick={() => setJobStatus(j.id, "rejected")} className="rounded-lg px-2.5 py-1.5 font-medium transition-colors" style={inputBorder}>
                    Not interested
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
