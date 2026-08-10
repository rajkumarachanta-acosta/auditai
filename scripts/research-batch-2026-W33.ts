// ── Weekly research batch — 2026-W33 ──
// First real batch for the Retail Media Lead Engine. Every fact below has a
// cited public source (job postings, company site, Wikipedia, corporate IR
// page). Every score input is a judgment call made from that evidence — see
// inline comments where evidence was too thin to award a point. No emails
// were guessed; contact is via public LinkedIn profile URLs only.
//
// Run: npx tsx scripts/research-batch-2026-W32.ts

import { randomUUID } from "node:crypto";
import { scoreLead, ScoreInputs } from "../lib/leads/scoring";
import { validateEmail, validateLinkedinDm } from "../lib/leads/messageRules";
import { upsertLead, isDuplicate, readLeads } from "../lib/leads/store";
import { isoWeek } from "../lib/leads/weeklyReport";
import { Lead } from "../lib/leads/types";

const WEEK = isoWeek(new Date("2026-08-10"));
const TODAY = new Date().toISOString();

function buildLead(partial: Omit<Lead, "id" | "score" | "status" | "dateAdded" | "weekAdded"> & { scoreInputs: ScoreInputs }): Lead {
  const { scoreInputs, ...rest } = partial;
  return {
    ...rest,
    id: randomUUID(),
    score: scoreLead(scoreInputs),
    status: "Researched",
    dateAdded: TODAY,
    weekAdded: WEEK,
  };
}

// ── 1. Growve — Tier A ──
const growve = buildLead({
  company: "Growve",
  website: "https://www.growve.com",
  country: "US",
  amazonPresence: [
    { label: "Self-described as \"one of the largest multi-brand sellers on Amazon\"", source: "https://www.growve.com/", observedAt: TODAY },
  ],
  walmartPresence: [], // Walmart appears only as a brick-and-mortar retail partner (see signals) — not confirmed as Walmart.com/Walmart Connect presence, so kept out of this field
  person: {
    name: "Audrey McCarty",
    title: "EVP, Marketplace Operations",
    linkedinUrl: "https://www.linkedin.com/in/audrey-mccarty-76956046/",
  },
  signals: [
    { kind: "company", confidence: "confirmed", label: "17+ owned brands across nutrition, supplements, personal care, pet wellness — ~2,000 products", source: "https://www.growve.com/", observedAt: TODAY },
    { kind: "company", confidence: "confirmed", label: "$450MM+ revenue, 650+ employees, double-digit annual growth", source: "https://www.growve.com/", observedAt: TODAY },
    { kind: "company", confidence: "confirmed", label: "Also distributes through brick-and-mortar retail partners including Walmart, Kroger, Whole Foods, Sprouts, Natural Grocers (not confirmed as Walmart.com/Walmart Connect advertising presence)", source: "https://www.growve.com/", observedAt: TODAY },
    { kind: "pain", confidence: "confirmed", label: "Actively hiring Amazon PPC & Growth Specialists for the health/supplements/household brand portfolio", source: "https://www.glassdoor.com/job-listing/amazon-ppc-specialist-hybrid-growve-philippines-JV_KO0,28_KE29,47.htm?jl=1009726942405", observedAt: TODAY },
    { kind: "pain", confidence: "hypothesis", label: "Running consistent PPC bidding, keyword hygiene, and reporting across 17+ brands and ~2,000 SKUs is plausibly a workload bottleneck given the active hiring", source: "Inference from growve.com scale claims + open PPC reqs", observedAt: TODAY },
  ],
  trigger: {
    label: "Open Amazon PPC & Growth Specialist req, health/supplements/household brands",
    source: "https://www.glassdoor.com/job-listing/amazon-ppc-specialist-hybrid-growve-philippines-JV_KO0,28_KE29,47.htm?jl=1009726942405",
    observedAt: TODAY,
    whyNow: "Growve is actively backfilling Amazon PPC capacity while running one of the largest multi-brand Amazon storefronts in health/wellness — a natural moment to show automation that reduces reliance on headcount scaling 1:1 with SKU count.",
  },
  productRelevance: "Campaign Optimization",
  outreachAngle: "Show how AI-driven bid/keyword optimization keeps PPC consistent across 17+ brands without headcount scaling linearly with SKU count.",
  problemHypothesis: "Hypothesis: managing PPC bidding, keyword hygiene, and reporting consistently across 17+ brands and ~2,000 SKUs may be creating a workload bottleneck — reflected in the active Amazon PPC hiring. Not confirmed with campaign-level data.",
  source: "WebSearch: Amazon PPC / Retail Media hiring signals, Aug 2026",
  scoreInputs: {
    strongAmazonPresence: true,
    significantProductCatalog: true,
    multipleBrandsOrCategories: true,
    amazonAndWalmartPresence: false, // Walmart is a retail (in-store) partner, not confirmed as a Walmart.com/Connect advertiser
    strongEcommercePresence: true,
    hiringRetailMediaSpecialists: true,
    evidenceOfOperationalComplexity: true,
    largeAdvertisingOperation: true, // $450MM+ rev, "largest multi-brand Amazon seller," 17+ brands run through one ad org
    manualWorkflowSignals: false, // not directly evidenced
    decisionMakerIdentified: true,
    personDirectlyResponsibleForRoles: true,
    strongRecentTrigger: true,
    specificPersonalizationOpportunity: true,
    validPublicContactInfo: true, // verified LinkedIn profile; no email guessed
  },
});

