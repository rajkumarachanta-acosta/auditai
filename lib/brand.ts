// ── Brand configuration ──
// Controlled by NEXT_PUBLIC_BRAND env var: "acosta" | "external"
// One codebase, two deployments, two identities.

export type BrandId = "acosta" | "external";

export interface BrandConfig {
  id: BrandId;
  appName: string;
  appTagline: string;
  logoText: string;
  logoAccent: string;          // highlighted part of logo text
  navBg: string;               // top nav background
  navAccent: string;           // accent color in nav
  accentColor: string;         // primary CTA / link color
  accentHover: string;
  scoreCardBg: string;
  uploadHeading: string;
  uploadSubtext: string;
  poweredBy: string;
  supportEmail: string;
  showApiKeyOption: boolean;   // external users bring their own key
  apiKeyLabel: string;
  footerText: string;
  faviconEmoji: string;
}

const ACOSTA: BrandConfig = {
  id: "acosta",
  appName: "Acosta Audit Engine",
  appTagline: "Amazon Campaign Intelligence — Internal",
  logoText: "Acosta",
  logoAccent: "AI",
  navBg: "#0f1923",
  navAccent: "#e8501a",          // Acosta orange
  accentColor: "#e8501a",
  accentHover: "#c43d10",
  scoreCardBg: "#0f1923",
  uploadHeading: "Acosta Campaign Audit",
  uploadSubtext: "Upload Amazon advertising and sales reports to run a full audit. Data is processed in your browser — never stored.",
  poweredBy: "Acosta Commerce",
  supportEmail: "analytics@acosta.com",
  showApiKeyOption: false,       // key baked in via env var for internal
  apiKeyLabel: "OpenAI Key",
  footerText: "Acosta Commerce · Internal Tool · Confidential",
  faviconEmoji: "📊",
};

const EXTERNAL: BrandConfig = {
  id: "external",
  appName: "AuditAI",
  appTagline: "Amazon Campaign Intelligence",
  logoText: "Audit",
  logoAccent: "AI",
  navBg: "#1a1f2e",
  navAccent: "#3b82d4",
  accentColor: "#3b82d4",
  accentHover: "#2563eb",
  scoreCardBg: "#1a1f2e",
  uploadHeading: "Campaign Intelligence",
  uploadSubtext: "Upload your Amazon advertising and sales reports and start asking questions instantly. Your data is processed in your browser — nothing is sent to any server.",
  poweredBy: "AuditAI",
  supportEmail: "hello@auditad.ai",
  showApiKeyOption: true,        // external users enter their own key
  apiKeyLabel: "OpenAI API Key",
  footerText: "AuditAI · Your data never leaves your browser",
  faviconEmoji: "🔍",
};

export function getBrand(): BrandConfig {
  const env = process.env.NEXT_PUBLIC_BRAND;
  if (env === "acosta") return ACOSTA;
  return EXTERNAL; // default to external/neutral
}

export const brand = getBrand();
