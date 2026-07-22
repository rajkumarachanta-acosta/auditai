export interface RawJob {
  source: string;
  externalId: string;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  country?: string;
  url: string;
  description?: string;
  salaryText?: string;
  postedAt?: string; // ISO 8601
}

export function jobId(source: string, externalId: string): string {
  return `${source}:${externalId}`;
}
