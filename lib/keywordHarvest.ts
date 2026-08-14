// ── Keyword Harvesting — business logic ──
// Faithful port of keywordharvestv9.html's CORE module ("Keyword Harvest — Campaign Gap
// Analysis"). Ported exactly as v9 ships: fully automatic (no manual ASIN/brand-term entry),
// per-keyword classification always resolves to "generic" because the shipped UI always calls
// annotateClasses with empty brand/competitor term strings (see spec §3a) — campaign ROLE
// classification (detectRoles) still runs for real and drives gap routing. The undefined
// `detectRole` export in the source is a bug; this port uses `detectRoles` (the real 3-tier
// classifier) only. Two engine-only features with no UI in v9 (competitor-ASIN reverse lookup,
// seed-keyword discovery) are intentionally not ported.

// ══════════════════════════════════════════════════════════════
// CSV tokenizing (RFC 4180) + delimiter sniffing
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
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delim) { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function sniffDelimiter(headerLine: string): string {
  const unquoted = headerLine.replace(/"[^"]*"/g, "");
  if (unquoted.indexOf("\t") > -1) return "\t";
  if (unquoted.indexOf(";") > -1 && unquoted.indexOf(",") === -1) return ";";
  return ",";
}

// ══════════════════════════════════════════════════════════════
// Brand Analytics Top Search Terms parsing
// ══════════════════════════════════════════════════════════════

export interface TSRMapping {
  term: number;
  sfr: number;
  pos: { asin: number; title: number; cs: number; vs: number }[];
}

export interface TSRParseResult {
  rows: string[][];
  mapping: TSRMapping;
  headerIndex: number;
  delim: string;
}

function mapHeader(headers: string[]): { mapping: TSRMapping; missing: string[] } {
  const h = headers.map((x) => x.toLowerCase().trim());
  const find = (re: RegExp) => h.findIndex((x) => re.test(x));

  const term = find(/search\s*term/);
  const sfr = find(/search\s*frequency\s*rank/);
  const pos: TSRMapping["pos"] = [];
  for (let p = 1; p <= 3; p++) {
    const asinRe = new RegExp(`([#\\s]${p}\\b.*clicked\\s*asin|clicked\\s*asin\\s*[#\\s]?${p}\\b)`);
    const titleRe = new RegExp(`[#\\s]${p}\\b.*product\\s*title`);
    const csRe = new RegExp(`[#\\s]${p}\\b.*click\\s*share`);
    const vsRe = new RegExp(`[#\\s]${p}\\b.*conversion\\s*share`);
    pos.push({ asin: find(asinRe), title: find(titleRe), cs: find(csRe), vs: find(vsRe) });
  }

  const missing: string[] = [];
  if (term < 0) missing.push("Search Term");
  if (sfr < 0) missing.push("Search Frequency Rank");
  for (let p = 0; p < 3; p++) if (pos[p].asin < 0) missing.push(`#${p + 1} Clicked ASIN`);

  return { mapping: { term, sfr, pos }, missing };
}

export function parseTopSearchTerms(text: string): TSRParseResult {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const headEnd = text.search(/\r?\n/);
  const firstLine = headEnd === -1 ? text : text.slice(0, headEnd);
  const delim = sniffDelimiter(firstLine);
  const rows = tokenizeCSV(text, delim);

  let headerIndex = -1;
  let mapping: TSRMapping | null = null;
  for (let r = 0; r < Math.min(200, rows.length); r++) {
    const { mapping: m, missing } = mapHeader(rows[r]);
    if (missing.length === 0 || (m.sfr >= 0 && m.term >= 0)) {
      if (m.sfr >= 0) { headerIndex = r; mapping = m; break; }
    }
  }
  if (headerIndex === -1 || !mapping) {
    throw new Error('Could not find a "Search Frequency Rank" column in the first 200 rows. This does not look like a Brand Analytics Top Search Terms export.');
  }
  const { missing } = mapHeader(rows[headerIndex]);
  if (missing.length) {
    throw new Error(`The file is missing: ${missing.join(", ")}. Make sure this is the Top Search Terms report.`);
  }
  return { rows, mapping, headerIndex, delim };
}

// ══════════════════════════════════════════════════════════════
// Harvest engine (runStream equivalent)
// ══════════════════════════════════════════════════════════════

export interface HarvestRecord {
  asin: string;
  term: string;
  sfr: number | null;
  pos: 1 | 2 | 3;
  cs: number | null;
  vs: number | null;
  cls: "branded" | "generic" | "competitor";
  clsWhy: string;
}

export function runHarvest(parsed: TSRParseResult, asins: string[]): HarvestRecord[] {
  const set = new Set(asins.map((a) => String(a).trim().toUpperCase()).filter(Boolean));
  const recs: Omit<HarvestRecord, "cls" | "clsWhy">[] = [];
  const { rows, mapping, headerIndex } = parsed;

  let sawPct = false;
  let maxShare = 0;

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const term = String(row[mapping.term] || "").trim();
    if (!term) continue;
    const sfrRaw = row[mapping.sfr];
    const sfr = sfrRaw !== undefined && sfrRaw !== "" ? parseInt(String(sfrRaw).replace(/,/g, ""), 10) : undefined;

    for (let p = 0; p < 3; p++) {
      const col = mapping.pos[p];
      if (col.asin < 0) continue;
      const asin = String(row[col.asin] || "").trim().toUpperCase();
      if (asin && set.has(asin)) {
        let cs: number | null = null, vs: number | null = null;
        if (col.cs >= 0) {
          const raw = String(row[col.cs] || "").trim();
          if (raw) {
            sawPct = sawPct || raw.includes("%");
            cs = parseFloat(raw.replace("%", "")) || 0;
            maxShare = Math.max(maxShare, cs);
          }
        }
        if (col.vs >= 0) {
          const raw = String(row[col.vs] || "").trim();
          if (raw) {
            sawPct = sawPct || raw.includes("%");
            vs = parseFloat(raw.replace("%", "")) || 0;
            maxShare = Math.max(maxShare, vs);
          }
        }
        recs.push({ asin, term, sfr: sfr === undefined || isNaN(sfr) ? null : sfr, pos: (p + 1) as 1 | 2 | 3, cs, vs });
      }
    }
  }

  if (!sawPct && maxShare <= 1.0000001 && maxShare > 0) {
    for (const r of recs) {
      if (r.cs !== null) r.cs = r.cs * 100;
      if (r.vs !== null) r.vs = r.vs * 100;
    }
  }

  recs.sort((a, b) => (a.sfr == null ? Infinity : a.sfr) - (b.sfr == null ? Infinity : b.sfr));

  // annotateClasses — v9 always uses empty brand/competitor term lists, so every record
  // is classified "generic". Kept as a real (inert) pass to mirror v9's exact behavior.
  return recs.map((r) => ({ ...r, cls: "generic" as const, clsWhy: "" }));
}

