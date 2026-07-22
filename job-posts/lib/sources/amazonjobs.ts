import { RawJob } from "./types";

interface AmazonJob {
  id: string;
  title: string;
  city: string;
  state: string;
  country_code: string;
  company_name: string;
  description_short: string;
  posted_date: string;
  job_path: string;
  normalized_location: string;
}

// amazon.jobs runs its own ATS with a public, unauthenticated search endpoint —
// covers Amazon and its subsidiaries (Amazon Pay, Amazon Retail India, etc.),
// including senior/leadership roles that Greenhouse/Lever-based startups don't post.
export async function fetchAmazonJobs(query: string, countryCode?: string): Promise<RawJob[]> {
  const params = new URLSearchParams({ base_query: query, result_limit: "50", offset: "0" });
  if (countryCode) params.set("normalized_country_code[]", countryCode);

  const res = await fetch(`https://www.amazon.jobs/en/search.json?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { jobs?: AmazonJob[] };
  if (!data.jobs) return [];

  return data.jobs
    .filter((j) => !countryCode || j.country_code === countryCode)
    .map((j) => ({
      source: "amazon",
      externalId: j.id,
      title: j.title,
      company: j.company_name?.trim() || "Amazon",
      location: j.normalized_location || [j.city, j.state, j.country_code].filter(Boolean).join(", "),
      remote: /remote/i.test(j.normalized_location || ""),
      country: j.country_code,
      url: `https://www.amazon.jobs${j.job_path}`,
      description: j.description_short,
      postedAt: parseAmazonDate(j.posted_date),
    }));
}

function parseAmazonDate(s: string): string | undefined {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
