// ── Flat-file persistence for the lead pool ──
// Source of truth is data/leads.json, committed to git.
//
// IMPORTANT: Vercel's production filesystem is read-only at request time
// (writes only land in /tmp, which does not persist between invocations or
// across instances). Reads always work — the dashboard and API routes can
// safely read data/leads.json in any environment. Writes made through these
// functions persist reliably in local dev; in production they are the
// mechanism the weekly Routine and Claude Code sessions use when running
// with a real git checkout, followed by `git commit && git push`. The
// deployed app itself should be treated as read-only.

import fs from "node:fs";
import path from "node:path";
import { Lead, WeeklyReport } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_PATH = path.join(DATA_DIR, "leads.json");
const REPORTS_DIR = path.join(DATA_DIR, "weekly-reports");

export function readLeads(): Lead[] {
  try {
    const raw = fs.readFileSync(LEADS_PATH, "utf-8");
    return JSON.parse(raw) as Lead[];
  } catch {
    return [];
  }
}

export function writeLeads(leads: Lead[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2) + "\n", "utf-8");
}

export function getLead(id: string): Lead | undefined {
  return readLeads().find((l) => l.id === id);
}

export function upsertLead(lead: Lead): Lead[] {
  const leads = readLeads();
  const idx = leads.findIndex((l) => l.id === lead.id);
  if (idx >= 0) leads[idx] = lead;
  else leads.push(lead);
  writeLeads(leads);
  return leads;
}

export function updateLead(id: string, patch: Partial<Lead>): Lead | undefined {
  const leads = readLeads();
  const idx = leads.findIndex((l) => l.id === id);
  if (idx === -1) return undefined;
  const existing = leads[idx];
  if (!existing) return undefined;
  leads[idx] = { ...existing, ...patch, id: existing.id };
  writeLeads(leads);
  return leads[idx];
}

export function deleteLead(id: string): void {
  const leads = readLeads().filter((l) => l.id !== id);
  writeLeads(leads);
}

// Dedup key: company site + person name, so the same person at the same
// company is never added to the pool twice (section 11, step 2-3).
export function isDuplicate(leads: Lead[], website: string, personName?: string): boolean {
  const normSite = website.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return leads.some((l) => {
    const site = l.website.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    if (site !== normSite) return false;
    if (!personName) return true;
    return (l.person?.name ?? "").toLowerCase() === personName.toLowerCase();
  });
}

export function alreadyContacted(leads: Lead[], website: string): boolean {
  const normSite = website.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const contactedStatuses = new Set([
    "Contacted", "Connected", "Replied", "Meeting Requested",
    "Meeting Booked", "Pilot", "Customer", "Not Interested", "Do Not Contact",
  ]);
  return leads.some((l) => {
    const site = l.website.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    return site === normSite && contactedStatuses.has(l.status);
  });
}

export function readWeeklyReports(): WeeklyReport[] {
  try {
    const files = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), "utf-8")) as WeeklyReport)
      .sort((a, b) => (a.week < b.week ? 1 : -1));
  } catch {
    return [];
  }
}

export function writeWeeklyReport(report: WeeklyReport): void {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS_DIR, `${report.week}.json`),
    JSON.stringify(report, null, 2) + "\n",
    "utf-8"
  );
}
