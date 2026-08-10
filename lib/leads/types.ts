// ── Retail Media Lead Engine — data model ──
// See AGENTS.md build spec: "Raj's Weekly Retail Media Lead Generation & Outreach Engine"

export type Country = "US" | "CA" | "UK" | "AU";

export type Tier = "A" | "B" | "C" | "Unqualified";

// Every factual claim must carry a source; every assumption must be labelled.
export interface Evidence {
  label: string;       // e.g. "Hiring 5 Amazon PPC specialists"
  source: string;       // URL or citation for the claim
  observedAt: string;   // ISO date the evidence was gathered
}

export interface Signal extends Evidence {
  kind: "company" | "pain";
  confidence: "confirmed" | "hypothesis"; // confirmed = directly observed; hypothesis = inferred
}

export interface DecisionMaker {
  name: string;
  title: string;
  linkedinUrl?: string;
  email?: string;          // only if publicly available & legitimately sourced — never guessed
  emailSource?: string;    // required if email is set
}

export type ProductRelevance =
  | "Campaign Audit"
  | "Keyword Intelligence"
  | "Bulk Campaign Creation"
  | "Campaign Optimization"
  | "Retail Media Reporting"
  | "AI Retail Media Operations";

export interface ScoreBreakdown {
  companyFit: number;          // 0-30
  companyFitDetail: string[];
  painSignals: number;         // 0-30
  painSignalsDetail: string[];
  buyerFit: number;            // 0-20
  buyerFitDetail: string[];
  outreachOpportunity: number; // 0-20
  outreachOpportunityDetail: string[];
  total: number;                // 0-100
  tier: Tier;
}

export type FunnelStatus =
  | "New"
  | "Researched"
  | "Draft Ready"
  | "Contacted"
  | "Connected"
  | "Replied"
  | "Meeting Requested"
  | "Meeting Booked"
  | "Pilot"
  | "Customer"
  | "Not Interested"
  | "Do Not Contact";

export interface OutreachMessage {
  body: string;
  wordCount: number;
  valid: boolean;
  issues: string[];
}

export interface EmailDraft extends OutreachMessage {
  subjectOptions: [string, string];
  gmailDraftId?: string;
}

export interface Lead {
  id: string;
  company: string;
  website: string;
  country: Country;
  companySizeEstimate?: string;   // e.g. "500-1000 employees" — sourced, never guessed

  amazonPresence: Evidence[];
  walmartPresence: Evidence[];

  person?: DecisionMaker;

  signals: Signal[];
  trigger?: Evidence & { whyNow: string };

  score: ScoreBreakdown;

  productRelevance?: ProductRelevance;
  outreachAngle?: string;         // one sentence: what Raj should talk about
  problemHypothesis?: string;     // clearly labelled hypothesis, not fact

  emailDraft?: EmailDraft;
  linkedinDraft?: OutreachMessage;

  status: FunnelStatus;
  dateAdded: string;   // ISO date
  dateContacted?: string;
  lastFollowUp?: string;
  response?: string;
  source: string;       // where this lead was discovered
  weekAdded: string;    // ISO week, e.g. "2026-W32"

  notes?: string;
}

export interface WeeklyReport {
  week: string;
  generatedAt: string;
  newLeads: number;
  tierA: number;
  tierB: number;
  tierC: number;
  amazonFocused: number;
  amazonAndWalmart: number;
  newCompanies: number;
  previouslyContacted: number;
  topFive: {
    company: string;
    score: number;
    person: string;
    title: string;
    whyNow: string;
    observedSignal: string;
    likelyPain: string;
    recommendedAngle: string;
    emailDraftReady: boolean;
    linkedinDraftReady: boolean;
  }[];
}
