export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}

export interface ScoreTone {
  fg: string;
  bg: string;
  label: string;
}

export function scoreTone(score: number | null): ScoreTone {
  if (score === null) return { fg: "var(--ink-muted)", bg: "var(--surface-2)", label: "Unscored" };
  if (score >= 75) return { fg: "var(--good)", bg: "var(--good-soft)", label: "Strong match" };
  if (score >= 50) return { fg: "var(--warning)", bg: "var(--warning-soft)", label: "Possible match" };
  return { fg: "var(--ink-muted)", bg: "var(--surface-2)", label: "Weak match" };
}
