// ── Weekly Prospecting Report generator — AGENTS.md section 12 ──

import { Lead, WeeklyReport } from "./types";

export function isoWeek(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function buildWeeklyReport(allLeads: Lead[], week: string = isoWeek()): WeeklyReport {
  const weekLeads = allLeads.filter((l) => l.weekAdded === week);
  const tierA = weekLeads.filter((l) => l.score.tier === "A");
  const tierB = weekLeads.filter((l) => l.score.tier === "B");
  const tierC = weekLeads.filter((l) => l.score.tier === "C");

  const amazonFocused = weekLeads.filter((l) => l.amazonPresence.length > 0 && l.walmartPresence.length === 0).length;
  const amazonAndWalmart = weekLeads.filter((l) => l.amazonPresence.length > 0 && l.walmartPresence.length > 0).length;

  const priorCompanies = new Set(
    allLeads
      .filter((l) => l.weekAdded !== week)
      .map((l) => l.website.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))
  );
  const newCompanies = weekLeads.filter(
    (l) => !priorCompanies.has(l.website.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))
  ).length;

  const previouslyContacted = weekLeads.filter((l) =>
    ["Contacted", "Connected", "Replied", "Meeting Requested", "Meeting Booked", "Pilot", "Customer"].includes(l.status)
  ).length;

  const topFive = [...weekLeads]
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, 5)
    .map((l) => ({
      company: l.company,
      score: l.score.total,
      person: l.person?.name ?? "Not yet identified",
      title: l.person?.title ?? "",
      whyNow: l.trigger?.whyNow ?? "No trigger recorded",
      observedSignal: l.signals.find((s) => s.confidence === "confirmed")?.label ?? "None recorded",
      likelyPain: l.problemHypothesis ?? "Not yet assessed",
      recommendedAngle: l.outreachAngle ?? "Not yet assessed",
      emailDraftReady: !!l.emailDraft?.valid,
      linkedinDraftReady: !!l.linkedinDraft?.valid,
    }));

  return {
    week,
    generatedAt: new Date().toISOString(),
    newLeads: weekLeads.length,
    tierA: tierA.length,
    tierB: tierB.length,
    tierC: tierC.length,
    amazonFocused,
    amazonAndWalmart,
    newCompanies,
    previouslyContacted,
    topFive,
  };
}