// ══════════════════════════════════════════════════════════════
// Bulk campaign file parsing (analyzeBulk equivalent)
// ══════════════════════════════════════════════════════════════

export interface BulkCampaign {
  cid: string;
  name: string;
  state: string;
  targeting: string; // lowercased, e.g. "manual" | "auto"
}
export interface BulkAdGroup {
  agid: string;
  cid: string;
  name: string;
  state: string;
}

export interface BulkData {
  campaigns: Map<string, BulkCampaign>; // cid -> campaign
  adGroups: Map<string, BulkAdGroup>; // agid -> ad group
  asinAds: Map<string, Set<string>>; // asin -> set of agid (live, non-archived Product Ad rows)
  kw: Map<string, Map<string, Set<string>>>; // agid -> termLower -> set of match types (live only)
  kwState: Map<string, Map<string, string>>; // agid -> termLower -> state (exact rows only)
  campKw: Map<string, Map<string, Set<string>>>; // cid -> kwLower -> match types (includes archived, for role signal)
  negativesByAG: Map<string, Set<string>>; // agid -> negated termLower
  negativesByCamp: Map<string, Set<string>>; // cid -> negated termLower
  campHasPat: Set<string>; // cid with >=1 live Product Targeting row
  totals: { spend: number; clicks: number };
  idRisk: boolean;
}

const MAX_SAFE = 9007199254740992;

function idCell(v: unknown): string {
  if (typeof v === "number") return String(Math.round(v));
  return String(v == null ? "" : v).trim();
}

function findCol(headers: string[], pred: (h: string) => boolean): number {
  return headers.findIndex((h) => pred(h.toLowerCase().trim()));
}

