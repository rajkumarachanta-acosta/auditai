export interface ResumeVariant {
  key: string;
  label: string;
}

const VARIANTS: ResumeVariant[] = [
  { key: "customer-success", label: "Customer Success" },
  { key: "retail-media-adops", label: "Retail Media & Ad Ops" },
  { key: "country-head-gm", label: "Country Head / GM" },
];

const CUSTOMER_SUCCESS_KEYWORDS = ["customer success", "client success", "account management", "client experience"];
const AD_OPS_KEYWORDS = [
  "retail media",
  "ad operations",
  "ad ops",
  "advertising",
  "dsp",
  "ppc",
  "sponsored products",
  "performance marketing",
  "media buying",
  "programmatic",
];

// Threshold above which a job auto-gets tagged "saved" with a resume variant note.
export const AUTO_SAVE_THRESHOLD = 80;

export function classifyResumeVariant(title: string): ResumeVariant {
  const t = title.toLowerCase();
  if (CUSTOMER_SUCCESS_KEYWORDS.some((k) => t.includes(k))) return VARIANTS[0];
  if (AD_OPS_KEYWORDS.some((k) => t.includes(k))) return VARIANTS[1];
  return VARIANTS[2];
}

export function autoSaveNote(title: string): string {
  const variant = classifyResumeVariant(title);
  return `Apply with resume: ${variant.label}`;
}
