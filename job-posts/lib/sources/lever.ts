import { RawJob } from "./types";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  categories?: { location?: string };
  createdAt?: number;
  descriptionPlain?: string;
}

export async function fetchLever(token: string, displayName?: string): Promise<RawJob[]> {
  const res = await fetch(`https://api.lever.co/v0/postings/${token}?mode=json`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as LeverPosting[] | { ok: false };
  if (!Array.isArray(data)) return [];

  return data.map((j) => {
    const location = j.categories?.location ?? "";
    return {
      source: "lever",
      externalId: j.id,
      title: j.text,
      company: displayName || token,
      location,
      remote: /remote/i.test(location),
      url: j.hostedUrl,
      description: j.descriptionPlain,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined,
    };
  });
}
