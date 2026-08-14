// ── Bulk Campaign Generator — business logic ──
// Faithful port of amazoncampaigngeneratorv5.html. Do not change formulas/thresholds
// without checking the spec — this must produce the same output as the source tool
// for the same input. Only SP (Sponsored Products) is supported, matching the source.

export interface Product {
  asin: string;
  brand: string;
  cat: string;
  subcat: string;
  agName: string;
  uid2: string;
  pf: string;
  title: string;
}

export interface KeywordInput {
  asin: string;
  keyword: string;
  notes: string;
  recBid: number | "";
  source: string;
  campType: string;
  tier: string;
}

export type MatchType = "exact" | "phrase" | "broad";

export interface CampaignGenState {
  adType: "SP" | "";
  targeting: "MANUAL" | "AUTO";
  matchTypes: MatchType[];
  bid: number | "";
  budget: number | "";
  startDate: string; // YYYY-MM-DD
  endDate: string;
  state: "enabled" | "paused" | "";
  bidStrategy: string;
  portfolio: string;
  topPct: number;
  ppPct: number;
  rosPct: number;
  autoFill: boolean;
  tac_generic: boolean | null;
  tac_branded: boolean | null;
  tac_prodbr: boolean | null;
  tac_prodcomp: boolean | null;
  tac_auto: boolean | null;
  brandKw: string;
  prodAsinsBr: string;
  prodAsinsComp: string;
  bidEngineEnabled: boolean | null;
  be_minwords: number | "";
  be_branded: number;
  be_generic: number;
  be_discovery: number;
  be_high: number;
  be_medium: number;
  be_low: number;
  be_exact: number;
  be_phrase: number;
  be_broad: number;
  be_floor: number | "";
  be_ceil: number | "";
  budgetSplit: boolean | null;
  bs_total: number | "";
  bs_generic: number;
  bs_branded: number;
  bs_auto: number;
  bs_prodbr: number;
  bs_prodcomp: number;
  bs_broad: number;
  bs_phrase: number;
  bs_exact: number;
  products: Product[];
  keywords: KeywordInput[];
}

export const DEFAULT_STATE: CampaignGenState = {
  adType: "SP",
  targeting: "MANUAL",
  matchTypes: [],
  bid: "",
  budget: "",
  startDate: "",
  endDate: "",
  state: "",
  bidStrategy: "",
  portfolio: "",
  topPct: 0,
  ppPct: 0,
  rosPct: 0,
  autoFill: true,
  tac_generic: null,
  tac_branded: null,
  tac_prodbr: null,
  tac_prodcomp: null,
  tac_auto: null,
  brandKw: "",
  prodAsinsBr: "",
  prodAsinsComp: "",
  bidEngineEnabled: null,
  be_minwords: "",
  be_branded: 1,
  be_generic: 1,
  be_discovery: 1,
  be_high: 1,
  be_medium: 1,
  be_low: 1,
  be_exact: 1,
  be_phrase: 1,
  be_broad: 1,
  be_floor: "",
  be_ceil: "",
  budgetSplit: null,
  bs_total: "",
  bs_generic: 0,
  bs_branded: 0,
  bs_auto: 0,
  bs_prodbr: 0,
  bs_prodcomp: 0,
  bs_broad: 0,
  bs_phrase: 0,
  bs_exact: 0,
  products: [],
  keywords: [],
};

// ══════════════════════════════════════════════════════════════
// CSV / product-list parsing
// ══════════════════════════════════════════════════════════════

function tokenizeCSV(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delim) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

export interface ParsedProductFile {
  products: Product[];
  keywords: KeywordInput[];
  headers: string[];
}

export function parseProductCSV(text: string): ParsedProductFile {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const headEnd = text.search(/\r?\n/);
  const firstLine = headEnd === -1 ? text : text.slice(0, headEnd);
  const unquoted = firstLine.replace(/"[^"]*"/g, "");
  const delim = unquoted.indexOf("\t") > -1 && unquoted.indexOf(",") === -1 ? "\t" : ",";

  const rows = tokenizeCSV(text, delim);
  if (rows.length < 2) throw new Error("That file looks empty, or has only a header row.");

  const rawHeaders = rows[0];
  const headers = rawHeaders.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ""));

  const col = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex((h) => h.includes(name));
      if (idx > -1) return idx;
    }
    return -1;
  };

  const iAsin = col(["asin"]);
  const iBrand = col(["brand name", "brand"]);
  const iCat = col(["category"]);
  const iSubcat = col(["sub category", "subcat", "sub cat"]);
  const iAG = col(["ad group name", "ad group", "adgroup"]);
  const iUID2 = col(["unique id 2", "uid2", "unique id"]);
  const iPF = col(["portfolio id", "portfolio"]);
  const iTitle = col(["product title", "title"]);
  const iKW = col(["keyword"]);
  const iNotes = col(["notes"]);
  const iRecBid = col(["recommended bid", "rec bid", "rec. bid"]);
  const iSource = col(["source"]);
  const iCampType = col(["campaign type", "camp type"]);
  const iTier = col(["tier"]);

  if (iAsin === -1) throw new Error('Could not find an "ASIN" column. Check your file headers match the template.');

  const get = (cols: string[], idx: number): string => (idx === -1 || idx >= cols.length ? "" : (cols[idx] ?? "").trim());

  const products: Product[] = [];
  const keywords: KeywordInput[] = [];
  const seenAsins = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    const asin = get(cols, iAsin).toUpperCase().trim();
    if (!asin) continue;

    const brand = get(cols, iBrand);
    const cat = get(cols, iCat);
    const subcat = get(cols, iSubcat);
    const agName = get(cols, iAG);
    const uid2 = get(cols, iUID2);
    const pf = get(cols, iPF);
    const title = get(cols, iTitle);

    const kw = get(cols, iKW);
    if (kw) {
      keywords.push({
        asin,
        keyword: kw,
        notes: get(cols, iNotes),
        recBid: parseFloat(get(cols, iRecBid)) || "",
        source: get(cols, iSource),
        campType: get(cols, iCampType),
        tier: get(cols, iTier).toUpperCase(),
      });
    }

    if (!seenAsins.has(asin)) {
      seenAsins.add(asin);
      products.push({ asin, brand, cat, subcat, agName, uid2, pf, title });
    }
  }

  if (products.length === 0) throw new Error("No product rows found. Ensure ASIN column has data.");

  return { products, keywords, headers: rawHeaders };
}

