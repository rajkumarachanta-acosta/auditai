"use client";
import { useEffect, useState, useMemo } from "react";
import { Lead, FunnelStatus, Tier } from "@/lib/leads/types";

const TIER_COLOR: Record<Tier, string> = {
  A: "bg-emerald-100 text-emerald-800 border-emerald-300",
  B: "bg-amber-100 text-amber-800 border-amber-300",
  C: "bg-slate-100 text-slate-700 border-slate-300",
  Unqualified: "bg-red-100 text-red-700 border-red-300",
};

const STATUSES: FunnelStatus[] = [
  "New", "Researched", "Draft Ready", "Contacted", "Connected", "Replied",
  "Meeting Requested", "Meeting Booked", "Pilot", "Customer", "Not Interested", "Do Not Contact",
];

function useLeads() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/leads")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setLeads(data.leads ?? []); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  function reload() { setReloadToken((t) => t + 1); }
  return { leads: leads ?? [], loading: leads === null, reload };
}

export default function LeadsDashboard() {
  const { leads, loading, reload } = useLeads();
  const [tierFilter, setTierFilter] = useState<Tier | "All">("All");
  const [selected, setSelected] = useState<Lead | null>(null);

  const filtered = useMemo(
    () => (tierFilter === "All" ? leads : leads.filter((l) => l.score.tier === tierFilter)),
    [leads, tierFilter]
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => b.score.total - a.score.total), [filtered]);

  const tierCounts = useMemo(() => {
    const c: Record<Tier, number> = { A: 0, B: 0, C: 0, Unqualified: 0 };
    for (const l of leads) c[l.score.tier]++;
    return c;
  }, [leads]);

  async function updateStatus(lead: Lead, status: FunnelStatus) {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(status === "Contacted" ? { dateContacted: new Date().toISOString() } : {}) }),
    });
    if (res.ok) {
      const data = await res.json();
      setSelected(data.lead);
      reload();
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-900 text-white px-6 py-4">
        <h1 className="text-lg font-semibold">Retail Media Lead Engine</h1>
        <p className="text-xs text-slate-400">Internal — weekly prospect pool for Raj. Review, edit, then send manually. Nothing here auto-sends.</p>
      </header>

      <div className="px-6 py-4 flex gap-3 items-center flex-wrap">
        {(["All", "A", "B", "C", "Unqualified"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTierFilter(t)}
            className={`px-3 py-1.5 rounded-full text-sm border ${tierFilter === t ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300 hover:border-slate-500"}`}
          >
            {t === "All" ? `All (${leads.length})` : `Tier ${t} (${tierCounts[t]})`}
          </button>
        ))}
        <span className="text-xs text-slate-500 ml-auto">{loading ? "Loading…" : `${sorted.length} shown`}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 px-6 pb-8">
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-600 text-left">
              <tr>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Person / Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Why now</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${selected?.id === l.id ? "bg-blue-50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full border text-xs font-semibold ${TIER_COLOR[l.score.tier]}`}>
                      {l.score.total}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{l.company}</td>
                  <td className="px-3 py-2 text-slate-600">{l.person ? `${l.person.name} — ${l.person.title}` : "Not identified"}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200">{l.status}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 truncate max-w-[240px]">{l.trigger?.whyNow ?? "—"}</td>
                </tr>
              ))}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No leads yet. Run the weekly discovery workflow to populate the pool.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 h-fit sticky top-4">
          {!selected ? (
            <p className="text-sm text-slate-400">Select a lead to view its intelligence card and outreach drafts.</p>
          ) : (
            <LeadCard lead={selected} onStatusChange={(s) => updateStatus(selected, s)} />
          )}
        </div>
      </div>
    </div>
  );
}

