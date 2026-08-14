"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import ToolkitNav from "@/components/ToolkitNav";
import {
  BulkData,
  CampaignRole,
  CampaignRoleInfo,
  GapDetail,
  HarvestRecord,
  MAXSEL,
  TSRParseResult,
  analyzeBulkAOA,
  buildBulkFromDetails,
  computeGaps,
  detectRoles,
  parseTopSearchTerms,
  runHarvest,
  volRange,
} from "@/lib/keywordHarvest";

const PAGE_SIZES = [20, 50, 100, 250];
const CLS_TABS: HarvestRecord["cls"][] = ["branded", "generic", "competitor"];
const SUB_TABS: { id: "not-added" | "paused" | "added" | "issues"; label: string }[] = [
  { id: "not-added", label: "Not added" },
  { id: "paused", label: "Paused" },
  { id: "added", label: "Added" },
  { id: "issues", label: "Issues" },
];

interface FileErr { title: string; message: string; detail?: string }

export default function KeywordHarvestPage() {
  const [tsr, setTsr] = useState<TSRParseResult | null>(null);
  const [tsrName, setTsrName] = useState("");
  const [bulk, setBulk] = useState<BulkData | null>(null);
  const [bulkName, setBulkName] = useState("");
  const [error1, setError1] = useState<FileErr | null>(null);
  const [error2, setError2] = useState<FileErr | null>(null);
  const [processing, setProcessing] = useState(false);

  const [recs, setRecs] = useState<HarvestRecord[]>([]);
  const [roleInfos, setRoleInfos] = useState<CampaignRoleInfo[]>([]);
  const [roleOverrides, setRoleOverrides] = useState<Record<string, CampaignRole>>({});
  const [gaps, setGaps] = useState<ReturnType<typeof computeGaps> | null>(null);

  const fileRef1 = useRef<HTMLInputElement>(null);
  const fileRef2 = useRef<HTMLInputElement>(null);

  // Harvest table state
  const [hFilter, setHFilter] = useState("");
  const [hSort, setHSort] = useState<{ key: string; dir: number }>({ key: "sfr", dir: 1 });
  const [hPage, setHPage] = useState(1);
  const [hPerPage, setHPerPage] = useState(20);

  // Gap table state
  const [gapTab, setGapTab] = useState<HarvestRecord["cls"]>("generic");
  const [subTab, setSubTab] = useState<"not-added" | "paused" | "added" | "issues">("not-added");
  const [gapFilter, setGapFilter] = useState("");
  const [gapPage, setGapPage] = useState(1);
  const [gapPerPage, setGapPerPage] = useState(20);
  const [gapSel, setGapSel] = useState<Set<number>>(new Set());

  // ── File 1: Brand Analytics ──
  const onFile1 = useCallback(async (file: File) => {
    setError1(null);
    if (/\.(xlsx|xls|xlsm|numbers)$/i.test(file.name)) {
      setError1({ title: "Excel file detected", message: 'The Brand Analytics input must be the CSV export. In Brand Analytics choose "Download CSV" (or open in Excel and Save As → CSV). The bulk campaign file in step 2 is where .xlsx belongs.', detail: `File: ${file.name}` });
      return;
    }
    if (!file.size) { setError1({ title: "Empty file", message: "The selected file has no content.", detail: `File: ${file.name}` }); return; }
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) {
      setError1({ title: "This looks like an Excel/zip file", message: "Re-export the Top Search Terms report as plain CSV, then upload again.", detail: `File: ${file.name}` });
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseTopSearchTerms(text);
      setTsr(parsed);
      setTsrName(file.name);
    } catch (err) {
      setError1({ title: "Required columns not found", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // ── File 2: Bulk campaign file ──
  const onFile2 = useCallback(async (file: File) => {
    setError2(null);
    if (!file.size) { setError2({ title: "Empty file", message: "The selected bulk file has no content.", detail: `File: ${file.name}` }); return; }
    try {
      const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
      let aoa: unknown[][];
      if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
        let sheetName = wb.SheetNames.find((n) => /sponsored\s*products\s*camp/i.test(n));
        if (!sheetName) {
          sheetName = wb.SheetNames.find((n) => {
            const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1 }).slice(0, 10);
            return rows.some((r) => Array.isArray(r) && r.some((c) => String(c).toLowerCase().trim() === "entity") && r.some((c) => String(c).toLowerCase().includes("campaign id")));
          });
        }
        if (!sheetName) {
          setError2({ title: "No Sponsored Products sheet found", message: "None of the tabs in this workbook contain bulk campaign headers.", detail: `Tabs: ${wb.SheetNames.slice(0, 12).join(", ")}` });
          return;
        }
        aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1 });
      } else {
        const text = await file.text();
        const delim = text.split("\n")[0].includes("\t") ? "\t" : ",";
        aoa = text.split(/\r?\n/).map((l) => l.split(delim));
      }
      const data = analyzeBulkAOA(aoa);
      setBulk(data);
      setBulkName(file.name);
    } catch (err) {
      setError2({ title: "Not a bulk operations file", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // ── Auto-run once both files are loaded ──
  useEffect(() => {
    if (!tsr || !bulk) return;
    const t0 = setTimeout(() => setProcessing(true), 0);
    const t = setTimeout(() => {
      try {
        const asins = Array.from(bulk.asinAds.keys());
        const harvested = runHarvest(tsr, asins);
        const infos = detectRoles(bulk, "", "");
        setRoleInfos(infos);
        const roleMap = new Map<string, CampaignRole>();
        infos.forEach((i) => roleMap.set(i.cid, roleOverrides[i.cid] || i.role));
        const gapResult = computeGaps(harvested, bulk, roleMap, 0.75);
        setRecs(harvested);
        setGaps(gapResult);

        const sel = new Set<number>();
        for (let gi = 0; gi < gapResult.details.length && sel.size < MAXSEL; gi++) {
          const gd = gapResult.details[gi];
          if (gd.state === "not-added") sel.add(gi);
          else if (gd.state === "paused" && gd.sfr != null && gd.sfr <= 10000) sel.add(gi);
        }
        setGapSel(sel);

        const nonZero = CLS_TABS.find((c) => gapResult.counts[c].notAdded > 0);
        setGapTab(nonZero || "branded");
      } finally {
        setProcessing(false);
      }
    }, 30);
    return () => { clearTimeout(t0); clearTimeout(t); };
  }, [tsr, bulk, roleOverrides]);

  // ── Harvest table derived view ──
  const harvestView = useMemo(() => {
    const f = hFilter.trim().toLowerCase();
    let rows = recs.filter((r) => !f || r.term.toLowerCase().includes(f) || r.asin.toLowerCase().includes(f));
    const key = hSort.key, dir = hSort.dir;
    const val = (r: HarvestRecord): number | string => {
      switch (key) {
        case "term": return r.term.toLowerCase();
        case "asin": return r.asin.toLowerCase();
        case "sfr": return r.sfr == null ? Infinity : r.sfr;
        case "pos": return r.pos;
        case "cs": return r.cs ?? -1;
        case "vs": return r.vs ?? -1;
        default: return 0;
      }
    };
    rows = [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return (a.sfr == null ? Infinity : a.sfr) - (b.sfr == null ? Infinity : b.sfr);
    });
    return rows;
  }, [recs, hFilter, hSort]);

  const hTotalPages = Math.max(1, Math.ceil(harvestView.length / hPerPage));
  const hPageRows = harvestView.slice((hPage - 1) * hPerPage, hPage * hPerPage);

  // ── Gap table derived view ──
  const gapDetailsForTab = useMemo(() => {
    if (!gaps) return [];
    return gaps.details
      .map((d, idx) => ({ d, idx }))
      .filter(({ d }) => d.cls === gapTab)
      .filter(({ d }) => (subTab === "issues" ? d.state === "blocked" || d.state === "no-home" : d.state === subTab));
  }, [gaps, gapTab, subTab]);

  const gapView = useMemo(() => {
    const f = gapFilter.trim().toLowerCase();
    if (!f) return gapDetailsForTab;
    return gapDetailsForTab.filter(({ d }) => `${d.term} ${d.asin} ${d.cname} ${d.agname}`.toLowerCase().includes(f));
  }, [gapDetailsForTab, gapFilter]);

  const gapTotalPages = Math.max(1, Math.ceil(gapView.length / gapPerPage));
  const gapPageRows = gapView.slice((gapPage - 1) * gapPerPage, gapPage * gapPerPage);

  const exportHarvestCsv = useCallback(() => {
    const head = ["Keyword", "SFR", "Est volume low", "Est volume high", "Click position", "Click share %", "Conversion share %", "Target ASIN"];
    const q = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [head.map(q).join(",")];
    for (const r of harvestView) {
      const [lo, hi] = volRange(r.sfr) === "—" ? ["", ""] : volRange(r.sfr).split("–");
      lines.push([q(r.term), r.sfr ?? "", lo, hi, r.pos, r.cs?.toFixed(2) ?? "", r.vs?.toFixed(2) ?? "", r.asin].map(q).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keyword-harvest-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [harvestView]);

  const exportBulkSheet = useCallback(() => {
    if (!gaps) return;
    const { aoa, created, reenabled, kwCount } = buildBulkFromDetails(gaps.details, Array.from(gapSel));
    if (created + reenabled === 0) return;
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sponsored Products Campaigns");
    XLSX.writeFile(wb, `bulk-keyword-adds-${new Date().toISOString().slice(0, 10)}.xlsx`);
    void kwCount;
  }, [gaps, gapSel]);

  const toggleRole = useCallback((cid: string, role: CampaignRole) => {
    setRoleOverrides((prev) => ({ ...prev, [cid]: role }));
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        .kh-main { flex:1; padding:32px 40px 80px; }
        .kh-wrap { max-width:1100px; margin:0 auto; }
        .kh-upload-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
        .kh-err { background:var(--danger-bg); border:1px solid var(--danger-border); border-radius:8px; padding:10px 12px; margin-top:10px; font-size:12px; }
        .kh-err strong { display:block; margin-bottom:2px; }
        .kh-tabbar { display:flex; gap:6px; border-bottom:1px solid var(--border); margin-bottom:14px; }
        .kh-tab { padding:8px 16px; font-size:13px; font-weight:700; cursor:pointer; color:var(--ink-soft); border-bottom:2px solid transparent; }
        .kh-tab.active { color:var(--orange); border-bottom-color:var(--orange); }
        .kh-subtab { display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid var(--border); margin-right:6px; color:var(--ink-soft); }
        .kh-subtab.active { background:var(--orange); border-color:var(--orange); color:#fff; }
        .kh-toolbar { display:flex; gap:10px; align-items:center; margin-bottom:10px; flex-wrap:wrap; }
        .kh-toolbar input, .kh-toolbar select { border:1px solid var(--border); border-radius:8px; padding:7px 10px; font-size:12px; }
        .kh-pager { display:flex; align-items:center; gap:10px; margin-top:10px; font-size:12px; color:var(--ink-soft); }
        .role-row { display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-soft); font-size:12px; }
      `}</style>

      <ToolkitNav active="/keyword-harvest" />

      <main className="kh-main">
        <div className="kh-wrap">
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Keyword Harvest — Campaign Gap Analysis</h1>
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              Upload your Brand Analytics Top Search Terms CSV and your Sponsored Products bulk file. The tool automatically finds every
              keyword your ASINs rank for and shows you exactly what&apos;s missing from your campaigns. All processing is local — no data leaves your browser.
            </p>
          </div>

          <div className="kh-upload-grid" style={{ marginBottom: 28 }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Step 1 — Brand Analytics report</div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 10 }}>Brand Analytics → Top Search Terms → Download CSV</div>
              <div className="upload-zone" onClick={() => fileRef1.current?.click()}>
                <div className="upload-zone-icon">📄</div>
                <div className="upload-zone-text">Drop the Top Search Terms CSV here, or click to browse</div>
                <div className="upload-zone-sub">Weekly export · large files are fine</div>
                <input ref={fileRef1} type="file" accept=".csv,.tsv,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile1(f); e.target.value = ""; }} />
              </div>
              {tsrName && !error1 && <div className="hint" style={{ marginTop: 8, fontSize: 12 }}>✓ {tsrName}</div>}
              {error1 && <div className="kh-err"><strong>{error1.title}</strong>{error1.message}{error1.detail && <div style={{ opacity: 0.7 }}>{error1.detail}</div>}</div>}
            </div>

            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Step 2 — Bulk campaign file</div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 10 }}>Campaign Manager → Bulk operations → download with performance data</div>
              <div className="upload-zone" onClick={() => fileRef2.current?.click()}>
                <div className="upload-zone-icon">🗂️</div>
                <div className="upload-zone-text">Drop the bulk .xlsx here, or click to browse</div>
                <div className="upload-zone-sub">Enables gap analysis + one-click bulk upload sheet · CSV also accepted</div>
                <input ref={fileRef2} type="file" accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile2(f); e.target.value = ""; }} />
              </div>
              {bulkName && !error2 && <div className="hint" style={{ marginTop: 8, fontSize: 12 }}>✓ {bulkName}</div>}
              {error2 && <div className="kh-err"><strong>{error2.title}</strong>{error2.message}{error2.detail && <div style={{ opacity: 0.7 }}>{error2.detail}</div>}</div>}
              {bulk?.idRisk && (
                <div className="kh-err" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)" }}>
                  Campaign/Ad Group IDs in this file are stored as numbers, and some are too large for exact precision. In Excel, format the ID columns as Text and re-save before trusting the output sheet.
                </div>
              )}
            </div>
          </div>

          {processing && <div className="hint">Scanning Brand Analytics data against your bulk file…</div>}

          {!tsr && (
            <div className="hint">Upload the Brand Analytics report to begin.</div>
          )}

          {recs.length > 0 && (
            <div className="cg-section" style={{ marginBottom: 32 }}>
              <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
                <StatTile n={recs.length} l="Keywords found" />
                <StatTile n={recs.reduce((m, r) => (r.sfr != null && r.sfr < m ? r.sfr : m), Infinity) === Infinity ? "—" : recs.reduce((m, r) => (r.sfr != null && r.sfr < m ? r.sfr : m), Infinity)} l="Best SFR" />
                <StatTile n={recs.filter((r) => r.pos === 1).length} l="#1 clicked position" />
                <StatTile n={recs.filter((r) => r.cs != null && r.vs != null && r.vs > r.cs).length} l="Ranking opportunities" />
              </div>

              <div className="kh-toolbar">
                <input placeholder="Filter keyword or ASIN…" value={hFilter} onChange={(e) => { setHFilter(e.target.value); setHPage(1); }} style={{ minWidth: 220 }} />
                <select value={hPerPage} onChange={(e) => setHPerPage(parseInt(e.target.value, 10))}>
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <button className="btn btn-secondary" style={{ marginLeft: "auto", padding: "6px 14px" }} onClick={exportHarvestCsv}>Export CSV</button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="tk-table">
                  <thead>
                    <tr>
                      {[["term", "Keyword"], ["asin", "ASIN"], ["sfr", "SFR"], ["vol", "Est. volume"], ["pos", "Position"], ["cs", "Click share"], ["vs", "Conv. share"]].map(([k, label]) => (
                        <th key={k} style={{ cursor: k === "vol" ? "default" : "pointer" }} onClick={() => k !== "vol" && setHSort((prev) => (prev.key === k ? { key: k, dir: -prev.dir } : { key: k, dir: 1 }))}>
                          {label}{hSort.key === k ? (hSort.dir === 1 ? " ▲" : " ▼") : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hPageRows.map((r, i) => (
                      <tr key={i} style={r.cs != null && r.vs != null && r.vs > r.cs ? { background: "var(--success-bg)" } : undefined}>
                        <td>{r.term}</td>
                        <td>{r.asin}</td>
                        <td>{r.sfr ?? "—"}</td>
                        <td>{volRange(r.sfr)}</td>
                        <td>#{r.pos}</td>
                        <td>{r.cs != null ? r.cs.toFixed(1) + "%" : "—"}</td>
                        <td>{r.vs != null ? r.vs.toFixed(1) + "%" : "—"}</td>
                      </tr>
                    ))}
                    {hPageRows.length === 0 && <tr><td colSpan={7} className="hint">No keywords match this filter.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="kh-pager">
                <button className="btn btn-ghost" disabled={hPage <= 1} onClick={() => setHPage((p) => p - 1)}>← Prev</button>
                Page {hPage} of {hTotalPages} · {harvestView.length} rows
                <button className="btn btn-ghost" disabled={hPage >= hTotalPages} onClick={() => setHPage((p) => p + 1)}>Next →</button>
              </div>
            </div>
          )}

          {bulk && gaps && (
            <div className="cg-section">
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Campaign gap analysis</h2>
              <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 16 }}>
                <StatTile n={gaps.stats.notAdded} l="Keywords not added" />
                <StatTile n={gaps.stats.partial} l="Partially covered" />
                <StatTile n={gaps.stats.added} l="Fully added" />
                <StatTile n={gaps.stats.blocked} l="Blocked by negatives" />
                <StatTile n={gaps.stats.noCampaign} l="No matching campaign" />
              </div>

              <div className="kh-tabbar">
                {CLS_TABS.map((c) => (
                  <div key={c} className={`kh-tab${gapTab === c ? " active" : ""}`} onClick={() => { setGapTab(c); setGapPage(1); }}>
                    {c.charAt(0).toUpperCase() + c.slice(1)} {gaps.counts[c].notAdded > 0 ? `(${gaps.counts[c].notAdded})` : "✓"}
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 12 }}>
                {SUB_TABS.map((t) => {
                  const countKey = t.id === "not-added" ? "notAdded" : t.id === "issues" ? "issues" : t.id;
                  return (
                    <span key={t.id} className={`kh-subtab${subTab === t.id ? " active" : ""}`} onClick={() => { setSubTab(t.id); setGapPage(1); }}>
                      {t.label} ({gaps.counts[gapTab][countKey]})
                    </span>
                  );
                })}
              </div>

              <div className="kh-toolbar">
                <input placeholder="Filter keyword, ASIN, campaign…" value={gapFilter} onChange={(e) => { setGapFilter(e.target.value); setGapPage(1); }} style={{ minWidth: 240 }} />
                <select value={gapPerPage} onChange={(e) => setGapPerPage(parseInt(e.target.value, 10))}>
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
                {(subTab === "not-added" || subTab === "paused") && (
                  <button className="btn btn-primary" style={{ marginLeft: "auto", padding: "6px 14px" }} onClick={exportBulkSheet}>
                    Download bulk sheet ({gapSel.size} selected)
                  </button>
                )}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="tk-table">
                  <thead>
                    <tr>
                      {(subTab === "not-added" || subTab === "paused") && <th></th>}
                      <th>Campaign</th><th>Ad group</th><th>ASIN</th><th>Keyword</th><th>SFR</th><th>Est. vol</th>
                      {subTab === "not-added" && <th>Bid</th>}
                      {(subTab === "not-added" || subTab === "paused") && <th>Rationale</th>}
                      {subTab === "issues" && <th>Reason</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {gapPageRows.map(({ d, idx }) => (
                      <GapRow key={idx} d={d} idx={idx} subTab={subTab} selected={gapSel.has(idx)} onToggle={() => setGapSel((prev) => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else if (n.size < MAXSEL) n.add(idx); return n; })} />
                    ))}
                    {gapPageRows.length === 0 && <tr><td colSpan={8} className="hint">No rows match this filter.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="kh-pager">
                <button className="btn btn-ghost" disabled={gapPage <= 1} onClick={() => setGapPage((p) => p - 1)}>← Prev</button>
                Page {gapPage} of {gapTotalPages} · {gapView.length} rows
                <button className="btn btn-ghost" disabled={gapPage >= gapTotalPages} onClick={() => setGapPage((p) => p + 1)}>Next →</button>
              </div>

              <details className="card" style={{ marginTop: 24, padding: 16 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Campaign roles — detected from names, adjust if wrong</summary>
                <div style={{ marginTop: 10 }}>
                  {roleInfos.map((info) => (
                    <div className="role-row" key={info.cid}>
                      <span>{info.name} <span className="hint">(detected via {info.roleSource})</span></span>
                      <select value={roleOverrides[info.cid] || info.role} onChange={(e) => toggleRole(info.cid, e.target.value as CampaignRole)}>
                        <option value="branded">branded</option>
                        <option value="generic">generic</option>
                        <option value="competitor">competitor</option>
                        <option value="category">category (skip — PAT only)</option>
                        <option value="unclassified">unclassified</option>
                      </select>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {tsr && !bulk && (
            <div className="card" style={{ padding: 20, textAlign: "center", marginTop: 20 }}>
              Upload a Sponsored Products bulk file in step 2 to see which of these keywords are already in your campaigns — and generate a bulk upload sheet for the missing ones.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatTile({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="stat-tile" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{n}</div>
      <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>{l}</div>
    </div>
  );
}

function GapRow({ d, subTab, selected, onToggle }: { d: GapDetail; idx: number; subTab: string; selected: boolean; onToggle: () => void }) {
  return (
    <tr>
      {(subTab === "not-added" || subTab === "paused") && (
        <td><input type="checkbox" checked={selected} onChange={onToggle} /></td>
      )}
      <td>{d.cname || "—"}</td>
      <td>{d.agname || "—"}</td>
      <td>{d.asin}</td>
      <td>
        {d.term}
        {d.sfrUrgency && <span className="badge badge-warning" style={{ marginLeft: 6 }}>{d.sfrUrgency.label}</span>}
      </td>
      <td>{d.sfr ?? "—"}</td>
      <td>{volRange(d.sfr)}</td>
      {subTab === "not-added" && <td title={d.bidBasis}>${d.bid?.toFixed(2)}</td>}
      {(subTab === "not-added" || subTab === "paused") && <td style={{ fontSize: 11, color: "var(--ink-soft)" }}>{d.rationale}</td>}
      {subTab === "issues" && <td style={{ fontSize: 11, color: "var(--ink-soft)" }}>{d.reason}</td>}
    </tr>
  );
}