export function isValidAsin(a: string): boolean {
  return a.length === 10 && a.startsWith("B");
}

export function productIssues(p: Product): string[] {
  const issues: string[] = [];
  if (!p.asin || !isValidAsin(p.asin)) issues.push("Invalid ASIN");
  if (!p.brand) issues.push("Missing brand");
  if (!p.cat) issues.push("Missing category");
  if (!p.agName) issues.push("Missing Ad Group Name");
  return issues;
}

// ══════════════════════════════════════════════════════════════
// Bid Engine
// ══════════════════════════════════════════════════════════════

export interface BidMultipliers {
  branded: number;
  generic: number;
  discovery: number;
  high: number;
  medium: number;
  low: number;
  exact: number;
  phrase: number;
  broad: number;
}

export function bidMultipliers(s: CampaignGenState): BidMultipliers {
  const n = (v: number) => (v > 0 ? v : 1);
  return {
    branded: n(s.be_branded),
    generic: n(s.be_generic),
    discovery: n(s.be_discovery),
    high: n(s.be_high),
    medium: n(s.be_medium),
    low: n(s.be_low),
    exact: n(s.be_exact),
    phrase: n(s.be_phrase),
    broad: n(s.be_broad),
  };
}

export function resolveKwBuckets(
  kwObj: KeywordInput | null,
  fallbackType: "branded" | "generic" | "discovery" = "generic"
): { type: "branded" | "generic" | "discovery"; rel: "high" | "medium" | "low" } {
  let type: "branded" | "generic" | "discovery" = fallbackType;
  if (kwObj) {
    const ct = String(kwObj.campType || "").toLowerCase();
    const srcName = String(kwObj.source || "").toLowerCase();
    if (ct === "branded") type = "branded";
    else if (srcName === "title") type = "discovery";
    else type = "generic";
  }
  let rel: "high" | "medium" | "low" = "medium";
  const tier = String((kwObj && kwObj.tier) || "").toUpperCase();
  if (tier === "TIER1") rel = "high";
  else if (tier === "TIER3") rel = "low";
  else if (tier === "TIER2") rel = "medium";
  return { type, rel };
}

export function calcBid(
  baseBid: number,
  kwType: "branded" | "generic" | "discovery",
  matchType: MatchType,
  relTier: "high" | "medium" | "low",
  beEnabled: boolean,
  mults: BidMultipliers,
  floor: number,
  ceil: number
): number {
  if (!beEnabled) return Math.round(baseBid * 100) / 100;
  const kwMult = kwType === "branded" ? mults.branded : kwType === "discovery" ? mults.discovery : mults.generic;
  const relMult = relTier === "high" ? mults.high : relTier === "low" ? mults.low : mults.medium;
  const matchMul = matchType === "exact" ? mults.exact : matchType === "phrase" ? mults.phrase : mults.broad;
  let b = baseBid * kwMult * relMult * matchMul;
  if (floor > 0 && b < floor) b = floor;
  if (ceil > 0 && b > ceil) b = ceil;
  return Math.round(b * 100) / 100;
}

function resolvedKeywordBid(
  kwObj: KeywordInput,
  baseBid: number,
  matchType: MatchType,
  beEnabled: boolean,
  mults: BidMultipliers,
  floor: number,
  ceil: number
): number {
  const rb = kwObj.recBid;
  if (rb !== "" && rb !== null && rb !== undefined && parseFloat(String(rb)) > 0) return parseFloat(String(rb));
  const bk = resolveKwBuckets(kwObj);
  return calcBid(baseBid, bk.type, matchType, bk.rel, beEnabled, mults, floor, ceil);
}

// ══════════════════════════════════════════════════════════════
// Budget Split
// ══════════════════════════════════════════════════════════════

export type Tactic = "generic" | "branded" | "auto" | "prodbr" | "prodcomp";

