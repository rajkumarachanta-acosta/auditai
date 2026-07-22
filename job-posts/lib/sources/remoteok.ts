import { RawJob } from "./types";

interface RemoteOkJob {
  id?: string;
  slug?: string;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  url?: string;
  location?: string;
  legal?: string; // present only on the first "notice" element
}

export async function fetchRemoteOk(keywords: string[]): Promise<RawJob[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (job-search-agent)" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as RemoteOkJob[];
  const jobs = data.filter((j): j is Required<Pick<RemoteOkJob, "id" | "position" | "company">> & RemoteOkJob =>
    Boolean(j.id && j.position && j.company)
  );

  const lower = keywords.map((k) => k.toLowerCase());
  const matched = lower.length
    ? jobs.filter((j) => {
        const haystack = `${j.position} ${(j.tags || []).join(" ")}`.toLowerCase();
        return lower.some((k) => haystack.includes(k));
      })
    : jobs;

  return matched.slice(0, 50).map((j) => ({
    source: "remoteok",
    externalId: j.id!,
    title: j.position!,
    company: j.company!,
    location: j.location || "Remote",
    remote: true,
    url: j.url || `https://remoteok.com/remote-jobs/${j.slug}`,
    description: j.description?.replace(/<[^>]+>/g, " ").trim(),
    postedAt: j.date,
  }));
}