export function analyzeBulkAOA(aoa: unknown[][]): BulkData {
  // Locate header row: contains "Entity" + a "campaign id" column, within first 10 rows.
  let headerRowIdx = -1;
  let headers: string[] = [];
  for (let r = 0; r < Math.min(10, aoa.length); r++) {
    const row = (aoa[r] || []).map((c) => String(c ?? ""));
    const hasEntity = row.some((h) => h.toLowerCase().trim() === "entity");
    const hasCid = row.some((h) => h.toLowerCase().includes("campaign id"));
    if (hasEntity && hasCid) { headerRowIdx = r; headers = row; break; }
  }
  if (headerRowIdx === -1) {
    throw new Error("Could not find Entity / Campaign ID headers. Download the file from Campaign Manager → Bulk operations.");
  }

  const col = {
    entity: findCol(headers, (h) => h === "entity"),
    cid: findCol(headers, (h) => h.includes("campaign id")),
    agid: findCol(headers, (h) => h.includes("ad group id")),
    kw: findCol(headers, (h) => h.includes("keyword text") && !h.includes("native")),
    mt: findCol(headers, (h) => h.includes("match type")),
    cname: findCol(headers, (h) => h === "campaign name"),
    agname: findCol(headers, (h) => h === "ad group name"),
    targeting: findCol(headers, (h) => h.includes("targeting type")),
    state: findCol(headers, (h) => h === "state"),
    asin: findCol(headers, (h) => h === "asin"),
    defbid: findCol(headers, (h) => h.includes("ad group default bid")),
    clicks: findCol(headers, (h) => h === "clicks"),
    spend: findCol(headers, (h) => h === "spend"),
  };

  const missing: string[] = [];
  if (col.entity < 0) missing.push("Entity");
  if (col.cid < 0) missing.push("Campaign ID");
  if (col.agid < 0) missing.push("Ad Group ID");
  if (col.kw < 0) missing.push("Keyword Text");
  if (col.mt < 0) missing.push("Match Type");
  if (missing.length) throw new Error(`Missing: ${missing.join(", ")}. Upload the Sponsored Products bulk operations file.`);

  const data: BulkData = {
    campaigns: new Map(),
    adGroups: new Map(),
    asinAds: new Map(),
    kw: new Map(),
    kwState: new Map(),
    campKw: new Map(),
    negativesByAG: new Map(),
    negativesByCamp: new Map(),
    campHasPat: new Set(),
    totals: { spend: 0, clicks: 0 },
    idRisk: false,
  };

  const get = (row: unknown[], i: number): string => (i < 0 || i >= row.length ? "" : String(row[i] ?? "").trim());
  const getId = (row: unknown[], i: number): string => {
    if (i < 0) return "";
    const v = row[i];
    if (typeof v === "number" && v >= MAX_SAFE) data.idRisk = true;
    return idCell(v);
  };

  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const entity = get(row, col.entity);
    if (!entity) continue;
    const cid = getId(row, col.cid);
    const agid = getId(row, col.agid);
    const state = get(row, col.state).toLowerCase();
    const archived = state === "archived";

    if (entity === "Campaign") {
      data.campaigns.set(cid, {
        cid,
        name: get(row, col.cname) || cid,
        state,
        targeting: get(row, col.targeting).toLowerCase(),
      });
    } else if (entity === "Ad Group") {
      data.adGroups.set(agid, { agid, cid, name: get(row, col.agname) || agid, state });
    } else if (entity === "Product Ad") {
      const asin = get(row, col.asin).toUpperCase();
      if (asin && !archived) {
        if (!data.asinAds.has(asin)) data.asinAds.set(asin, new Set());
        data.asinAds.get(asin)!.add(agid);
      }
    } else if (entity === "Keyword") {
      const kwText = get(row, col.kw).toLowerCase();
      const mt = get(row, col.mt).toLowerCase();
      if (kwText) {
        if (!data.campKw.has(cid)) data.campKw.set(cid, new Map());
        const cmap = data.campKw.get(cid)!;
        if (!cmap.has(kwText)) cmap.set(kwText, new Set());
        cmap.get(kwText)!.add(mt);

        if (!archived) {
          if (!data.kw.has(agid)) data.kw.set(agid, new Map());
          const amap = data.kw.get(agid)!;
          if (!amap.has(kwText)) amap.set(kwText, new Set());
          amap.get(kwText)!.add(mt);

          if (mt === "exact") {
            if (!data.kwState.has(agid)) data.kwState.set(agid, new Map());
            data.kwState.get(agid)!.set(kwText, state);
          }

          const clicks = parseFloat(get(row, col.clicks)) || 0;
          const spend = parseFloat(get(row, col.spend).replace(/[$,]/g, "")) || 0;
          data.totals.clicks += clicks;
          data.totals.spend += spend;
        }
      }
    } else if (entity === "Negative Keyword") {
      const kwText = get(row, col.kw).toLowerCase();
      if (kwText && !archived) {
        if (!data.negativesByAG.has(agid)) data.negativesByAG.set(agid, new Set());
        data.negativesByAG.get(agid)!.add(kwText);
      }
    } else if (entity === "Campaign Negative Keyword") {
      const kwText = get(row, col.kw).toLowerCase();
      if (kwText && !archived) {
        if (!data.negativesByCamp.has(cid)) data.negativesByCamp.set(cid, new Set());
        data.negativesByCamp.get(cid)!.add(kwText);
      }
    } else if (entity === "Product Targeting") {
      if (!archived) data.campHasPat.add(cid);
    }
  }

  return data;
}