interface BudgetContext {
  useSplit: boolean;
  bsTotal: number;
  budget: number;
  pctMap: Record<Tactic, number>;
  splitByMatch: boolean;
  effectiveMatches: MatchType[];
  mtWeights: Record<MatchType, number>;
  campCounts: { genericByMatch: Record<string, number> };
}

function campBudget(ctx: BudgetContext, tactic: Tactic, campCount: number, matchType?: MatchType): number {
  if (!ctx.useSplit || ctx.bsTotal <= 0) return ctx.budget;
  const pct = ctx.pctMap[tactic] || 0;
  const activeSum = (Object.values(ctx.pctMap) as number[]).reduce((a, b) => a + b, 0) || 1;
  let pool = ctx.bsTotal * (pct / activeSum);
  let count = campCount;

  if (tactic === "generic" && ctx.splitByMatch && matchType) {
    const mtWeightSum = (Object.values(ctx.mtWeights) as number[]).reduce((a, b) => a + b, 0);
    if (mtWeightSum > 0) {
      pool = pool * ((ctx.mtWeights[matchType] || 0) / mtWeightSum);
      count = ctx.campCounts.genericByMatch[matchType] || 1;
    } else {
      pool = pool / ctx.effectiveMatches.length;
      count = ctx.campCounts.genericByMatch[matchType] || 1;
    }
  }
  if (count <= 0) return ctx.budget;
  return Math.max(1, Math.round(pool / count));
}

// ══════════════════════════════════════════════════════════════
// Naming
// ══════════════════════════════════════════════════════════════

