"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Bookmark,
  CheckCircle2,
  EyeOff,
  Globe2,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Stamp,
  ThumbsDown,
  Inbox,
  ArrowUpRight,
} from "lucide-react";
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

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="surface-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-muted)" }}>
        <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          {icon}
        </span>
        {label}
      </div>
      <div className="tabular mt-2.5 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${tone.fg} ${score * 3.6}deg, var(--surface-2) 0deg)` }}
    >
      <div
        className="tabular flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold"
        style={{ background: "var(--surface-1)", color: tone.fg }}
      >
        {score}
      </div>
    </div>
  );
}

function JobCardSkeleton() {
  return (
    <div className="surface-card rounded-2xl p-4">
      <div className="skeleton h-4 w-2/3 rounded" />
      <div className="skeleton mt-2.5 h-3 w-1/3 rounded" />
      <div className="mt-4 flex gap-2">
        <div className="skeleton h-6 w-16 rounded-full" />
        <div className="skeleton h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

const actionBtn =
  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all hover:-translate-y-px hover:shadow-sm";

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

  const inputBorder = { background: "var(--surface-1)", border: "1px solid var(--border)" };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
            Matched postings ranked by fit to your profile.
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="accent-gradient flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-px disabled:opacity-60 disabled:hover:translate-y-0"
          style={{ boxShadow: "var(--shadow-accent)" }}
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {running ? "Running…" : "Run collection now"}
        </button>
      </div>

      {runMsg && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "var(--accent-soft)", color: "var(--ink-secondary)", border: "1px solid var(--border)" }}>
          {runMsg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<Inbox size={13} />} label="Showing" value={stats.count} />
        <StatTile icon={<Sparkles size={13} />} label="Avg. match score" value={stats.count ? `${stats.avg}/100` : "—"} />
        <StatTile icon={<Globe2 size={13} />} label="Remote" value={stats.remote} />
        <StatTile icon={<Stamp size={13} />} label="Visa sponsorship" value={stats.visa} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full p-1" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className="rounded-full px-3.5 py-1.5 text-sm font-medium transition-all"
              style={
                status === t.key
                  ? { background: "var(--accent)", color: "white", boxShadow: "var(--shadow-accent)" }
                  : { color: "var(--ink-secondary)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-muted)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title or company…"
            className="w-full rounded-xl py-2.5 pl-9 pr-3 text-sm outline-none transition-shadow focus:shadow-sm"
            style={inputBorder}
          />
        </div>
        <label className="flex items-center gap-2.5 text-sm whitespace-nowrap" style={{ color: "var(--ink-secondary)" }}>
          Min score <span className="tabular w-8 text-right font-semibold" style={{ color: "var(--ink-primary)" }}>{minScore}</span>
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
        <div className="surface-card rounded-2xl px-6 py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <Inbox size={20} />
          </div>
          <p className="mt-4 text-sm font-medium">No jobs here yet</p>
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
                className="surface-card group rounded-2xl p-4 transition-all hover:-translate-y-0.5"
                style={{ boxShadow: "var(--shadow-sm)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <a href={j.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline">
                      {j.title}
                      <ArrowUpRight size={14} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                    </a>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm" style={{ color: "var(--ink-secondary)" }}>
                      <span className="font-medium">{j.company}</span>
                      {j.location && (
                        <span className="inline-flex items-center gap-1" style={{ color: "var(--ink-muted)" }}>
                          <MapPin size={12} /> {j.location}
                        </span>
                      )}
                      {j.posted_at && <span style={{ color: "var(--ink-muted)" }}>· {timeAgo(j.posted_at)}</span>}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
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
                      <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--ink-muted)" }}>
                        {j.match_reason}
                      </p>
                    )}
                  </div>
                  {j.match_score !== null && (
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <ScoreRing score={j.match_score} />
                      <div className="text-[11px] font-medium" style={{ color: tone.fg }}>
                        {tone.label}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <button onClick={() => setJobStatus(j.id, "saved")} className={actionBtn} style={inputBorder}>
                    <Bookmark size={13} /> Save
                  </button>
                  <button onClick={() => setJobStatus(j.id, "applied")} className={actionBtn} style={{ background: "var(--good-soft)", color: "var(--good)" }}>
                    <CheckCircle2 size={13} /> Applied
                  </button>
                  <button onClick={() => setJobStatus(j.id, "hidden")} className={actionBtn} style={inputBorder}>
                    <EyeOff size={13} /> Hide
                  </button>
                  <button onClick={() => setJobStatus(j.id, "rejected")} className={actionBtn} style={inputBorder}>
                    <ThumbsDown size={13} /> Not interested
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