// ══════════════════════════════════════════════════════════════
// Campaign role classification (detectRoles)
// ══════════════════════════════════════════════════════════════

export type CampaignRole = "branded" | "generic" | "competitor" | "category" | "unclassified";

function detectRoleByName(name: string): CampaignRole | null {
  const n = String(name || "").toLowerCase().replace(/[_\-|]+/g, " ").replace(/\s+/g, " ");
  if (/(^| )(category|cat|pat|product\s*targeting|product\s*type|pt )( |$)/.test(n)) return "category";
  if (/(^| )(non ?brand|nb)( |$)/.test(n)) return "generic";
  if (/(^| )(comp|competitor|competitors|conquest|conquesting|cq)( |$)/.test(n)) return "competitor";
  if (/brand/.test(n)) return "branded";
  if (/(^| )(generic|gen)( |$)/.test(n)) return "generic";
  return null;
}

interface Matcher {
  empty: boolean;
  test: (term: string) => { why: string } | null;
}

function makeMatcher(termsStr: string, fuzzy = true): Matcher {
  const entries = String(termsStr || "").toLowerCase().split(/[,\n;]+/).map((s) => s.trim().replace(/\s+/g, " ")).filter((s) => s.length >= 2);
  const phrases: { p: string; re: RegExp }[] = [];
  const words: string[] = [];
  entries.forEach((p) => {
    if (p.indexOf(" ") >= 0) phrases.push({ p, re: new RegExp("(^|[^a-z0-9])" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z0-9])") });
    else words.push(p);
  });
  return {
    empty: entries.length === 0,
    test: (term: string) => {
      const t = String(term || "").toLowerCase();
      for (const ph of phrases) if (ph.re.test(t)) return { why: `phrase "${ph.p}"` };
      if (!words.length) return null;
      const tokens = t.split(/[^a-z0-9]+/).filter((x) => x.length >= 2);
      for (const b of words) {
        for (const tok of tokens) {
          if (tok === b) return { why: `"${b}"` };
          if (b.length >= 5 && tok.indexOf(b) >= 0) return { why: `"${tok}" contains "${b}"` };
          if (fuzzy && b.length >= 6 && tok.length >= 4) {
            const max = b.length >= 8 ? 2 : 1;
            if (dlDist(tok, b, max) <= max) return { why: `"${tok}" ≈ "${b}" (misspelling)` };
          }
        }
      }
      return null;
    },
  };
}

function dlDist(a: string, b: string, max: number): number {
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  const d: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[al][bl];
}

function detectRoleByKeywords(campKeywords: Map<string, Set<string>> | undefined, brandMatcher: Matcher, compMatcher: Matcher): CampaignRole | null {
  if (!campKeywords || !campKeywords.size) return null;
  let branded = 0, competitor = 0, total = 0;
  campKeywords.forEach((_mts, kw) => {
    total++;
    if (!brandMatcher.empty && brandMatcher.test(kw)) { branded++; return; }
    if (!compMatcher.empty && compMatcher.test(kw)) competitor++;
  });
  if (total === 0) return null;
  if (branded / total >= 0.4) return "branded";
  if (competitor / total >= 0.4) return "competitor";
  return "generic";
}

export interface CampaignRoleInfo {
  cid: string;
  name: string;
  role: CampaignRole;
  roleSource: "name" | "keywords" | "pat" | "none";
}

export function detectRoles(bulk: BulkData, brandTerms: string, compTerms: string): CampaignRoleInfo[] {
  const brandMatcher = makeMatcher(brandTerms);
  const compMatcher = makeMatcher(compTerms);
  const out: CampaignRoleInfo[] = [];
  bulk.campaigns.forEach((c, cid) => {
    if (c.targeting.indexOf("manual") < 0 || c.state === "archived") return;
    const roleFromName = detectRoleByName(c.name);
    if (roleFromName !== null) { out.push({ cid, name: c.name, role: roleFromName, roleSource: "name" }); return; }
    const allKws = bulk.campKw.get(cid);
    const roleFromKw = detectRoleByKeywords(allKws, brandMatcher, compMatcher);
    if (roleFromKw !== null) { out.push({ cid, name: c.name, role: roleFromKw, roleSource: "keywords" }); return; }
    if (bulk.campHasPat.has(cid) && (!allKws || !allKws.size)) { out.push({ cid, name: c.name, role: "category", roleSource: "pat" }); return; }
    out.push({ cid, name: c.name, role: "unclassified", roleSource: "none" });
  });
  out.sort((a, b) => (a.name < b.name ? -1 : 1));
  return out;
}

// ══════════════════════════════════════════════════════════════
// Gap computation (computeGaps)
// ══════════════════════════════════════════════════════════════

export type GapState = "added" | "paused" | "not-added" | "blocked" | "no-home";

export interface GapDetail {
  cid: string;
  cname: string;
  agid: string;
  agname: string;
  asin: string;
  term: string;
  cls: HarvestRecord["cls"];
  sfr: number | null;
  cs: number | null;
  vs: number | null;
  state: GapState;
  reason?: string;
  bid?: number;
  bidBasis?: string;
  rationale?: string;
  sfrUrgency?: { level: "critical" | "high" | "medium"; label: string } | null;
  impressions?: number;
  clicks?: number;
  spend?: number;
  sales?: number;
  orders?: number;
  cpc?: number;
}

export interface GapStats {
  notAdded: number;
  partial: number;
  added: number;
  blocked: number;
  noCampaign: number;
}

export interface GapResult {
  details: GapDetail[];
  stats: GapStats;
  counts: Record<HarvestRecord["cls"], { notAdded: number; paused: number; added: number; issues: number }>;
}

function sfrUrgency(sfr: number | null): { level: "critical" | "high" | "medium"; label: string } | null {
  if (sfr == null) return null;
  if (sfr <= 1000) return { level: "critical", label: "🔴 Top 1K — critical demand" };
  if (sfr <= 10000) return { level: "high", label: "🟡 Top 10K — high demand" };
  if (sfr <= 100000) return { level: "medium", label: "Top 100K" };
  return null;
}

function bidFor(agid: string, bulk: BulkData, fallbackBid: number): { bid: number; basis: string } {
  // No per-ad-group historical spend/clicks/defaultBid carried in analyzeBulkAOA today —
  // fall back to account CPC, then the flat fallback bid (matches v9's cascade minus the
  // ad-group-level tiers, which would require carrying per-ad-group performance columns).
  const acctCpc = bulk.totals.clicks > 0 ? bulk.totals.spend / bulk.totals.clicks : null;
  let v: number, basis: string;
  if (acctCpc) { v = acctCpc * 1.1; basis = "account CPC +10%"; }
  else { v = fallbackBid; basis = "fallback bid"; }
  v = Math.max(0.02, Math.round(v * 100) / 100);
  void agid;
  return { bid: v, basis };
}

function buildRationale(rec: HarvestRecord, basis: string, agMts: string[], coveredCount: number): string {
  const parts: string[] = [];
  parts.push(rec.clsWhy || "no brand/competitor match — generic");
  if (rec.cs != null && rec.vs != null && rec.vs > rec.cs) {
    parts.push(`conversion share ${rec.vs.toFixed(1)}% > click share ${rec.cs.toFixed(1)}% — ranking upside`);
  }
  if (agMts.length) parts.push(`exists here as ${agMts.join("/")} — exact missing`);
  else if (coveredCount > 0) parts.push(`already exact in ${coveredCount} other ad group${coveredCount > 1 ? "s" : ""}`);
  else parts.push("not targeted anywhere for this ASIN");
  parts.push(`bid: ${basis}`);
  return parts.join(" · ");
}

function buildPausedRationale(rec: HarvestRecord, urgency: ReturnType<typeof sfrUrgency>): string {
  const parts: string[] = [];
  if (urgency) parts.push(urgency.label);
  parts.push("exists as exact match but currently paused — not serving · action: re-enable");
  void rec;
  return parts.join(" · ");
}

export function computeGaps(recs: HarvestRecord[], bulk: BulkData, roles: Map<string, CampaignRole>, fallbackBid = 0.75): GapResult {
  const details: GapDetail[] = [];
  const stats: GapStats = { notAdded: 0, partial: 0, added: 0, blocked: 0, noCampaign: 0 };
  const counts: GapResult["counts"] = {
    branded: { notAdded: 0, paused: 0, added: 0, issues: 0 },
    generic: { notAdded: 0, paused: 0, added: 0, issues: 0 },
    competitor: { notAdded: 0, paused: 0, added: 0, issues: 0 },
  };

  function eligible(agid: string): BulkAdGroup | null {
    const ag = bulk.adGroups.get(agid);
    if (!ag || ag.state === "archived") return null;
    const c = bulk.campaigns.get(ag.cid);
    if (!c || c.state === "archived") return null;
    if (c.targeting.indexOf("manual") < 0) return null;
    if ((roles.get(ag.cid) || "unclassified") === "category") return null;
    return ag;
  }

  const seen = new Set<string>();
  for (const r of recs) {
    const dk = r.asin + "" + r.term.toLowerCase();
    if (seen.has(dk)) continue;
    seen.add(dk);

    const allAgids = Array.from(bulk.asinAds.get(r.asin) || []);
    const allTargets = allAgids.map((id) => eligible(id)).filter((x): x is BulkAdGroup => !!x);

    let targets = allTargets.filter((t) => (roles.get(t.cid) || "unclassified") === r.cls);
    if (!targets.length && r.cls !== "competitor") {
      targets = allTargets.filter((t) => (roles.get(t.cid) || "unclassified") === "unclassified");
    }

    if (!targets.length) {
      details.push({ cid: "", cname: "", agid: "", agname: "", asin: r.asin, term: r.term, cls: r.cls, sfr: r.sfr, cs: r.cs, vs: r.vs, state: "no-home", reason: `No ${r.cls} campaign advertises this ASIN` });
      stats.noCampaign++;
      counts[r.cls].issues++;
      continue;
    }

    let missingCount = 0, coveredActive = 0, covered = 0;
    for (const ag of targets) {
      const c = bulk.campaigns.get(ag.cid)!;
      const kwMap = bulk.kw.get(ag.agid);
      const existing = kwMap?.get(r.term.toLowerCase());
      const hasExact = existing?.has("exact") ?? false;
      const negAG = bulk.negativesByAG.get(ag.agid)?.has(r.term.toLowerCase()) ?? false;
      const negCamp = bulk.negativesByCamp.get(ag.cid)?.has(r.term.toLowerCase()) ?? false;

      if (hasExact) {
        covered++;
        const state = bulk.kwState.get(ag.agid)?.get(r.term.toLowerCase()) || "enabled";
        if (state === "paused") {
          const urgency = sfrUrgency(r.sfr);
          details.push({
            cid: ag.cid, cname: c.name, agid: ag.agid, agname: ag.name, asin: r.asin, term: r.term, cls: r.cls,
            sfr: r.sfr, cs: r.cs, vs: r.vs, state: "paused", sfrUrgency: urgency, rationale: buildPausedRationale(r, urgency),
          });
          counts[r.cls].paused++;
        } else {
          coveredActive++;
          details.push({ cid: ag.cid, cname: c.name, agid: ag.agid, agname: ag.name, asin: r.asin, term: r.term, cls: r.cls, sfr: r.sfr, cs: r.cs, vs: r.vs, state: "added" });
          counts[r.cls].added++;
        }
      } else if (!hasExact && (negAG || negCamp)) {
        details.push({ cid: ag.cid, cname: c.name, agid: ag.agid, agname: ag.name, asin: r.asin, term: r.term, cls: r.cls, sfr: r.sfr, cs: r.cs, vs: r.vs, state: "blocked", reason: `Blocked by negative keyword in ${c.name}` });
        counts[r.cls].issues++;
      } else {
        missingCount++;
        const agMts = Array.from(existing || []);
        const { bid, basis } = bidFor(ag.agid, bulk, fallbackBid);
        details.push({
          cid: ag.cid, cname: c.name, agid: ag.agid, agname: ag.name, asin: r.asin, term: r.term, cls: r.cls,
          sfr: r.sfr, cs: r.cs, vs: r.vs, state: "not-added", bid, bidBasis: basis,
          rationale: buildRationale(r, basis, agMts, covered),
        });
        counts[r.cls].notAdded++;
      }
    }

    let status: "added" | "partial" | "not-added" | "blocked";
    if (missingCount > 0) status = coveredActive > 0 ? "partial" : "not-added";
    else if (coveredActive === targets.length) status = "added";
    else if (coveredActive > 0) status = "partial";
    else if (covered > 0) status = "partial";
    else status = "blocked";

    if (status === "added") stats.added++;
    else if (status === "partial") stats.partial++;
    else if (status === "not-added") stats.notAdded++;
    else stats.blocked++;
  }

  return { details, stats, counts };
}

// ══════════════════════════════════════════════════════════════
// Volume estimate, bulk export
// ══════════════════════════════════════════════════════════════

export function estMid(sfr: number | null): number | null {
  if (sfr == null || sfr <= 0) return null;
  return 8000000 * Math.pow(sfr, -0.35);
}

export function fmtVol(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e4) return Math.round(n / 1000) + "K";
  if (n >= 1e3) return (n / 1000).toFixed(1) + "K";
  return String(Math.max(1, Math.round(n)));
}