export function proper(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function campName(brand: string, cat: string, subcat: string, adType: string, tactic: string, suffix = ""): string {
  return [brand, cat, subcat, adType, tactic, suffix].filter(Boolean).join("_");
}

// ══════════════════════════════════════════════════════════════
// Validation
// ══════════════════════════════════════════════════════════════

export interface ValidationItem {
  msg: string;
  fix: string;
  page: string;
}

export interface ValidationResult {
  errors: ValidationItem[];
  warnings: ValidationItem[];
  ok: string[];
}

function activeTactics(s: CampaignGenState): Tactic[] {
  const out: Tactic[] = [];
  if (s.tac_generic === true) out.push("generic");
  if (s.tac_branded === true) out.push("branded");
  if (s.tac_prodbr === true) out.push("prodbr");
  if (s.tac_prodcomp === true) out.push("prodcomp");
  if (s.tac_auto === true) out.push("auto");
  return out;
}

export function runValidation(s: CampaignGenState): ValidationResult {
  const errors: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  const ok: string[] = [];

  const bid = typeof s.bid === "number" ? s.bid : parseFloat(String(s.bid)) || 0;
  const budget = typeof s.budget === "number" ? s.budget : parseFloat(String(s.budget)) || 0;

  if (!s.adType) errors.push({ msg: "Ad Type is not selected.", fix: "Go to Campaign Setup and select SP, SB, or SD.", page: "setup" });
  if (bid <= 0) errors.push({ msg: "Default Bid is missing or zero.", fix: "Enter a positive bid in Campaign Setup.", page: "setup" });
  if (budget <= 0) errors.push({ msg: "Default Budget is missing or zero.", fix: "Enter a positive budget in Campaign Setup.", page: "setup" });
  if (!s.startDate) errors.push({ msg: "Start Date is not set.", fix: "Select a start date in Campaign Setup.", page: "setup" });
  else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sd = new Date(s.startDate + "T00:00:00");
    if (sd < today) errors.push({ msg: `Start Date ${s.startDate} is in the past.`, fix: "Choose today or a future date.", page: "setup" });
  }
  if (!s.state) errors.push({ msg: "Campaign State is not set.", fix: 'Select "enabled" or "paused" in Campaign Setup.', page: "setup" });

  if (s.adType === "SP" && s.targeting === "MANUAL" && s.matchTypes.length === 0) {
    errors.push({ msg: "No match types selected for SP Manual.", fix: "Check at least one match type in Campaign Setup.", page: "setup" });
  }
  if (s.adType && s.adType !== "SP") {
    errors.push({ msg: `${s.adType} campaigns are not generated by this build.`, fix: "Select Sponsored Products in Campaign Setup.", page: "setup" });
  }

  const active = activeTactics(s);
  if (active.length === 0) {
    errors.push({ msg: "No targeting tactics enabled.", fix: "Enable at least one tactic in the Targeting tab.", page: "targeting" });
  }
  if (s.tac_branded === true && !s.brandKw.trim()) {
    errors.push({ msg: "Brand Keyword is required when Branded targeting is ON.", fix: "Enter brand keyword(s) in the Targeting tab.", page: "targeting" });
  }
  if (s.tac_prodbr === true) {
    if (!s.prodAsinsBr.trim()) {
      errors.push({ msg: "Own product ASINs required for Product (Branded) targeting.", fix: "Enter pipe-separated ASINs in the Targeting tab.", page: "targeting" });
    } else {
      const bad = s.prodAsinsBr.split("|").map((a) => a.trim()).filter(Boolean).filter((a) => !isValidAsin(a));
      if (bad.length) errors.push({ msg: `Invalid ASINs in Product (Branded): ${bad.join(", ")}`, fix: "ASINs must be 10 chars starting with B.", page: "targeting" });
    }
  }
  if (s.tac_prodcomp === true) {
    if (!s.prodAsinsComp.trim()) {
      errors.push({ msg: "Competitor ASINs required for Product (Competitor) targeting.", fix: "Enter pipe-separated ASINs in the Targeting tab.", page: "targeting" });
    } else {
      const bad = s.prodAsinsComp.split("|").map((a) => a.trim()).filter(Boolean).filter((a) => !isValidAsin(a));
      if (bad.length) errors.push({ msg: `Invalid ASINs in Product (Competitor): ${bad.join(", ")}`, fix: "ASINs must be 10 chars starting with B.", page: "targeting" });
    }
  }

  if (s.products.length === 0) {
    errors.push({ msg: "No products loaded.", fix: "Upload a product list CSV in the Products & Keywords tab.", page: "products" });
  } else {
    const missing = s.products.filter((p) => !p.asin || !p.brand || !p.cat || !p.agName);
    if (missing.length) errors.push({ msg: `${missing.length} product row(s) have missing required fields (ASIN/Brand/Category/Ad Group).`, fix: "Fix or re-upload your product list.", page: "products" });
    const badAsins = s.products.filter((p) => p.asin && !isValidAsin(p.asin));
    if (badAsins.length) errors.push({ msg: `${badAsins.length} product ASIN(s) are invalid (must be 10 chars starting with B).`, fix: "Fix the ASIN values in your product list.", page: "products" });
  }

  if (s.bidEngineEnabled) {
    const fl = typeof s.be_floor === "number" ? s.be_floor : parseFloat(String(s.be_floor)) || 0;
    const cl = typeof s.be_ceil === "number" ? s.be_ceil : parseFloat(String(s.be_ceil)) || 0;
    if (fl > 0 && cl > 0 && fl >= cl) errors.push({ msg: "Bid Floor must be less than Bid Ceiling.", fix: "Fix floor/ceiling values in Bid Engine.", page: "bidengine" });
  }

  if (s.budgetSplit) {
    const bsTotal = typeof s.bs_total === "number" ? s.bs_total : parseFloat(String(s.bs_total)) || 0;
    if (bsTotal <= 0) errors.push({ msg: "Session Total Budget is required when Budget Split is ON.", fix: "Enter total budget in Budget Split tab.", page: "budget" });
  }

  // Warnings
  if (s.keywords.length === 0 && !s.autoFill && (s.tac_generic === true || s.tac_branded === true)) {
    warnings.push({ msg: "No keywords found and Auto-fill is off.", fix: "Enable Auto-fill in Campaign Setup, use Keyword Intelligence, or add a Keyword column to your product list.", page: "setup" });
  }
  if (s.budgetSplit) {
    const pcts = s.bs_generic + s.bs_branded + s.bs_auto + s.bs_prodbr + s.bs_prodcomp;
    if (pcts === 0) warnings.push({ msg: "All tactic budget allocations are 0%.", fix: "Set percentages in Budget Split or turn Split off.", page: "budget" });
    else if (Math.round(pcts) !== 100) warnings.push({ msg: `Tactic allocations total ${Math.round(pcts)}% (not 100%).`, fix: "Adjust the sliders to total 100%.", page: "budget" });

    if (s.tac_generic === true && s.matchTypes.length > 1) {
      const mtSum = s.bs_exact + s.bs_phrase + s.bs_broad;
      if (mtSum !== 0 && Math.round(mtSum) !== 100) {
        warnings.push({ msg: `Match type weights total ${Math.round(mtSum)}% (not 100%).`, fix: "Set them to total 100%, or leave all three at 0 for an even split.", page: "budget" });
      }
    }
  }

  if (errors.length === 0) {
    ok.push(`Ad Type: ${s.adType}`);
    ok.push(`Default Bid: $${bid.toFixed(2)}`);
    ok.push(`Default Budget: $${budget.toFixed(0)}/day`);
    ok.push(`Start Date: ${s.startDate}`);
    ok.push(`Campaign State: ${s.state}`);
    if (s.adType === "SP" && s.targeting === "MANUAL") ok.push(`Match Types: ${s.matchTypes.join(", ")}`);
    ok.push(`Tactics: ${active.join(", ")}`);
    ok.push(`${s.products.length} products loaded`);
    if (s.keywords.length) ok.push(`${s.keywords.length} keywords loaded`);
    else if (s.autoFill) ok.push("No keywords in file — Auto-fill placeholder enabled");
  }

  return { errors, warnings, ok };
}

// ══════════════════════════════════════════════════════════════
// Preview
// ══════════════════════════════════════════════════════════════

export interface PreviewStats {
  totalCampaigns: number;
  keywordCount: number;
  estRows: number;
  estBudget: number;
  breakdown: { tactic: string; campaigns: number; budgetPerCampaign: number; matchTypes: string }[];
}

