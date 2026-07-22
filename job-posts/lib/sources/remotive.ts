import { RawJob } from "./types";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary?: string;
  description: string;
}

export async function fetchRemotive(search: string): Promise<RawJob[]> {
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(search)}&limit=50`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const data = (await res.json()) as { jobs?: RemotiveJob[] };
  if (!data.jobs) return [];

  return data.jobs.map((j) => ({
    source: "remotive",
    externalId: String(j.id),
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location,
    remote: true,
    url: j.url,
    description: j.description?.replace(/<[^>]+>/g, " ").trim(),
    salaryText: j.salary,
    postedAt: j.publication_date,
  }));
}
