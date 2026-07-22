import { sql } from "./db";
import { Profile, emptyProfile } from "./profile";
import { fetchGreenhouse } from "./sources/greenhouse";
import { fetchLever } from "./sources/lever";
import { fetchWorkday } from "./sources/workday";
import { fetchRemotive } from "./sources/remotive";
import { fetchRemoteOk } from "./sources/remoteok";
import { fetchArbeitnow } from "./sources/arbeitnow";
import { fetchAdzuna } from "./sources/adzuna";
import { RawJob, jobId } from "./sources/types";
import { matchJobs } from "./matcher";
import { adzunaCountriesFromProfile } from "./countries";
import { mapPool } from "./concurrency";

// Bounds run time (serverless function budget) and OpenAI spend per run.
// Newest postings are kept first when a run turns up more than this.
const MAX_JOBS_PER_RUN = 400;
const DB_WRITE_CONCURRENCY = 20;

interface ProfileRow {
  target_titles: string[] | null;
  skills: string[] | null;
  years_experience: number | null;
  seniority: string | null;
  locations: string[] | null;
  remote_only: boolean;
  visa_sponsorship_needed: boolean;
  visa_from_country: string | null;
  visa_to_countries: string[] | null;
  salary_floor: number | null;
  salary_currency: string | null;
  excluded_companies: string[] | null;
  excluded_keywords: string[] | null;
  resume_text: string | null;
}

async function loadProfile(): Promise<Profile> {
  const db = sql();
  const rows = (await db`select * from profile where id = 1`) as ProfileRow[];
  if (!rows.length) return emptyProfile;
  const r = rows[0];
  return {
    target_titles: r.target_titles || [],
    skills: r.skills || [],
    years_experience: r.years_experience,
    seniority: r.seniority,
    locations: r.locations || [],
    remote_only: r.remote_only,
    visa_sponsorship_needed: r.visa_sponsorship_needed,
    visa_from_country: r.visa_from_country,
    visa_to_countries: r.visa_to_countries || [],
    salary_floor: r.salary_floor,
    salary_currency: r.salary_currency || "USD",
    excluded_companies: r.excluded_companies || [],
    excluded_keywords: r.excluded_keywords || [],
    resume_text: r.resume_text,
  };
}

interface TargetCompanyRow {
  ats: string;
  token: string;
  workday_dc: string | null;
  workday_site: string | null;
  display_name: string | null;
}

async function loadTargetCompanies(): Promise<TargetCompanyRow[]> {
  const db = sql();
  return (await db`select ats, token, workday_dc, workday_site, display_name from target_companies where enabled = true`) as TargetCompanyRow[];
}

function dedupe(jobs: RawJob[]): RawJob[] {
  const seen = new Set<string>();
  const out: RawJob[] = [];
  for (const j of jobs) {
    const id = jobId(j.source, j.externalId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(j);
  }
  return out;
}

function applyHardFilters(jobs: RawJob[], profile: Profile): RawJob[] {
  const excludedCompanies = profile.excluded_companies.map((c) => c.toLowerCase());
  const excludedKeywords = profile.excluded_keywords.map((k) => k.toLowerCase());
  return jobs.filter((j) => {
    if (excludedCompanies.includes(j.company.toLowerCase())) return false;
    const haystack = `${j.title} ${j.description || ""}`.toLowerCase();
    if (excludedKeywords.some((k) => haystack.includes(k))) return false;
    return true;
  });
}

export interface CollectionResult {
  fetched: number;
  processed: number;
  matched: number;
  companiesQueried: number;
}

export async function runCollection(): Promise<CollectionResult> {
  const profile = await loadProfile();
  const companies = await loadTargetCompanies();
  const searchTerms = profile.target_titles.length ? profile.target_titles : ["software engineer"];

  const jobLists: RawJob[][] = [];

  await Promise.all(
    companies.map(async (c) => {
      try {
        if (c.ats === "greenhouse") jobLists.push(await fetchGreenhouse(c.token, c.display_name || undefined));
        else if (c.ats === "lever") jobLists.push(await fetchLever(c.token, c.display_name || undefined));
        else if (c.ats === "workday" && c.workday_dc && c.workday_site)
          jobLists.push(await fetchWorkday(c.token, c.workday_dc, c.workday_site, c.display_name || undefined));
      } catch {
        // one company failing shouldn't kill the whole run
      }
    })
  );

  await Promise.all(
    searchTerms.map(async (term) => {
      try {
        jobLists.push(await fetchRemotive(term));
      } catch {
        /* ignore */
      }
    })
  );

  try {
    jobLists.push(await fetchRemoteOk(searchTerms));
  } catch {
    /* ignore */
  }
  try {
    jobLists.push(await fetchArbeitnow(searchTerms));
  } catch {
    /* ignore */
  }

  const adzunaCountries = adzunaCountriesFromProfile(profile.locations, profile.visa_to_countries);
  await Promise.all(
    adzunaCountries.flatMap((country) =>
      searchTerms.map(async (term) => {
        try {
          jobLists.push(await fetchAdzuna(country, term));
        } catch {
          /* ignore */
        }
      })
    )
  );

  const all = dedupe(jobLists.flat());
  const filtered = applyHardFilters(all, profile)
    .sort((a, b) => (b.postedAt || "").localeCompare(a.postedAt || ""))
    .slice(0, MAX_JOBS_PER_RUN);

  const matched = await matchJobs(profile, filtered);

  const db = sql();
  await mapPool(matched, DB_WRITE_CONCURRENCY, async (j) => {
    const id = jobId(j.source, j.externalId);
    await db`
      insert into jobs (id, source, external_id, title, company, location, remote, country, visa_sponsorship, url, description, salary_text, posted_at, match_score, match_reason)
      values (${id}, ${j.source}, ${j.externalId}, ${j.title}, ${j.company}, ${j.location || null}, ${j.remote ?? false}, ${j.country || null}, ${j.visaSponsorship}, ${j.url}, ${j.description || null}, ${j.salaryText || null}, ${j.postedAt || null}, ${j.matchScore}, ${j.matchReason})
      on conflict (id) do update set
        match_score = excluded.match_score,
        match_reason = excluded.match_reason,
        visa_sponsorship = excluded.visa_sponsorship,
        collected_at = now()
    `;
  });

  return { fetched: all.length, processed: filtered.length, matched: matched.length, companiesQueried: companies.length };
}