export function buildPreview(s: CampaignGenState): PreviewStats {
  const bid = typeof s.bid === "number" ? s.bid : parseFloat(String(s.bid)) || 0;
  const budget = typeof s.budget === "number" ? s.budget : parseFloat(String(s.budget)) || 0;
  const effectiveMatches: MatchType[] = s.matchTypes.length ? s.matchTypes : ["exact"];
  const splitByMatch = effectiveMatches.length > 1;

  let cntGeneric = 0, cntBranded = 0, cntProdBr = 0, cntProdComp = 0, cntAuto = 0;
  const seen = new Set<string>();
  for (const p of s.products) {
    const base = [p.brand, p.cat, p.subcat, s.adType].filter(Boolean).join("_");
    if (s.tac_generic === true) {
      if (splitByMatch) {
        effectiveMatches.forEach((mt) => {
          const n = base + "_Generic_" + proper(mt);
          if (!seen.has(n)) { seen.add(n); cntGeneric++; }
        });
      } else {
        const n = base + "_Generic";
        if (!seen.has(n)) { seen.add(n); cntGeneric++; }
      }
    }
    if (s.tac_branded === true) { const n = base + "_Branded"; if (!seen.has(n)) { seen.add(n); cntBranded++; } }
    if (s.tac_prodbr === true) { const n = base + "_ProductBranded"; if (!seen.has(n)) { seen.add(n); cntProdBr++; } }
    if (s.tac_prodcomp === true) { const n = base + "_ProductCompetitor"; if (!seen.has(n)) { seen.add(n); cntProdComp++; } }
    if (s.tac_auto === true) { const n = base + "_Auto"; if (!seen.has(n)) { seen.add(n); cntAuto++; } }
  }

  const totalCamps = cntGeneric + cntBranded + cntProdBr + cntProdComp + cntAuto;
  const kwCount = s.keywords.length;
  const estRows = totalCamps * 3 + kwCount + (s.tac_auto === true ? cntAuto * 4 : 0);
  const estBudget = budget * totalCamps;

  const breakdown: PreviewStats["breakdown"] = [];
  if (cntGeneric > 0) breakdown.push({ tactic: "Generic", campaigns: cntGeneric, budgetPerCampaign: budget, matchTypes: splitByMatch ? effectiveMatches.map(proper).join(", ") : effectiveMatches[0] || "—" });
  if (cntBranded > 0) breakdown.push({ tactic: "Branded", campaigns: cntBranded, budgetPerCampaign: budget, matchTypes: effectiveMatches.map(proper).join(", ") || "—" });
  if (cntProdBr > 0) breakdown.push({ tactic: "Product Branded", campaigns: cntProdBr, budgetPerCampaign: budget, matchTypes: "Product Target" });
  if (cntProdComp > 0) breakdown.push({ tactic: "Product Competitor", campaigns: cntProdComp, budgetPerCampaign: budget, matchTypes: "Product Target" });
  if (cntAuto > 0) breakdown.push({ tactic: "Auto", campaigns: cntAuto, budgetPerCampaign: budget, matchTypes: "close-match, loose-match, substitutes, complements" });

  void bid;
  return { totalCampaigns: totalCamps, keywordCount: kwCount, estRows, estBudget, breakdown };
}

// ══════════════════════════════════════════════════════════════
// Bulk file generation (33-column SP Bulk Operations format)
// ══════════════════════════════════════════════════════════════

export const SP_HEADER = [
  "Product", "Entity", "Operation", "Campaign ID", "Ad Group ID", "Portfolio ID",
  "Ad ID", "Keyword ID", "Product Targeting ID", "Campaign Name", "Ad Group Name",
  "Start Date", "End Date", "Targeting Type", "State", "Daily Budget",
  "SKU", "ASIN", "Ad Group Default Bid", "Bid", "Keyword Text",
  "Native Language Keyword", "Native Language Locale", "Match Type",
  "Bidding Strategy", "Placement", "Percentage", "Product Targeting Expression",
  "Audience ID", "Shopper Cohort Percentage", "Shopper Cohort Type", "Sites",
  "Off-Amazon ad serving",
];

type CellRow = (string | number | null)[];

function r33(fields: Record<number, string | number | null>): CellRow {
  const r: CellRow = new Array(33).fill(null);
  for (const k of Object.keys(fields)) r[parseInt(k, 10)] = fields[parseInt(k, 10)];
  return r;
}

function dateNum(iso: string): number {
  // Amazon bulk format: numeric YYYYMMDD
  return parseInt(iso.replace(/-/g, ""), 10);
}

export interface GenerationResult {
  spRows: CellRow[];
  summaryRows: (string | number)[][];
  entityCounts: Record<string, number>;
  counts: { campaigns: number; adGroups: number; productAds: number; keywords: number; targets: number; negatives: number };
  fileName: string;
}

