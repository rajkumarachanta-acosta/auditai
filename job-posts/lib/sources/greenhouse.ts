import { RawJob } from "./types";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string } | null;
  content?: string;
  updated_at: string;
  first_published?: string;
  company_name?: string;
}

export async function fetchGreenhouse(token: string, displayName?: string): Promise<RawJob[]> {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { jobs?: GreenhouseJob[] };
  if (!data.jobs) return [];

  return data.jobs.map((j) => {
    const location = j.location?.name ?? "";
    return {
      source: "greenhouse",
      externalId: `${token}-${j.id}`,
      title: j.title,
      company: j.company_name || displayName || token,
      location,
      remote: /remote/i.test(location),
      url: j.absolute_url,
      description: j.content?.replace(/<[^>]+>/g, " ").trim(),
      postedAt: j.first_published || j.updated_at,
    };
  });
}