function LeadCard({ lead, onStatusChange }: { lead: Lead; onStatusChange: (s: FunnelStatus) => void }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h2 className="text-base font-semibold">{lead.company}</h2>
        <a href={lead.website} target="_blank" rel="noreferrer" className="text-blue-600 text-xs hover:underline">{lead.website}</a>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-2 py-0.5 rounded border ${TIER_COLOR[lead.score.tier]}`}>Tier {lead.score.tier} · {lead.score.total}/100</span>
          <select
            value={lead.status}
            onChange={(e) => onStatusChange(e.target.value as FunnelStatus)}
            className="text-xs border border-slate-300 rounded px-1.5 py-0.5"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {lead.person && (
        <div>
          <div className="font-medium">{lead.person.name} — {lead.person.title}</div>
          {lead.person.linkedinUrl && <a href={lead.person.linkedinUrl} target="_blank" rel="noreferrer" className="text-blue-600 text-xs hover:underline">LinkedIn ↗</a>}
          {lead.person.email && <div className="text-xs text-slate-500">{lead.person.email} <span className="text-slate-400">(source: {lead.person.emailSource})</span></div>}
        </div>
      )}

      <Section title="Amazon presence" items={lead.amazonPresence} />
      {lead.walmartPresence.length > 0 && <Section title="Walmart presence" items={lead.walmartPresence} />}

      {lead.trigger && (
        <div>
          <div className="font-medium text-xs uppercase text-slate-400 mb-1">Trigger — why now</div>
          <p>{lead.trigger.whyNow}</p>
          <p className="text-xs text-slate-500">Source: {lead.trigger.source}</p>
        </div>
      )}

      <div>
        <div className="font-medium text-xs uppercase text-slate-400 mb-1">Signals</div>
        <ul className="space-y-1">
          {lead.signals.map((s, i) => (
            <li key={i} className="text-xs">
              <span className={`inline-block px-1.5 py-0.5 rounded mr-1 ${s.confidence === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {s.confidence === "confirmed" ? "Observed" : "Hypothesis"}
              </span>
              {s.label} <span className="text-slate-400">({s.source})</span>
            </li>
          ))}
        </ul>
      </div>

      {lead.problemHypothesis && (
        <div>
          <div className="font-medium text-xs uppercase text-slate-400 mb-1">Likely pain (hypothesis)</div>
          <p>{lead.problemHypothesis}</p>
        </div>
      )}

      {lead.productRelevance && (
        <div>
          <div className="font-medium text-xs uppercase text-slate-400 mb-1">Product relevance</div>
          <p>{lead.productRelevance}</p>
        </div>
      )}

      {lead.outreachAngle && (
        <div>
          <div className="font-medium text-xs uppercase text-slate-400 mb-1">Outreach angle</div>
          <p>{lead.outreachAngle}</p>
        </div>
      )}

      {lead.emailDraft && (
        <div className="border-t border-slate-200 pt-3">
          <div className="font-medium text-xs uppercase text-slate-400 mb-1">Email draft ({lead.emailDraft.wordCount} words)</div>
          <div className="text-xs text-slate-600 mb-1">Subject A: {lead.emailDraft.subjectOptions[0]}</div>
          <div className="text-xs text-slate-600 mb-2">Subject B: {lead.emailDraft.subjectOptions[1]}</div>
          <p className="whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded p-2">{lead.emailDraft.body}</p>
          {lead.emailDraft.gmailDraftId && <p className="text-xs text-emerald-600 mt-1">Gmail draft created — ready in Drafts folder</p>}
          {!lead.emailDraft.valid && <p className="text-xs text-red-600 mt-1">{lead.emailDraft.issues.join("; ")}</p>}
        </div>
      )}

      {lead.linkedinDraft && (
        <div>
          <div className="font-medium text-xs uppercase text-slate-400 mb-1">LinkedIn DM ({lead.linkedinDraft.wordCount} words)</div>
          <p className="whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded p-2">{lead.linkedinDraft.body}</p>
          {!lead.linkedinDraft.valid && <p className="text-xs text-red-600 mt-1">{lead.linkedinDraft.issues.join("; ")}</p>}
        </div>
      )}

      <div className="text-xs text-slate-400 border-t border-slate-200 pt-2">
        Added {lead.dateAdded.slice(0, 10)} · Source: {lead.source}
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: { label: string; source: string }[] }) {
  return (
    <div>
      <div className="font-medium text-xs uppercase text-slate-400 mb-1">{title}</div>
      <ul className="space-y-1">
        {items.map((e, i) => (
          <li key={i} className="text-xs">{e.label} <span className="text-slate-400">({e.source})</span></li>
        ))}
      </ul>
    </div>
  );
}