export function generateBulkRows(s: CampaignGenState): GenerationResult {
  const bid = typeof s.bid === "number" ? s.bid : parseFloat(String(s.bid)) || 0;
  const budget = typeof s.budget === "number" ? s.budget : parseFloat(String(s.budget)) || 0;
  const campState = s.state || "enabled";
  const bidStrategy = s.bidStrategy || "Dynamic bids - down only";
  const effectiveMatches: MatchType[] = s.matchTypes.length ? s.matchTypes : ["exact"];
  const splitByMatch = effectiveMatches.length > 1;
  const beMinWords = (typeof s.be_minwords === "number" ? s.be_minwords : parseInt(String(s.be_minwords), 10)) || 1;
  const beEnabled = !!s.bidEngineEnabled;
  const mults = bidMultipliers(s);
  const beFloor = typeof s.be_floor === "number" ? s.be_floor : parseFloat(String(s.be_floor)) || 0;
  const beCeil = typeof s.be_ceil === "number" ? s.be_ceil : parseFloat(String(s.be_ceil)) || 0;
  const startDateNum = s.startDate ? dateNum(s.startDate) : null;
  const endDateVal = s.endDate ? dateNum(s.endDate) : null;

  const spRows: CellRow[] = [];
  const seenCamp = new Set<string>();
  const seenAG = new Set<string>();
  const seenAd = new Set<string>();
  const seenKw = new Set<string>();
  const seenTgt = new Set<string>();
  const seenNeg = new Set<string>();

  // Budget split context
  const activeTac = activeTactics(s);
  const genericByMatch: Record<string, number> = {};
  {
    const seenForCount = new Set<string>();
    for (const p of s.products) {
      const base = [p.brand, p.cat, p.subcat, s.adType].filter(Boolean).join("_");
      if (s.tac_generic === true) {
        if (splitByMatch) {
          for (const mt of effectiveMatches) {
            const n = base + "_Generic_" + proper(mt);
            if (!seenForCount.has(n)) { seenForCount.add(n); genericByMatch[mt] = (genericByMatch[mt] || 0) + 1; }
          }
        }
      }
    }
  }
  const budgetCtx: BudgetContext = {
    useSplit: !!s.budgetSplit,
    bsTotal: typeof s.bs_total === "number" ? s.bs_total : parseFloat(String(s.bs_total)) || 0,
    budget,
    pctMap: { generic: s.bs_generic, branded: s.bs_branded, auto: s.bs_auto, prodbr: s.bs_prodbr, prodcomp: s.bs_prodcomp },
    splitByMatch,
    effectiveMatches,
    mtWeights: { exact: s.bs_exact, phrase: s.bs_phrase, broad: s.bs_broad },
    campCounts: { genericByMatch },
  };

  function addCampaign(cn: string, pf: string, bgt: number, targetingType: "MANUAL" | "AUTO") {
    if (seenCamp.has(cn)) return false;
    seenCamp.add(cn);
    spRows.push(r33({ 0: "Sponsored Products", 1: "Campaign", 2: "Create", 3: cn, 5: pf || null, 9: cn, 11: startDateNum, 12: endDateVal, 13: targetingType, 14: campState, 15: bgt, 24: bidStrategy }));
    addBidAdj(cn, "Top of Search", s.topPct);
    addBidAdj(cn, "Product Page", s.ppPct);
    addBidAdj(cn, "Rest of Search", s.rosPct);
    return true;
  }
  function addBidAdj(cn: string, placement: string, pct: number) {
    if (!pct || pct <= 0) return;
    spRows.push(r33({ 0: "Sponsored Products", 1: "Bidding Adjustment", 2: "Create", 3: cn, 9: cn, 25: placement, 26: pct }));
  }
  function addAdGroup(cn: string, agName: string, agBid: number) {
    const key = cn + "|" + agName;
    if (seenAG.has(key)) return false;
    seenAG.add(key);
    spRows.push(r33({ 0: "Sponsored Products", 1: "Ad Group", 2: "Create", 3: cn, 4: agName, 9: cn, 10: agName, 14: campState, 18: agBid }));
    return true;
  }
  function addProductAd(cn: string, agName: string, asin: string, state: string) {
    const key = cn + "|" + agName + "|" + asin;
    if (seenAd.has(key)) return;
    seenAd.add(key);
    spRows.push(r33({ 0: "Sponsored Products", 1: "Product Ad", 2: "Create", 3: cn, 4: agName, 9: cn, 10: agName, 14: state, 17: asin }));
  }
  function addKeyword(cn: string, agName: string, kw: string, mt: MatchType, kwBid: number, state: string) {
    const key = cn + "|" + agName + "|" + kw.toLowerCase() + "|" + mt;
    if (seenKw.has(key)) return;
    seenKw.add(key);
    spRows.push(r33({ 0: "Sponsored Products", 1: "Keyword", 2: "Create", 3: cn, 4: agName, 9: cn, 10: agName, 14: state, 19: kwBid, 20: kw, 23: mt }));
  }
  function addNegativeKeyword(cn: string, kw: string) {
    const key = cn + "|" + kw.toLowerCase();
    if (seenNeg.has(key)) return;
    seenNeg.add(key);
    spRows.push(r33({ 0: "Sponsored Products", 1: "Negative Keyword", 2: "Create", 3: cn, 9: cn, 20: kw, 23: "negativeExact" }));
  }
  function addAutoTarget(cn: string, agName: string, expr: string, tBid: number) {
    const key = cn + "|" + agName + "|" + expr;
    if (seenTgt.has(key)) return;
    seenTgt.add(key);
    spRows.push(r33({ 0: "Sponsored Products", 1: "Auto Targeting", 2: "Create", 3: cn, 4: agName, 9: cn, 10: agName, 14: campState, 19: tBid, 27: expr }));
  }
  function addProductTarget(cn: string, agName: string, expr: string, tBid: number) {
    const key = cn + "|" + agName + "|" + expr;
    if (seenTgt.has(key)) return;
    seenTgt.add(key);
    spRows.push(r33({ 0: "Sponsored Products", 1: "Product Targeting", 2: "Create", 3: cn, 4: agName, 9: cn, 10: agName, 14: campState, 19: tBid, 27: expr }));
  }

  const brandKwList = s.brandKw.split(",").map((b) => b.trim()).filter(Boolean);
  const prodAsinsBr = s.prodAsinsBr.split("|").map((a) => a.trim()).filter(Boolean);
  const prodAsinsComp = s.prodAsinsComp.split("|").map((a) => a.trim()).filter(Boolean);

  for (const p of s.products) {
    if (!p.asin && !p.brand && !p.cat) continue;

    // 1. Generic
    if (activeTac.includes("generic")) {
      const kwsForAsin = s.keywords.filter(
        (k) => k.asin.toUpperCase() === p.asin.toUpperCase() && (!k.campType || k.campType.toLowerCase() === "generic")
      );
      const filtered = kwsForAsin.filter((k) => String(k.keyword || "").trim().split(/\s+/).length >= beMinWords);

      for (const mt of effectiveMatches) {
        const cn = splitByMatch ? campName(p.brand, p.cat, p.subcat, s.adType, "Generic", proper(mt)) : campName(p.brand, p.cat, p.subcat, s.adType, "Generic");
        const campCount = splitByMatch ? genericByMatch[mt] || 1 : Object.keys(genericByMatch).length ? 1 : (() => {
          const uniq = new Set<string>();
          for (const pp of s.products) uniq.add([pp.brand, pp.cat, pp.subcat, s.adType].filter(Boolean).join("_"));
          return uniq.size;
        })();
        const bgt = campBudget(budgetCtx, "generic", campCount, mt);
        addCampaign(cn, p.pf || s.portfolio, bgt, "MANUAL");
        addAdGroup(cn, p.agName, bid);

        let kwList = filtered;
        const isPlaceholder = kwList.length === 0 && s.autoFill;
        if (isPlaceholder) {
          kwList = [{ asin: p.asin, keyword: "placeholder-edit-this-keyword", notes: "", recBid: "", source: "", campType: "Generic", tier: "" }];
        }
        const useState = isPlaceholder ? "paused" : campState;

        addProductAd(cn, p.agName, p.asin, useState);

        for (const kwObj of kwList) {
          const kwBid = resolvedKeywordBid(kwObj, bid, mt, beEnabled, mults, beFloor, beCeil);
          addKeyword(cn, p.agName, kwObj.keyword, mt, kwBid, useState);
        }
        for (const bk of brandKwList) addNegativeKeyword(cn, bk);
      }
    }

    // 2. Branded
    if (activeTac.includes("branded") && brandKwList.length) {
      const cn = campName(p.brand, p.cat, p.subcat, s.adType, "Branded");
      const isNew = addCampaign(cn, p.pf || s.portfolio, budget, "MANUAL");
      const agIsNew = addAdGroup(cn, p.agName, bid);
      if (agIsNew || isNew) {
        for (const bkTerm of brandKwList) {
          const matched = s.keywords.find(
            (k) => k.asin.toUpperCase() === p.asin.toUpperCase() && String(k.campType || "").toLowerCase() === "branded" && k.keyword.toLowerCase() === bkTerm.toLowerCase()
          );
          for (const mt of effectiveMatches) {
            const bBid = matched ? resolvedKeywordBid(matched, bid, mt, beEnabled, mults, beFloor, beCeil) : calcBid(bid, "branded", mt, "medium", beEnabled, mults, beFloor, beCeil);
            addKeyword(cn, p.agName, bkTerm, mt, bBid, campState);
          }
        }
      }
      addProductAd(cn, p.agName, p.asin, campState);
    }

    // 3. Product Branded
    if (activeTac.includes("prodbr") && prodAsinsBr.length) {
      const cn = campName(p.brand, p.cat, p.subcat, s.adType, "ProductBranded");
      addCampaign(cn, p.pf || s.portfolio, budget, "MANUAL");
      addAdGroup(cn, p.agName, bid);
      for (const ta of prodAsinsBr) addProductTarget(cn, p.agName, `asin="${ta}"`, bid);
      addProductAd(cn, p.agName, p.asin, campState);
    }

    // 4. Product Competitor
    if (activeTac.includes("prodcomp") && prodAsinsComp.length) {
      const cn = campName(p.brand, p.cat, p.subcat, s.adType, "ProductCompetitor");
      addCampaign(cn, p.pf || s.portfolio, budget, "MANUAL");
      addAdGroup(cn, p.agName, bid);
      for (const ta of prodAsinsComp) addProductTarget(cn, p.agName, `asin="${ta}"`, bid);
      addProductAd(cn, p.agName, p.asin, campState);
    }

    // 5. Auto
    if (activeTac.includes("auto")) {
      const cn = campName(p.brand, p.cat, p.subcat, s.adType, "Auto");
      addCampaign(cn, p.pf || s.portfolio, budget, "AUTO");
      addAdGroup(cn, p.agName, bid);
      const autoExprs = ["close-match", "loose-match", "substitutes", "complements"];
      for (const expr of autoExprs) addAutoTarget(cn, p.agName, expr, bid);
      addProductAd(cn, p.agName, p.asin, campState);
    }
  }

  const entityCounts: Record<string, number> = {};
  for (const r of spRows) {
    const ent = String(r[1]);
    entityCounts[ent] = (entityCounts[ent] || 0) + 1;
  }

  const ts = new Date().toISOString().replace(/[:-]/g, "").replace("T", "_").substring(0, 15);
  const fileName = `AmazonBulkUpload_${s.adType}_${ts}.xlsx`;

  const summaryRows: (string | number)[][] = [
    ["AMAZON BULK UPLOAD — RUN SUMMARY", ""],
    ["", ""],
    ["Generated", new Date().toLocaleString()],
    ["Built with", "Acosta Retail Media Toolkit — Bulk Campaign Generator"],
    ["", ""],
    ["── OUTPUT ─────────────────────────", ""],
    ["Campaigns", seenCamp.size],
    ["Ad groups", seenAG.size],
    ["Product ads", seenAd.size],
    ["Keywords", seenKw.size],
    ["Targets (product + auto)", seenTgt.size],
    ["Negative keywords", seenNeg.size],
    ["Total rows written", spRows.length],
    ["", ""],
    ["── CAMPAIGN SETUP ─────────────────", ""],
    ["Ad type", s.adType],
    ["Targeting mode", s.targeting],
    ["Match types", effectiveMatches.join(", ")],
    ["Split by match type", splitByMatch ? "Yes" : "No"],
    ["Default bid", "$" + bid.toFixed(2)],
    ["Default budget/day", "$" + budget.toFixed(2)],
    ["Start date", startDateNum || ""],
    ["End date", endDateVal || "(none)"],
    ["Campaign state", campState],
    ["Bid strategy", bidStrategy],
    ["Default portfolio", s.portfolio || "(none)"],
    ["Keyword auto-fill", s.autoFill ? "On" : "Off"],
    ["", ""],
    ["── PLACEMENT ADJUSTMENTS ──────────", ""],
    ["Top of search", s.topPct + "%"],
    ["Product page", s.ppPct + "%"],
    ["Rest of search", s.rosPct + "%"],
    ["", ""],
    ["── TACTICS ────────────────────────", ""],
    ["Active tactics", activeTac.join(", ") || "(none)"],
    ["Brand keywords", s.brandKw || "(none)"],
    ["Own ASINs targeted", s.prodAsinsBr || "(none)"],
    ["Competitor ASINs targeted", s.prodAsinsComp || "(none)"],
    ["", ""],
    ["── BID ENGINE ─────────────────────", ""],
    ["Enabled", beEnabled ? "Yes" : "No"],
    ["Formula", beEnabled ? "base x keyword type x relevancy tier x match type" : "base bid used as-is"],
    ["Min keyword word count", beMinWords],
    ["Multiplier — branded", "×" + mults.branded.toFixed(2)],
    ["Multiplier — generic", "×" + mults.generic.toFixed(2)],
    ["Multiplier — discovery", "×" + mults.discovery.toFixed(2)],
    ["Multiplier — high relevancy (TIER1)", "×" + mults.high.toFixed(2)],
    ["Multiplier — medium relevancy (TIER2)", "×" + mults.medium.toFixed(2)],
    ["Multiplier — low relevancy (TIER3)", "×" + mults.low.toFixed(2)],
    ["Multiplier — exact", "×" + mults.exact.toFixed(2)],
    ["Multiplier — phrase", "×" + mults.phrase.toFixed(2)],
    ["Multiplier — broad", "×" + mults.broad.toFixed(2)],
    ["Bid floor", beFloor > 0 ? "$" + beFloor.toFixed(2) : "(none)"],
    ["Bid ceiling", beCeil > 0 ? "$" + beCeil.toFixed(2) : "(none)"],
    ["", ""],
    ["── BUDGET ─────────────────────────", ""],
    ["Mode", budgetCtx.useSplit ? "Split by tactic" : "Flat per campaign"],
    ["Session total", budgetCtx.useSplit ? "$" + budgetCtx.bsTotal.toFixed(2) : "n/a"],
    ["", ""],
    ["── SOURCE DATA ────────────────────", ""],
    ["Products loaded", s.products.length],
    ["Keywords loaded", s.keywords.length],
    ["", ""],
    ["── ROWS BY ENTITY ─────────────────", ""],
    ...Object.keys(entityCounts).sort().map((k) => [k, entityCounts[k]] as (string | number)[]),
    ["", ""],
    ["NOTE", "Sponsored Brands and Sponsored Display sheets are intentionally empty."],
    ["", "This build generates Sponsored Products only."],
  ];

  return {
    spRows,
    summaryRows,
    entityCounts,
    counts: {
      campaigns: seenCamp.size,
      adGroups: seenAG.size,
      productAds: seenAd.size,
      keywords: seenKw.size,
      targets: seenTgt.size,
      negatives: seenNeg.size,
    },
    fileName,
  };
}