export function volRange(sfr: number | null): string {
  const m = estMid(sfr);
  if (m == null) return "—";
  return `${fmtVol(m * 0.6)}–${fmtVol(m * 1.4)}`;
}

export const BULK_HEADERS = [
  "Product", "Entity", "Operation", "Campaign ID", "Ad Group ID", "Portfolio ID", "Ad ID", "Keyword ID", "Product Targeting ID",
  "Campaign Name", "Ad Group Name", "Start Date", "End Date", "Targeting Type", "State", "Daily Budget", "SKU", "ASIN",
  "Ad Group Default Bid", "Bid", "Keyword Text", "Match Type", "Bidding Strategy", "Placement", "Percentage",
  "Product Targeting Expression",
];

export const MAXSEL = 1000;

export function buildBulkFromDetails(details: GapDetail[], selectedIdx: number[]): { aoa: (string | number)[][]; created: number; reenabled: number; kwCount: number } {
  const aoa: (string | number)[][] = [BULK_HEADERS.slice()];
  const dedupe = new Set<string>();
  const kwSet = new Set<string>();
  let created = 0, reenabled = 0;
  for (const idx of selectedIdx) {
    const d = details[idx];
    if (!d || (d.state !== "not-added" && d.state !== "paused")) continue;
    const dk = d.cid + "" + d.agid + "" + d.term.toLowerCase();
    if (dedupe.has(dk)) continue;
    dedupe.add(dk);
    kwSet.add(d.term.toLowerCase());
    if (d.state === "not-added") {
      created++;
      aoa.push(["Sponsored Products", "Keyword", "Create", d.cid, d.agid, "", "", "", "", d.cname, d.agname, "", "", "", "enabled", "", "", "", "", d.bid ?? "", d.term, "exact", "", "", "", ""]);
    } else {
      reenabled++;
      aoa.push(["Sponsored Products", "Keyword", "Update", d.cid, d.agid, "", "", "", "", d.cname, d.agname, "", "", "", "enabled", "", "", "", "", "", d.term, "exact", "", "", "", ""]);
    }
  }
  return { aoa, created, reenabled, kwCount: kwSet.size };
}
