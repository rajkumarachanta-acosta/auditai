import { RawJob } from "./types";

interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags: string[];
  job_types: string[];
  location: string;
  created_at: number; // unix seconds
}

export async function fetchArbeitnow(keywords: string[]): Promise<RawJob[]> {
  const res = await fetch("https://www.arbeitnow.com/api/job-board-api", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: ArbeitnowJob[] };
  if (!data.data) return [];

  const lower = keywords.map((k) => k.toLowerCase());
  const matched = lower.length
    ? data.data.filter((j) => {
        const haystack = `${j.title} ${(j.tags || []).join(" ")}`.toLowerCase();
        return lower.some((k) => haystack.includes(k));
      })
    : data.data;

  return matched.slice(0, 50).map((j) => ({
    source: "arbeitnow",
    externalId: j.slug,
    title: j.title,
    company: j.company_name,
    location: j.location,
    remote: Boolean(j.remote),
    url: j.url,
    description: j.description?.replace(/<[^>]+>/g, " ").trim(),
    postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : undefined,
  }));
}
