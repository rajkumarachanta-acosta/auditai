"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import ToolkitNav from "@/components/ToolkitNav";
import {
  CampaignGenState,
  DEFAULT_STATE,
  MatchType,
  Product,
  Tactic,
  buildPreview,
  calcBid,
  bidMultipliers,
  generateBulkRows,
  isValidAsin,
  parseProductCSV,
  productIssues,
  runValidation,
} from "@/lib/campaignGenerator";
import { downloadBulkWorkbook } from "@/lib/campaignGeneratorExport";

type PageId = "setup" | "products" | "targeting" | "bidengine" | "budget" | "generate";

const PAGES: { id: PageId; label: string; icon: string }[] = [
  { id: "setup", label: "Campaign Setup", icon: "1" },
  { id: "products", label: "Products & Keywords", icon: "2" },
  { id: "targeting", label: "Targeting", icon: "3" },
  { id: "bidengine", label: "Bid Engine", icon: "4" },
  { id: "budget", label: "Budget Split", icon: "5" },
  { id: "generate", label: "Review & Generate", icon: "6" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CampaignGeneratorPage() {
  const [s, setS] = useState<CampaignGenState>(DEFAULT_STATE);
  const [page, setPage] = useState<PageId>("setup");
  const [toast, setToast] = useState<{ msg: string; kind: "error" | "success" | "info" } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [successResult, setSuccessResult] = useState<{ campaigns: number; adGroups: number; kwTargets: number; rows: number; fileName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback((p: Partial<CampaignGenState>) => setS((prev) => ({ ...prev, ...p })), []);

  const showToast = useCallback((msg: string, kind: "error" | "success" | "info" = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── File upload ──
  const processFile = useCallback(
    async (file: File) => {
      try {
        const isExcel = /\.xlsx?$/i.test(file.name);
        let text: string;
        if (isExcel) {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
          const first = wb.SheetNames[0];
          if (!first) throw new Error("That workbook has no sheets.");
          text = XLSX.utils.sheet_to_csv(wb.Sheets[first]);
        } else {
          text = await file.text();
        }
        const result = parseProductCSV(text);
        patch({ products: result.products, keywords: result.keywords });
        setFileName(file.name);
        setSuccessResult(null);
        showToast(`Loaded ${result.products.length} products, ${result.keywords.length} keywords.`, "success");
      } catch (err) {
        showToast("Failed to parse file: " + (err instanceof Error ? err.message : String(err)), "error");
      }
    },
    [patch, showToast]
  );

  const downloadTemplate = useCallback(() => {
    const headers = ["ASIN", "Brand Name", "Category", "Sub Category", "Ad Group Name", "Unique ID 2", "Portfolio ID", "Product Title"];
    const example = ["B0CDCJRQKK", "Acme Corp", "Wall Art", "Canvas Art", "Framed Canvas", "", "123456789", "Acme Corp Framed Canvas Wall Art Print 24x36"];
    const csv = [headers, example].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaign-generator-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Derived ──
  const validation = useMemo(() => runValidation(s), [s]);
  const preview = useMemo(() => (validation.errors.length === 0 ? buildPreview(s) : null), [s, validation.errors.length]);

  const handleGenerate = useCallback(() => {
    if (validation.errors.length > 0) {
      showToast("Fix validation errors before generating.", "error");
      return;
    }
    const result = generateBulkRows(s);
    downloadBulkWorkbook(result);
    setSuccessResult({
      campaigns: result.counts.campaigns,
      adGroups: result.counts.adGroups,
      kwTargets: result.counts.keywords + result.counts.targets,
      rows: result.spRows.length,
      fileName: result.fileName,
    });
    showToast(`Generated ${result.spRows.length.toLocaleString()} rows across ${result.counts.campaigns} campaigns.`, "success");
  }, [s, validation.errors.length, showToast]);

  const stepStatus = (id: PageId): "idle" | "partial" | "done" | "error" => {
    switch (id) {
      case "setup": {
        const need = [s.adType, s.bid, s.budget, s.startDate, s.state];
        const have = need.filter(Boolean).length;
        return have === need.length ? "done" : have === 0 ? "idle" : "partial";
      }
      case "products": {
        if (!s.products.length) return "idle";
        const bad = s.products.filter((p) => !p.asin || !p.brand || !p.cat || !p.agName).length;
        return bad ? "error" : "done";
      }
      case "targeting": {
        const on = (["generic", "branded", "prodbr", "prodcomp", "auto"] as Tactic[]).filter((t) => s[("tac_" + t) as keyof CampaignGenState] === true);
        if (!on.length) return "idle";
        if (s.tac_branded === true && !s.brandKw.trim()) return "error";
        if (s.tac_prodbr === true && !s.prodAsinsBr.trim()) return "error";
        if (s.tac_prodcomp === true && !s.prodAsinsComp.trim()) return "error";
        return "done";
      }
      case "bidengine": {
        if (s.bidEngineEnabled === null) return "idle";
        if (!s.bidEngineEnabled) return "done";
        const fl = typeof s.be_floor === "number" ? s.be_floor : parseFloat(String(s.be_floor)) || 0;
        const cl = typeof s.be_ceil === "number" ? s.be_ceil : parseFloat(String(s.be_ceil)) || 0;
        if (fl > 0 && cl > 0 && fl >= cl) return "error";
        return "done";
      }
      case "budget": {
        if (s.budgetSplit === null) return "idle";
        if (!s.budgetSplit) return "done";
        const bsTotal = typeof s.bs_total === "number" ? s.bs_total : parseFloat(String(s.bs_total)) || 0;
        if (!(bsTotal > 0)) return "error";
        const sum = s.bs_generic + s.bs_branded + s.bs_auto + s.bs_prodbr + s.bs_prodcomp;
        return Math.round(sum) === 100 ? "done" : "partial";
      }
      case "generate":
        return validation.errors.length === 0 ? "done" : "partial";
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        .cg-body { display:flex; flex:1; min-height:0; }
        .cg-rail { width:250px; min-width:250px; background:#fff; border-right:1px solid var(--border); padding:18px 12px; overflow-y:auto; }
        .cg-rail-item { display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:8px; cursor:pointer; margin-bottom:2px; font-size:13px; font-weight:600; color:var(--ink-soft); }
        .cg-rail-item:hover { background:var(--surface); }
        .cg-rail-item.active { background:var(--orange-wash); color:var(--orange); }
        .cg-rail-dot { width:20px; height:20px; border-radius:50%; border:2px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; flex-shrink:0; color:var(--ink-faint); }
        .cg-rail-item.active .cg-rail-dot { border-color:var(--orange); color:var(--orange); }
        .cg-rail-dot.done { border-color:var(--success); background:var(--success); color:#fff; }
        .cg-rail-dot.error { border-color:var(--danger); background:var(--danger); color:#fff; }
        .cg-main { flex:1; overflow-y:auto; padding:32px 40px 80px; }
        .cg-page { max-width:760px; margin:0 auto; }
        .cg-section { margin-bottom:28px; }
        .cg-section h2 { font-size:18px; font-weight:800; margin:0 0 4px; }
        .cg-section .sub { font-size:13px; color:var(--ink-soft); margin-bottom:16px; }
        .cg-field { margin-bottom:16px; }
        .cg-field label { display:block; font-size:12px; font-weight:700; color:var(--ink); margin-bottom:6px; }
        .cg-field .hint { font-size:11px; color:var(--ink-faint); margin-top:4px; }
        .cg-input { width:100%; border:1px solid var(--border); border-radius:8px; padding:9px 12px; font-size:13px; font-family:inherit; outline:none; }
        .cg-input:focus { border-color:var(--orange); }
        .cg-row { display:flex; gap:14px; }
        .cg-row > * { flex:1; }
        .seg { display:inline-flex; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
        .seg button { border:none; background:#fff; padding:9px 18px; font-size:13px; font-weight:700; cursor:pointer; color:var(--ink-soft); }
        .seg button.on { background:var(--orange); color:#fff; }
        .seg button:disabled { color:var(--ink-faint); cursor:not-allowed; background:#f5f5f5; }
        .toggle2 { display:inline-flex; border:1px solid var(--border); border-radius:20px; overflow:hidden; }
        .toggle2 button { border:none; background:#fff; padding:6px 16px; font-size:12px; font-weight:700; cursor:pointer; color:var(--ink-soft); }
        .toggle2 button.on-yes.active { background:var(--success); color:#fff; }
        .toggle2 button.on-no.active { background:var(--ink-faint); color:#fff; }
        .cg-check { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; padding:8px 0; }
        .cg-slider-row { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
        .cg-slider-row label { flex:0 0 190px; font-size:12px; font-weight:600; color:var(--ink); }
        .cg-slider-row input[type=range] { flex:1; }
        .cg-slider-val { width:52px; text-align:right; font-size:12px; font-weight:700; color:var(--orange); font-variant-numeric:tabular-nums; }
        .tactic-card { border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:14px; }
        .tactic-head { display:flex; align-items:center; justify-content:space-between; }
        .tactic-head strong { font-size:14px; }
        .tactic-body { margin-top:12px; }
        .toast { position:fixed; bottom:24px; right:24px; padding:12px 18px; border-radius:10px; font-size:13px; font-weight:600; color:#fff; z-index:100; box-shadow:0 8px 24px rgba(0,0,0,.15); }
        .toast.error { background:var(--danger); }
        .toast.success { background:var(--success); }
        .toast.info { background:var(--navy); }
        .val-item { display:flex; gap:10px; padding:10px 12px; border-radius:8px; font-size:12px; margin-bottom:6px; align-items:flex-start; }
        .val-item.error { background:var(--danger-bg); border:1px solid var(--danger-border); }
        .val-item.warn { background:var(--warning-bg); border:1px solid var(--warning-border); }
        .val-item.ok { background:var(--success-bg); border:1px solid var(--success-border); }
        .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:16px 0; }
        .stat-tile { border:1px solid var(--border); border-radius:10px; padding:12px; text-align:center; }
        .stat-tile .n { font-size:22px; font-weight:800; }
        .stat-tile .l { font-size:11px; color:var(--ink-soft); margin-top:2px; }
        .product-card { border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; }
        .product-card .meta { font-size:11px; color:var(--ink-soft); }
      `}</style>

      <ToolkitNav active="/campaign-generator" />

      <div className="cg-body">
        <div className="cg-rail">
          {PAGES.map((p) => {
            const status = stepStatus(p.id);
            return (
              <div key={p.id} className={`cg-rail-item${page === p.id ? " active" : ""}`} onClick={() => setPage(p.id)}>
                <span className={`cg-rail-dot ${status}`}>{status === "done" ? "✓" : status === "error" ? "!" : p.icon}</span>
                {p.label}
              </div>
            );
          })}
          <div style={{ marginTop: 20, padding: "12px 10px", borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Run tape</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              {preview ? `${preview.totalCampaigns} campaigns · ${preview.keywordCount} keywords` : "Complete setup to preview"}
            </div>
          </div>
        </div>

        <div className="cg-main">
          <div className="cg-page">
            {page === "setup" && (
              <>
                <div className="cg-section">
                  <h2>Ad Type &amp; Targeting</h2>
                  <p className="sub">Only Sponsored Products is generated by this build.</p>
                  <div className="seg">
                    <button className={s.adType === "SP" ? "on" : ""} onClick={() => patch({ adType: "SP" })}>SP</button>
                    <button disabled title="Not generated by this build yet">SB</button>
                    <button disabled title="Not generated by this build yet">SD</button>
                  </div>
                  {s.adType === "SP" && (
                    <div style={{ marginTop: 16 }}>
                      <div className="cg-field">
                        <label>Targeting Mode</label>
                        <div className="seg">
                          <button className={s.targeting === "MANUAL" ? "on" : ""} onClick={() => patch({ targeting: "MANUAL" })}>Manual</button>
                          <button className={s.targeting === "AUTO" ? "on" : ""} onClick={() => patch({ targeting: "AUTO" })}>Auto</button>
                        </div>
                      </div>
                      {s.targeting === "MANUAL" && (
                        <div className="cg-field">
                          <label>Match Types (at least 1 required)</label>
                          {(["exact", "phrase", "broad"] as MatchType[]).map((mt) => (
                            <label key={mt} className="cg-check">
                              <input
                                type="checkbox"
                                checked={s.matchTypes.includes(mt)}
                                onChange={(e) => {
                                  const set = new Set(s.matchTypes);
                                  if (e.target.checked) set.add(mt); else set.delete(mt);
                                  patch({ matchTypes: Array.from(set) });
                                }}
                              />
                              {mt.charAt(0).toUpperCase() + mt.slice(1)}
                            </label>
                          ))}
                          <div className="hint">When multiple match types are selected, separate campaigns are created per type.</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="cg-section">
                  <h2>Financials</h2>
                  <div className="cg-row">
                    <div className="cg-field">
                      <label>Default Bid ($)</label>
                      <input className="cg-input" type="number" min={0.02} step={0.01} value={s.bid} onChange={(e) => patch({ bid: e.target.value === "" ? "" : parseFloat(e.target.value) })} />
                    </div>
                    <div className="cg-field">
                      <label>Default Budget ($)</label>
                      <input className="cg-input" type="number" min={1} step={1} value={s.budget} onChange={(e) => patch({ budget: e.target.value === "" ? "" : parseFloat(e.target.value) })} />
                    </div>
                  </div>
                  <div className="cg-row">
                    <div className="cg-field">
                      <label>Start Date</label>
                      <input className="cg-input" type="date" min={todayISO()} value={s.startDate} onChange={(e) => patch({ startDate: e.target.value })} />
                    </div>
                    <div className="cg-field">
                      <label>End Date (optional)</label>
                      <input className="cg-input" type="date" value={s.endDate} onChange={(e) => patch({ endDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="cg-row">
                    <div className="cg-field">
                      <label>Campaign State</label>
                      <select className="cg-input" value={s.state} onChange={(e) => patch({ state: e.target.value as CampaignGenState["state"] })}>
                        <option value="">— Select —</option>
                        <option value="enabled">enabled</option>
                        <option value="paused">paused</option>
                      </select>
                    </div>
                    <div className="cg-field">
                      <label>Bid Strategy (optional)</label>
                      <select className="cg-input" value={s.bidStrategy} onChange={(e) => patch({ bidStrategy: e.target.value })}>
                        <option value="">Default: Dynamic bids - down only</option>
                        <option value="Dynamic bids - down only">Dynamic bids - down only</option>
                        <option value="Dynamic bids - up and down">Dynamic bids - up and down</option>
                        <option value="Fixed bids">Fixed bids</option>
                      </select>
                    </div>
                  </div>
                  <div className="cg-field">
                    <label>Default Portfolio ID (optional)</label>
                    <input className="cg-input" value={s.portfolio} onChange={(e) => patch({ portfolio: e.target.value })} placeholder="Can be overridden per product row" />
                  </div>
                </div>

                <div className="cg-section">
                  <h2>Placement Bid Adjustments</h2>
                  <p className="sub">0 = no adjustment.</p>
                  {([
                    ["Top of Search (%)", "topPct"],
                    ["Product Page (%)", "ppPct"],
                    ["Rest of Search (%)", "rosPct"],
                  ] as [string, "topPct" | "ppPct" | "rosPct"][]).map(([label, key]) => (
                    <div className="cg-slider-row" key={key}>
                      <label>{label}</label>
                      <input type="range" min={0} max={900} step={10} value={s[key]} onChange={(e) => patch({ [key]: parseInt(e.target.value, 10) } as Partial<CampaignGenState>)} />
                      <span className="cg-slider-val">{s[key]}%</span>
                    </div>
                  ))}
                </div>

                <div className="cg-section">
                  <h2>Keyword Fallback</h2>
                  <div className="toggle2">
                    <button className={`on-yes${s.autoFill ? " active" : ""}`} onClick={() => patch({ autoFill: true })}>Auto-fill</button>
                    <button className={`on-no${!s.autoFill ? " active" : ""}`} onClick={() => patch({ autoFill: false })}>Manual only</button>
                  </div>
                  <p className="hint" style={{ marginTop: 8 }}>
                    When Auto-fill is on, ASINs with no keywords receive a placeholder keyword in <em>paused</em> state so their ad group and product ad rows are still created.
                  </p>
                </div>
              </>
            )}

            {page === "products" && (
              <ProductsPage
                s={s}
                fileName={fileName}
                dragging={dragging}
                setDragging={setDragging}
                fileInputRef={fileInputRef}
                onFile={processFile}
                onDownloadTemplate={downloadTemplate}
              />
            )}

            {page === "targeting" && <TargetingPage s={s} patch={patch} />}

            {page === "bidengine" && <BidEnginePage s={s} patch={patch} />}

            {page === "budget" && <BudgetPage s={s} patch={patch} />}

            {page === "generate" && (
              <GeneratePage s={s} validation={validation} preview={preview} onGenerate={handleGenerate} setPage={setPage} successResult={successResult} />
            )}
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Products & Keywords page
// ══════════════════════════════════════════════════════════════

function ProductsPage({
  s,
  fileName,
  dragging,
  setDragging,
  fileInputRef,
  onFile,
  onDownloadTemplate,
}: {
  s: CampaignGenState;
  fileName: string;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
  onDownloadTemplate: () => void;
}) {
  const totalKws = s.keywords.length;
  const withTitle = s.products.filter((p) => p.title).length;
  const missingAG = s.products.filter((p) => !p.agName).length;
  const missingBrand = s.products.filter((p) => !p.brand).length;
  const missingCat = s.products.filter((p) => !p.cat).length;
  const issuesTotal = missingAG + missingBrand + missingCat;

  return (
    <>
      <div className="cg-section">
        <h2>Products &amp; Keywords</h2>
        <p className="sub">Required columns: ASIN, Brand Name, Category, Ad Group Name — optional: Sub Category, Unique ID 2, Portfolio ID, Product Title, Keyword, Notes, Recommended Bid, Source, Campaign Type, Tier.</p>
        <button className="btn btn-secondary" onClick={onDownloadTemplate}>Download CSV template</button>
      </div>

      <div className="cg-section">
        <div
          className={`upload-zone${dragging ? " dragging" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
        >
          <div className="upload-zone-icon">📄</div>
          <div className="upload-zone-text">Drag &amp; drop your file here, or click to browse</div>
          <div className="upload-zone-sub">.csv, .tsv, .txt, .xlsx, .xls</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
          />
        </div>
        {fileName && <div className="hint" style={{ marginTop: 8 }}>Loaded: {fileName}</div>}
      </div>

      {s.products.length > 0 && (
        <>
          <div className="stat-grid">
            <div className="stat-tile"><div className="n">{s.products.length}</div><div className="l">Products Loaded</div></div>
            <div className="stat-tile"><div className="n">{totalKws}</div><div className="l">Keywords Found</div></div>
            <div className="stat-tile"><div className="n">{withTitle}</div><div className="l">With Product Title</div></div>
            <div className="stat-tile"><div className="n" style={{ color: issuesTotal > 0 ? "var(--danger)" : undefined }}>{issuesTotal}</div><div className="l">Issues</div></div>
          </div>

          <div className="cg-section">
            <h2 style={{ fontSize: 14 }}>Products</h2>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {s.products.slice(0, 200).map((p: Product) => {
                const issues = productIssues(p);
                const kwCount = s.keywords.filter((k) => k.asin === p.asin).length;
                return (
                  <div className="product-card" key={p.asin}>
                    <div>
                      <strong style={{ fontSize: 13 }}>{p.asin}</strong>{" "}
                      <span className="meta">{p.brand || "—"} · {p.cat || "—"}{p.subcat ? ` / ${p.subcat}` : ""} · {p.agName || "no ad group"}</span>
                    </div>
                    <span className={`badge ${issues.length ? "badge-danger" : kwCount ? "badge-success" : "badge-warning"}`}>
                      {issues.length ? issues[0] : kwCount ? `${kwCount} kws` : "No keywords"}
                    </span>
                  </div>
                );
              })}
              {s.products.length > 200 && <div className="hint">…and {s.products.length - 200} more</div>}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// Targeting page
// ══════════════════════════════════════════════════════════════

function TacticToggle({
  s,
  patch,
  tac,
  label,
  desc,
}: {
  s: CampaignGenState;
  patch: (p: Partial<CampaignGenState>) => void;
  tac: Tactic;
  label: string;
  desc: string;
}) {
  const key = ("tac_" + tac) as keyof CampaignGenState;
  const val = s[key] as boolean | null;
  return (
    <div className="tactic-card">
      <div className="tactic-head">
        <div>
          <strong>{label}</strong>
          <div className="hint">{desc}</div>
        </div>
        <div className="toggle2">
          <button className={`on-yes${val === true ? " active" : ""}`} onClick={() => patch({ [key]: true } as Partial<CampaignGenState>)}>YES</button>
          <button className={`on-no${val === false ? " active" : ""}`} onClick={() => patch({ [key]: false } as Partial<CampaignGenState>)}>NO</button>
        </div>
      </div>
      {tac === "branded" && val === true && (
        <div className="tactic-body">
          <label style={{ fontSize: 12, fontWeight: 700 }}>Brand Keyword(s) — comma-separated</label>
          <input className="cg-input" value={s.brandKw} onChange={(e) => patch({ brandKw: e.target.value })} placeholder="acme, acme corp" />
        </div>
      )}
      {tac === "prodbr" && val === true && (
        <div className="tactic-body">
          <label style={{ fontSize: 12, fontWeight: 700 }}>Own Product ASINs — pipe-separated</label>
          <input className="cg-input" value={s.prodAsinsBr} onChange={(e) => patch({ prodAsinsBr: e.target.value })} placeholder="B0CDCJRQKK|B0CDCJRQKL" />
          <div className="hint">10-character ASINs starting with B.</div>
        </div>
      )}
      {tac === "prodcomp" && val === true && (
        <div className="tactic-body">
          <label style={{ fontSize: 12, fontWeight: 700 }}>Competitor ASINs — pipe-separated</label>
          <input className="cg-input" value={s.prodAsinsComp} onChange={(e) => patch({ prodAsinsComp: e.target.value })} placeholder="B0XXXXXXXX|B0YYYYYYYY" />
          <div className="hint">10-character ASINs starting with B.</div>
        </div>
      )}
    </div>
  );
}

function TargetingPage({ s, patch }: { s: CampaignGenState; patch: (p: Partial<CampaignGenState>) => void }) {
  return (
    <div className="cg-section">
      <h2>Targeting</h2>
      <p className="sub">Enable at least one tactic.</p>
      <TacticToggle s={s} patch={patch} tac="generic" label="Generic Targeting" desc="Keywords from your uploaded product list (campaign type Generic or blank)." />
      <TacticToggle s={s} patch={patch} tac="branded" label="Branded Targeting" desc="One campaign per product; keyword text comes from Brand Keyword(s), not the uploaded list." />
      <TacticToggle s={s} patch={patch} tac="prodbr" label="Product Targeting — Branded" desc="Targets your own ASINs directly." />
      <TacticToggle s={s} patch={patch} tac="prodcomp" label="Product Targeting — Competitor" desc="Targets competitor ASINs directly." />
      <TacticToggle s={s} patch={patch} tac="auto" label="Auto Targeting" desc="Creates 4 expressions: close-match, loose-match, substitutes, complements." />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Bid Engine page
// ══════════════════════════════════════════════════════════════

function MultSlider({ s, patch, label, k }: { s: CampaignGenState; patch: (p: Partial<CampaignGenState>) => void; label: string; k: keyof CampaignGenState }) {
  return (
    <div className="cg-slider-row">
      <label>{label}</label>
      <input type="range" min={0.5} max={2.5} step={0.05} value={s[k] as number} onChange={(e) => patch({ [k]: parseFloat(e.target.value) } as Partial<CampaignGenState>)} />
      <span className="cg-slider-val">×{(s[k] as number).toFixed(2)}</span>
    </div>
  );
}

function BidEnginePage({ s, patch }: { s: CampaignGenState; patch: (p: Partial<CampaignGenState>) => void }) {
  const mults = bidMultipliers(s);
  const floor = typeof s.be_floor === "number" ? s.be_floor : parseFloat(String(s.be_floor)) || 0;
  const ceil = typeof s.be_ceil === "number" ? s.be_ceil : parseFloat(String(s.be_ceil)) || 0;
  const base = typeof s.bid === "number" ? s.bid : parseFloat(String(s.bid)) || 1;
  const enabled = !!s.bidEngineEnabled;

  const sample: [string, "branded" | "generic" | "discovery", "high" | "medium" | "low", MatchType][] = [
    ["TIER1 generic, exact", "generic", "high", "exact"],
    ["TIER2 branded, phrase", "branded", "medium", "phrase"],
    ["TIER3 discovery, broad", "discovery", "low", "broad"],
  ];

  return (
    <>
      <div className="cg-section">
        <h2>Bid Engine</h2>
        <p className="sub">Every keyword resolves as base × type × relevancy × match, then clamps to the floor and ceiling.</p>
        <div className="toggle2">
          <button className={`on-yes${enabled ? " active" : ""}`} onClick={() => patch({ bidEngineEnabled: true })}>Enabled</button>
          <button className={`on-no${s.bidEngineEnabled === false ? " active" : ""}`} onClick={() => patch({ bidEngineEnabled: false })}>Disabled</button>
        </div>
      </div>

      {enabled && (
        <>
          <div className="cg-field">
            <label>Minimum Keyword Word Count</label>
            <input className="cg-input" type="number" min={1} max={6} value={s.be_minwords} onChange={(e) => patch({ be_minwords: e.target.value === "" ? "" : parseInt(e.target.value, 10) })} style={{ maxWidth: 120 }} />
          </div>

          <div className="cg-section">
            <h2 style={{ fontSize: 14 }}>Keyword Type</h2>
            <MultSlider s={s} patch={patch} label="Branded multiplier" k="be_branded" />
            <MultSlider s={s} patch={patch} label="Generic multiplier" k="be_generic" />
            <MultSlider s={s} patch={patch} label="Discovery multiplier" k="be_discovery" />
          </div>
          <div className="cg-section">
            <h2 style={{ fontSize: 14 }}>Relevancy Tier</h2>
            <MultSlider s={s} patch={patch} label="High relevancy (TIER1)" k="be_high" />
            <MultSlider s={s} patch={patch} label="Medium relevancy (TIER2)" k="be_medium" />
            <MultSlider s={s} patch={patch} label="Low relevancy (TIER3)" k="be_low" />
          </div>
          <div className="cg-section">
            <h2 style={{ fontSize: 14 }}>Match Type</h2>
            <MultSlider s={s} patch={patch} label="Exact multiplier" k="be_exact" />
            <MultSlider s={s} patch={patch} label="Phrase multiplier" k="be_phrase" />
            <MultSlider s={s} patch={patch} label="Broad multiplier" k="be_broad" />
          </div>
          <div className="cg-row cg-section">
            <div className="cg-field">
              <label>Bid Floor ($)</label>
              <input className="cg-input" type="number" min={0.02} step={0.01} value={s.be_floor} onChange={(e) => patch({ be_floor: e.target.value === "" ? "" : parseFloat(e.target.value) })} />
            </div>
            <div className="cg-field">
              <label>Bid Ceiling ($)</label>
              <input className="cg-input" type="number" min={0.02} step={0.01} value={s.be_ceil} onChange={(e) => patch({ be_ceil: e.target.value === "" ? "" : parseFloat(e.target.value) })} />
            </div>
          </div>

          <div className="cg-section card" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 14 }}>Worked Example</h2>
            {sample.map(([label, type, rel, mt]) => {
              const result = calcBid(base, type, mt, rel, true, mults, floor, ceil);
              return (
                <div key={label} style={{ fontSize: 12, fontFamily: "monospace", padding: "4px 0", color: "var(--ink-soft)" }}>
                  {label}: ${base.toFixed(2)} × {type} × {rel} × {mt} = <strong style={{ color: "var(--ink)" }}>${result.toFixed(2)}</strong>
                  {floor > 0 && result === floor ? " → floor" : ""}
                  {ceil > 0 && result === ceil ? " → ceiling" : ""}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// Budget Split page
// ══════════════════════════════════════════════════════════════

function PctSlider({ s, patch, label, k }: { s: CampaignGenState; patch: (p: Partial<CampaignGenState>) => void; label: string; k: keyof CampaignGenState }) {
  return (
    <div className="cg-slider-row">
      <label>{label}</label>
      <input type="range" min={0} max={100} step={5} value={s[k] as number} onChange={(e) => patch({ [k]: parseInt(e.target.value, 10) } as Partial<CampaignGenState>)} />
      <span className="cg-slider-val">{s[k] as number}%</span>
    </div>
  );
}

function BudgetPage({ s, patch }: { s: CampaignGenState; patch: (p: Partial<CampaignGenState>) => void }) {
  const useSplit = !!s.budgetSplit;

  return (
    <>
      <div className="cg-section">
        <h2>Budget Split</h2>
        <p className="sub">Flat: every campaign gets exactly the Default Budget. Split: allocate a total session budget by tactic — inactive tactics are renormalized automatically.</p>
        <div className="toggle2">
          <button className={`on-yes${useSplit ? " active" : ""}`} onClick={() => patch({ budgetSplit: true })}>Split</button>
          <button className={`on-no${s.budgetSplit === false ? " active" : ""}`} onClick={() => patch({ budgetSplit: false })}>Flat</button>
        </div>
      </div>

      {useSplit && (
        <>
          <div className="cg-field">
            <label>Total Daily Budget ($)</label>
            <input className="cg-input" type="number" min={1} step={1} value={s.bs_total} onChange={(e) => patch({ bs_total: e.target.value === "" ? "" : parseFloat(e.target.value) })} style={{ maxWidth: 200 }} />
          </div>
          <div className="cg-section">
            <h2 style={{ fontSize: 14 }}>Tactic Allocation</h2>
            <PctSlider s={s} patch={patch} label="Generic %" k="bs_generic" />
            <PctSlider s={s} patch={patch} label="Branded %" k="bs_branded" />
            <PctSlider s={s} patch={patch} label="Auto %" k="bs_auto" />
            <PctSlider s={s} patch={patch} label="Product Branded %" k="bs_prodbr" />
            <PctSlider s={s} patch={patch} label="Product Competitor %" k="bs_prodcomp" />
          </div>
          <div className="cg-section">
            <h2 style={{ fontSize: 14 }}>Match Type Weights (Generic only, if &gt;1 match type)</h2>
            <p className="sub">Leave all three at 0 to divide the pool evenly.</p>
            <PctSlider s={s} patch={patch} label="Exact Weight %" k="bs_exact" />
            <PctSlider s={s} patch={patch} label="Phrase Weight %" k="bs_phrase" />
            <PctSlider s={s} patch={patch} label="Broad Weight %" k="bs_broad" />
          </div>
        </>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// Review & Generate page
// ══════════════════════════════════════════════════════════════

function GeneratePage({
  s,
  validation,
  preview,
  onGenerate,
  setPage,
  successResult,
}: {
  s: CampaignGenState;
  validation: ReturnType<typeof runValidation>;
  preview: ReturnType<typeof buildPreview> | null;
  onGenerate: () => void;
  setPage: (p: PageId) => void;
  successResult: { campaigns: number; adGroups: number; kwTargets: number; rows: number; fileName: string } | null;
}) {
  void s;
  return (
    <>
      <div className="cg-section">
        <h2>Validation</h2>
        {validation.errors.map((e, i) => (
          <div className="val-item error" key={"e" + i}>
            <span>❌</span>
            <div>
              <div style={{ fontWeight: 700 }}>{e.msg}</div>
              <div className="hint">{e.fix}</div>
            </div>
            <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "4px 10px" }} onClick={() => setPage(e.page as PageId)}>Fix →</button>
          </div>
        ))}
        {validation.warnings.map((w, i) => (
          <div className="val-item warn" key={"w" + i}>
            <span>⚠️</span>
            <div>
              <div style={{ fontWeight: 700 }}>{w.msg}</div>
              <div className="hint">{w.fix}</div>
            </div>
            <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "4px 10px" }} onClick={() => setPage(w.page as PageId)}>Fix →</button>
          </div>
        ))}
        {validation.errors.length === 0 && validation.warnings.length === 0 && (
          <div className="val-item ok"><span>✅</span> All checks passed — ready to generate.</div>
        )}
        {validation.errors.length === 0 && validation.ok.map((o, i) => (
          <div key={"ok" + i} className="hint" style={{ marginBottom: 3 }}>✓ {o}</div>
        ))}
      </div>

      {preview && (
        <div className="cg-section">
          <h2>Campaign Preview</h2>
          <div className="stat-grid">
            <div className="stat-tile"><div className="n">{preview.totalCampaigns}</div><div className="l">Total Campaigns</div></div>
            <div className="stat-tile"><div className="n">{preview.keywordCount}</div><div className="l">Keywords</div></div>
            <div className="stat-tile"><div className="n">{preview.estRows}</div><div className="l">Est. Bulk Rows</div></div>
            <div className="stat-tile"><div className="n">${preview.estBudget.toFixed(0)}</div><div className="l">Est. Daily Budget</div></div>
          </div>
          <table className="tk-table">
            <thead><tr><th>Tactic</th><th>Campaigns</th><th>Budget/Campaign</th><th>Match Types</th></tr></thead>
            <tbody>
              {preview.breakdown.map((r) => (
                <tr key={r.tactic}><td>{r.tactic}</td><td>{r.campaigns}</td><td>${r.budgetPerCampaign.toFixed(0)}</td><td>{r.matchTypes}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cg-section">
        <button className="btn btn-primary" disabled={validation.errors.length > 0} onClick={onGenerate} style={{ width: "100%", padding: "14px" }}>
          {validation.errors.length > 0 ? `${validation.errors.length} item(s) must be fixed first` : "Download Amazon Bulk File"}
        </button>
      </div>

      {successResult && (
        <div className="cg-section card" style={{ padding: 20, borderColor: "var(--success-border)", background: "var(--success-bg)" }}>
          <h2 style={{ fontSize: 15 }}>✅ File Generated Successfully</h2>
          <div className="stat-grid">
            <div className="stat-tile"><div className="n" style={{ color: "var(--success)" }}>{successResult.campaigns}</div><div className="l">Campaigns Created</div></div>
            <div className="stat-tile"><div className="n">{successResult.adGroups}</div><div className="l">Ad Groups</div></div>
            <div className="stat-tile"><div className="n">{successResult.kwTargets}</div><div className="l">Keywords + Targets</div></div>
            <div className="stat-tile"><div className="n">{successResult.rows}</div><div className="l">Bulk Rows Written</div></div>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 8 }}>
            <strong>{successResult.fileName}</strong> — upload it in <strong>Amazon Ads Console → Bulk Operations → Upload File</strong>. The Run Summary tab records every setting used.
          </p>
        </div>
      )}
    </>
  );
}
