// ── Lead scoring engine — additive rubric, 0-100 ──
// Mirrors AGENTS.md section 4 exactly. Each input is a signal the researcher
// (human or agent) has confirmed with evidence — this function only adds points,
// it never infers or invents a signal's truth value.

import { ScoreBreakdown, Tier } from "./types";

export interface ScoreInputs {
  // Company fit — 30 pts
  strongAmazonPresence: boolean;      // +10
  significantProductCatalog: boolean; // +5
  multipleBrandsOrCategories: boolean;// +5
  amazonAndWalmartPresence: boolean;  // +5
  strongEcommercePresence: boolean;   // +5

  // Pain signals — 30 pts
  hiringRetailMediaSpecialists: boolean; // +10
  evidenceOfOperationalComplexity: boolean; // +5
  largeAdvertisingOperation: boolean;    // +10
  manualWorkflowSignals: boolean;        // +5

  // Buyer fit — 20 pts
  decisionMakerIdentified: boolean;         // +10
  personDirectlyResponsibleForRoles: boolean; // +10

  // Outreach opportunity — 20 pts
  strongRecentTrigger: boolean;        // +10
  specificPersonalizationOpportunity: boolean; // +5
  validPublicContactInfo: boolean;     // +5
}

function tierFor(total: number): Tier {
  if (total >= 80) return "A";
  if (total >= 65) return "B";
  if (total >= 50) return "C";
  return "Unqualified";
}

export function scoreLead(inputs: ScoreInputs): ScoreBreakdown {
  const companyFitDetail: string[] = [];
  let companyFit = 0;
  if (inputs.strongAmazonPresence) { companyFit += 10; companyFitDetail.push("Strong Amazon presence (+10)"); }
  if (inputs.significantProductCatalog) { companyFit += 5; companyFitDetail.push("Significant product catalog (+5)"); }
  if (inputs.multipleBrandsOrCategories) { companyFit += 5; companyFitDetail.push("Multiple brands/categories (+5)"); }
  if (inputs.amazonAndWalmartPresence) { companyFit += 5; companyFitDetail.push("Amazon + Walmart presence (+5)"); }
  if (inputs.strongEcommercePresence) { companyFit += 5; companyFitDetail.push("Strong ecommerce presence (+5)"); }

  const painSignalsDetail: string[] = [];
  let painSignals = 0;
  if (inputs.hiringRetailMediaSpecialists) { painSignals += 10; painSignalsDetail.push("Hiring retail-media specialists (+10)"); }
  if (inputs.evidenceOfOperationalComplexity) { painSignals += 5; painSignalsDetail.push("Evidence of operational complexity (+5)"); }
  if (inputs.largeAdvertisingOperation) { painSignals += 10; painSignalsDetail.push("Large advertising operation (+10)"); }
  if (inputs.manualWorkflowSignals) { painSignals += 5; painSignalsDetail.push("Manual workflow signals (+5)"); }

  const buyerFitDetail: string[] = [];
  let buyerFit = 0;
  if (inputs.decisionMakerIdentified) { buyerFit += 10; buyerFitDetail.push("Decision-maker identified (+10)"); }
  if (inputs.personDirectlyResponsibleForRoles) { buyerFit += 10; buyerFitDetail.push("Person directly responsible for ecommerce/retail media (+10)"); }

  const outreachOpportunityDetail: string[] = [];
  let outreachOpportunity = 0;
  if (inputs.strongRecentTrigger) { outreachOpportunity += 10; outreachOpportunityDetail.push("Strong recent trigger (+10)"); }
  if (inputs.specificPersonalizationOpportunity) { outreachOpportunity += 5; outreachOpportunityDetail.push("Specific personalization opportunity (+5)"); }
  if (inputs.validPublicContactInfo) { outreachOpportunity += 5; outreachOpportunityDetail.push("Valid public contact information (+5)"); }

  const total = companyFit + painSignals + buyerFit + outreachOpportunity;

  return {
    companyFit,
    companyFitDetail,
    painSignals,
    painSignalsDetail,
    buyerFit,
    buyerFitDetail,
    outreachOpportunity,
    outreachOpportunityDetail,
    total,
    tier: tierFor(total),
  };
}

// A lead only belongs in the weekly pool if it clears the Tier C floor (50).
export function isPoolQuality(score: ScoreBreakdown): boolean {
  return score.total >= 50;
}
