import { RawJob } from "./types";

interface AdzunaResult {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string };
  redirect_url: string;
  description: string;
  created: string;
  salary_min?: number;
  salary_max?: number;
}

// Adzuna needs a free app_id/app_key from developer.adzuna.com. `country` is a
// 2-letter code among the markets Adzuna covers (us, gb, de, ca, au, in, ...) —
// this is how international/remote-friendly coverage gets extended beyond the US.
export async function fetchAdzuna(country: string, what: string): Promise<RawJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) return [];

  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${appId}&app_key=${appKey}&results_per_page=50&what=${encodeURIComponent(what)}&content-type=application/json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: AdzunaResult[] };
  if (!data.results) return [];

  return data.results.map((j) => ({
    source: `adzuna-${country}`,
    externalId: j.id,
    title: j.title,
    company: j.company?.display_name || "Unknown",
    location: j.location?.display_name,
    remote: /remote/i.test(j.title + " " + (j.location?.display_name || "")),
    country,
    url: j.redirect_url,
    description: j.description,
    salaryText:
      j.salary_min || j.salary_max
        ? `${j.salary_min ?? "?"}–${j.salary_max ?? "?"}`
        : undefined,
    postedAt: j.created,
  }));
}