const growveEmailBody = `Hi Audrey,

Growve's Amazon PPC listings show you're running paid campaigns across 17+ brands and roughly 2,000 SKUs — and you're currently hiring to keep up with it.

I'd guess keeping bids, keyword hygiene, and reporting consistent across that many product lines eats a lot of hours every week.

I've been building AI workflows that automate that part of Amazon retail-media ops — audits, keyword intelligence, bulk campaign changes.

Worth a quick look at what it catches on one of your brands?`;

const growveLinkedinBody = `Hi Audrey — saw Growve's hiring for Amazon PPC support across your 17+ brand portfolio. Keeping campaign hygiene and reporting consistent at that scale is rarely simple. I've been building AI workflows that automate a lot of that retail-media grind. Open to a quick exchange on how your team handles it today?`;

growve.emailDraft = {
  ...validateEmail(growveEmailBody),
  subjectOptions: ["Amazon PPC across 17+ brands", "Question about Growve's Amazon ops"],
};
growve.linkedinDraft = validateLinkedinDm(growveLinkedinBody);

// ── 2. Newell Brands — Tier A ──
const newell = buildLead({
  company: "Newell Brands",
  website: "https://www.newellbrands.com",
  country: "US",
  amazonPresence: [
    { label: "Multiple concurrent open roles dedicated to Amazon retail media: National Account Manager – Amazon, Associate Manager Retail Media – Amazon, Senior Director Media (Amazon retail-media experience valued, $209K-$255K)", source: "https://jobs.newellbrands.com/", observedAt: TODAY },
  ],
  walmartPresence: [],
  person: {
    name: "Tambi Younes",
    title: "VP, eCommerce",
    linkedinUrl: "https://www.linkedin.com/in/tambi/",
  },
  signals: [
    { kind: "company", confidence: "confirmed", label: "14 major brands (Rubbermaid, Sharpie, Graco, Coleman, Yankee Candle, Paper Mate, FoodSaver, Dymo, EXPO, Elmer's, Oster, NUK, Spontex, Campingaz) across writing instruments, baby gear, food storage, home fragrance, small appliances, outdoor, drinkware, commercial cleaning", source: "https://ir.newellbrands.com/corporate-profile/", observedAt: TODAY },
    { kind: "pain", confidence: "confirmed", label: "Five+ concurrent open retail-media roles: Amazon account management, media strategy, retail-media billing specialist, omnichannel activation, shopper marketing", source: "https://jobs.newellbrands.com/", observedAt: TODAY },
    { kind: "pain", confidence: "confirmed", label: "Dedicated \"Specialist - Retail Media Billing\" role manages billing across a Direct Bill model with retail-media agencies", source: "https://jobs.newellbrands.com/job/Chennai-Specialist-Retail-Media-Billing-Tami/1318944500/", observedAt: TODAY },
    { kind: "pain", confidence: "hypothesis", label: "The concurrent hiring wave and dedicated billing-reconciliation role suggest campaign execution and cross-agency reporting may be stretching the current team", source: "Inference from simultaneous open reqs on jobs.newellbrands.com", observedAt: TODAY },
  ],
  trigger: {
    label: "Simultaneous open reqs across Amazon account management, media strategy, and retail-media billing",
    source: "https://jobs.newellbrands.com/",
    observedAt: TODAY,
    whyNow: "Newell has five-plus retail-media roles open at once right now, including a dedicated billing-reconciliation specialist — a concrete signal that retail-media operations are scaling faster than the team supporting them.",
  },
  productRelevance: "Retail Media Reporting",
  outreachAngle: "Focus on how automated retail-media reporting/reconciliation could cut the manual work behind the new billing-specialist hire.",
  problemHypothesis: "Hypothesis: simultaneous open reqs across Amazon account management, media strategy, and retail-media billing suggest campaign execution and cross-agency reporting reconciliation may be stretching the existing team. Not confirmed with internal headcount or spend data.",
  source: "WebSearch: Amazon/retail-media hiring signals at large multi-brand CPG companies, Aug 2026",
  scoreInputs: {
    strongAmazonPresence: true,
    significantProductCatalog: true,
    multipleBrandsOrCategories: true,
    amazonAndWalmartPresence: false, // Walmart presence highly likely for a company this size but not sourced this session
    strongEcommercePresence: true,
    hiringRetailMediaSpecialists: true,
    evidenceOfOperationalComplexity: true,
    largeAdvertisingOperation: true,
    manualWorkflowSignals: false,
    decisionMakerIdentified: true,
    personDirectlyResponsibleForRoles: true,
    strongRecentTrigger: true,
    specificPersonalizationOpportunity: true,
    validPublicContactInfo: true,
  },
});

