import { RawJob } from "./types";

interface WorkdayPosting {
  title: string;
  externalPath: string;
  locationsText: string;
  postedOn: string;
  bulletFields: string[];
}

// Workday's CXS job-search endpoint is per-tenant; you have to discover the
// {tenant, dc, site} triple by opening the company's careers page, watching
// the Network tab for a request to */wday/cxs/*/jobs, and reading it off the URL.
export async function fetchWorkday(
  tenant: string,
  dc: string,
  site: string,
  displayName?: string
): Promise<RawJob[]> {
  const base = `https://${tenant}.${dc}.myworkdayjobs.com`;
  const res = await fetch(`${base}/wday/cxs/${tenant}/${site}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 20, offset: 0, searchText: "" }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { jobPostings?: WorkdayPosting[] };
  if (!data.jobPostings) return [];

  return data.jobPostings.map((j) => ({
    source: "workday",
    externalId: `${tenant}-${j.bulletFields?.[0] || j.externalPath}`,
    title: j.title,
    company: displayName || tenant,
    location: j.locationsText,
    remote: /remote/i.test(j.locationsText || ""),
    url: `${base}/${site}${j.externalPath}`,
  }));
}
