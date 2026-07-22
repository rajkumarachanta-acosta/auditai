import { Profile } from "./profile";
import { RawJob } from "./sources/types";
import { mapPool } from "./concurrency";

export interface MatchedJob extends RawJob {
  matchScore: number;
  matchReason: string;
  visaSponsorship: boolean | null;
}

const BATCH_SIZE = 15;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function profileSummary(p: Profile): string {
  return [
    `Target titles: ${p.target_titles.join(", ") || "any"}`,
    `Seniority: ${p.seniority || "unspecified"}`,
    `Years experience: ${p.years_experience ?? "unspecified"}`,
    `Key skills: ${p.skills.join(", ") || "unspecified"}`,
    `Acceptable locations/countries: ${p.locations.join(", ") || "any"}`,
    `Remote only: ${p.remote_only ? "yes" : "no"}`,
    `Needs visa sponsorship: ${p.visa_sponsorship_needed ? `yes, from ${p.visa_from_country || "unspecified"} to ${p.visa_to_countries.join(", ") || "unspecified"}` : "no"}`,
    `Salary floor: ${p.salary_floor ? `${p.salary_floor} ${p.salary_currency}` : "unspecified"}`,
    `Exclude companies: ${p.excluded_companies.join(", ") || "none"}`,
    `Exclude if description mentions: ${p.excluded_keywords.join(", ") || "none"}`,
    p.resume_text ? `Resume summary: ${p.resume_text.slice(0, 1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function scoreBatch(profile: Profile, jobs: RawJob[]): Promise<MatchedJob[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // No key configured — fall back to unscored pass-through so the pipeline still works.
    return jobs.map((j) => ({ ...j, matchScore: 50, matchReason: "Unscored (no OPENAI_API_KEY set)", visaSponsorship: null }));
  }

  const listing = jobs
    .map(
      (j, i) =>
        `[${i}] Title: ${j.title}\nCompany: ${j.company}\nLocation: ${j.location || "unspecified"}\nRemote: ${j.remote ?? "unknown"}\nDescription: ${(j.description || "").slice(0, 600)}`
    )
    .join("\n---\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You score job postings against a candidate profile for a job-search dashboard. " +
            "For each posting return: score (0-100 relevance/fit), reason (one short sentence), " +
            "visaSponsorship (true/false/null if the posting text mentions or implies visa/work-permit sponsorship, relocation assistance, or is silent on it). " +
            'Respond with strict JSON: {"results":[{"index":0,"score":0,"reason":"","visaSponsorship":null}, ...]} — one entry per posting, in order.',
        },
        {
          role: "user",
          content: `CANDIDATE PROFILE:\n${profileSummary(profile)}\n\nPOSTINGS:\n${listing}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    return jobs.map((j) => ({ ...j, matchScore: 50, matchReason: "Scoring unavailable (API error)", visaSponsorship: null }));
  }

  const out = await res.json();
  let parsed: { results?: Array<{ index: number; score: number; reason: string; visaSponsorship: boolean | null }> } = {};
  try {
    parsed = JSON.parse(out?.choices?.[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }

  const byIndex = new Map((parsed.results || []).map((r) => [r.index, r]));
  return jobs.map((j, i) => {
    const r = byIndex.get(i);
    return {
      ...j,
      matchScore: r?.score ?? 40,
      matchReason: r?.reason ?? "Not scored by model",
      visaSponsorship: r?.visaSponsorship ?? null,
    };
  });
}

const BATCH_CONCURRENCY = 6;

export async function matchJobs(profile: Profile, jobs: RawJob[]): Promise<MatchedJob[]> {
  const batches = chunk(jobs, BATCH_SIZE);
  const scored = await mapPool(batches, BATCH_CONCURRENCY, (batch) => scoreBatch(profile, batch));
  return scored.flat();
}