const newellEmailBody = `Hi Tambi,

Newell's careers page currently lists several open retail-media roles at once — Amazon account management, media strategy, even a dedicated retail-media billing specialist.

That kind of hiring push across a dozen-plus brands usually means campaign execution and agency reporting are stretching the team thin right now.

I've been building AI workflows that automate the campaign audit, keyword, and reporting work behind large Amazon retail-media programs.

Curious if that would be useful to see against one brand?`;

const newellLinkedinBody = `Hi Tambi — noticed Newell has several retail-media roles open right now, including Amazon account management and a dedicated billing specialist. That's a lot of hiring for one function. I've been building AI workflows that automate a good chunk of that operational work. Open to a quick exchange on how the team handles it today?`;

newell.emailDraft = {
  ...validateEmail(newellEmailBody),
  subjectOptions: ["Newell's Amazon retail-media hiring", "Question about Newell's Amazon ops"],
};
newell.linkedinDraft = validateLinkedinDm(newellLinkedinBody);

// ── 3. Garan, Incorporated — Tier B (intelligence card only; no outreach draft required at Tier B) ──
const garan = buildLead({
  company: "Garan, Incorporated",
  website: "https://www.garanimals.com",
  country: "US",
  amazonPresence: [
    { label: "Garanimals sold online via Amazon (and Walmart.com)", source: "https://en.wikipedia.org/wiki/Garanimals", observedAt: TODAY },
  ],
  walmartPresence: [
    { label: "Garanimals is a Walmart-distributed brand, sold extensively on Walmart.com", source: "https://www.walmart.com/brand/garanimals/10005825", observedAt: TODAY },
  ],
  person: {
    name: "Kristen Campolattaro",
    title: "Chief Marketing Officer, Children's Apparel",
    linkedinUrl: "https://www.linkedin.com/in/kristen-campolattaro-346a6",
  },
  signals: [
    { kind: "company", confidence: "confirmed", label: "Garanimals + 365 kids sub-line distributed across Walmart.com, Amazon, and select brick-and-mortar (Fred Meyer, Kroger, Burlington) — Berkshire Hathaway subsidiary since 2002", source: "https://en.wikipedia.org/wiki/Garanimals", observedAt: TODAY },
    { kind: "pain", confidence: "confirmed", label: "Actively hiring a Retail Media Director (Amazon and Walmart.com) at $200K, explicitly to establish the company's first in-house retail media function, reporting to the CMO", source: "https://www.mediabistro.com/jobs/3539799815-retail-media-director-amazon-and-walmartcom", observedAt: TODAY },
    { kind: "pain", confidence: "confirmed", label: "Role explicitly requires experience in apparel e-commerce and SKU-intensive categories, plus cross-functional coordination with merchandising and inventory teams", source: "https://www.mediabistro.com/jobs/3539799815-retail-media-director-amazon-and-walmartcom", observedAt: TODAY },
    { kind: "pain", confidence: "hypothesis", label: "Because there is no in-house retail media function yet, Amazon/Walmart campaign management is plausibly being run manually or through an external agency today", source: "Inference from job posting language: \"establishing the company's first in-house retail media function\"", observedAt: TODAY },
  ],
  trigger: {
    label: "New $200K Retail Media Director req (Amazon + Walmart.com), posted ~2 months before Aug 2026",
    source: "https://www.mediabistro.com/jobs/3539799815-retail-media-director-amazon-and-walmartcom",
    observedAt: TODAY,
    whyNow: "Garan is standing up its first-ever in-house retail media function across Amazon and Walmart.com — the gap between today's (likely manual/agency-run) operations and that new hire landing is exactly the window to show what automation covers.",
  },
  productRelevance: "AI Retail Media Operations",
  outreachAngle: "Offer to show what an AI-run campaign audit looks like on Garanimals' current Amazon/Walmart campaigns while the in-house function is still being built out.",
  problemHypothesis: "Hypothesis: with no in-house retail media function until this hire lands, Amazon/Walmart campaign management may today be handled manually or via an external agency, creating reporting and hand-off overhead. Not confirmed — no visibility into Garan's current operating model.",
  source: "WebSearch: Amazon/Walmart retail-media hiring signals, Aug 2026",
  scoreInputs: {
    strongAmazonPresence: false, // presence confirmed, scale not evidenced — kept conservative
    significantProductCatalog: true, // job posting: "SKU-intensive categories"
    multipleBrandsOrCategories: true, // Garanimals + 365 kids sub-line, multi-retailer distribution
    amazonAndWalmartPresence: true,
    strongEcommercePresence: true, // $200K new senior hire building a dedicated function
    hiringRetailMediaSpecialists: true,
    evidenceOfOperationalComplexity: true, // SKU-intensive apparel + multi-platform + cross-functional coordination, per job posting
    largeAdvertisingOperation: false, // no spend/campaign-count evidence
    manualWorkflowSignals: false, // hypothesis only, not scored
    decisionMakerIdentified: true,
    personDirectlyResponsibleForRoles: true, // role reports directly to this CMO
    strongRecentTrigger: true,
    specificPersonalizationOpportunity: true,
    validPublicContactInfo: true, // verified LinkedIn profile; no email guessed
  },
});

// ── Write batch ──
const existing = readLeads();
const batch: Lead[] = [growve, newell, garan];

for (const lead of batch) {
  if (isDuplicate(existing, lead.website, lead.person?.name)) {
    console.log(`Skipping duplicate: ${lead.company}`);
    continue;
  }
  upsertLead(lead);
  console.log(`Added ${lead.company} — Tier ${lead.score.tier} (${lead.score.total}/100)`);
  if (lead.emailDraft && !lead.emailDraft.valid) console.warn(`  Email draft issues: ${lead.emailDraft.issues.join("; ")}`);
  if (lead.linkedinDraft && !lead.linkedinDraft.valid) console.warn(`  LinkedIn draft issues: ${lead.linkedinDraft.issues.join("; ")}`);
}
