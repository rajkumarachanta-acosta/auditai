"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { runAuditEngine, AuditResult, RawData } from "@/lib/auditEngine";
import { buildLocalResponse, buildComparisonTable, ChatMessage } from "@/lib/chatEngine";
import { computeAnswer, ComputedAnswer } from "@/lib/computeEngine";
import { brand } from "@/lib/brand";

// ── Helpers ──
function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function uid() { return Math.random().toString(36).slice(2); }

const SUGGESTIONS = [
  { label: "📊 Account overview", q: "Give me an overall account summary" },
  { label: "💸 Biggest waste?", q: "What is our biggest budget waste right now?" },
  { label: "⏸ Keywords to pause?", q: "Which keywords should I pause immediately?" },
  { label: "🚀 Growth opportunities", q: "Show me top growth opportunities" },
  { label: "📦 ASIN performance", q: "Show me the ASIN cohort analysis" },
  { label: "📣 Campaign issues?", q: "Show me campaign health overview" },
  { label: "📊 Why this score?", q: "Why is our health score low?" },
  { label: "📋 Campaign table", q: "Show me all campaigns in a table" },
  { label: "📋 ASIN table", q: "Show me all ASINs in a table" },
  { label: "⇄ Compare periods", q: "Compare this period to last period" },
  { label: "📑 Create PowerPoint", q: "Create a PowerPoint presentation of the full audit" },
];

// ── Excel parser — skips metadata rows, finds real header row ──
function parseSheet(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  // Find the real header row (first row where first cell looks like a column name not a metadata key)
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);

  let headerRow = 0;
  for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (!cell) continue;
    const val = String(cell.v ?? "").trim();
    // Real header rows start with known column names (ASIN, Entity, Customer Search Term, Campaign Name, etc.)
    // Metadata rows look like "Program=[Retail]" or "Distributor View=[Manufacturing]"
    if (
      val === "ASIN" ||
      val === "Entity" ||
      val === "Customer Search Term" ||
      val === "Campaign Name" ||
      val === "Search Term" ||
      val === "Portfolio Name"
    ) {
      headerRow = r;
      break;
    }
  }

  // Use sheet_to_json with the detected header row offset
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    range: headerRow,
    defval: "",
    raw: false,   // parse numbers as strings first, we handle coercion in engine
  });

  return rows;
}

// ── Determine file type by name + column headers ──
type FileType = keyof RawData | "bulk";

function detectFileType(name: string, headers: string[]): FileType | null {
  const lower = name.toLowerCase();
  const h = headers.map(x => x.toLowerCase());

  // Bulk campaign file — has "Entity" column (the key signal)
  if (h.includes("entity")) return "bulk";
  // Vendor Central Sales
  if (lower.includes("sales") || h.includes("ordered revenue")) return "sales";
  // Vendor Central Traffic
  if (lower.includes("traffic") || h.includes("featured offer page views")) return "traffic";
  // Search term report (standalone, not inside bulk)
  if (lower.includes("search") || h.includes("customer search term")) return "searchTerm";

  return null;
}

function scoreColor(score: number) {
  if (score >= 80) return "#22c55e";
  if (score >= 65) return "#f59e0b";
  return "#ef4444";
}

interface UploadedFile {
  name: string;
  type: FileType;
  rows: number;
  sheets?: string[];
}

export default function Home() {
  const [screen, setScreen]         = useState<"upload" | "chat">("upload");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [rawData, setRawData]       = useState<Partial<RawData>>({});
  const [audit, setAudit]           = useState<AuditResult | null>(null);
  const [compareAudit, setCompareAudit] = useState<AuditResult | null>(null);
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [input, setInput]           = useState("");
  const [isTyping, setIsTyping]     = useState(false);
  const [brandName, setBrandName]   = useState("");
  const [activeTopic, setActiveTopic] = useState("all");
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState("");
  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const fileInputRef     = useRef<HTMLInputElement>(null);
  const compareInputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── File handling ──
  const handleFiles = useCallback(async (fileList: FileList) => {
    setParseError("");
    const newRaw: Partial<RawData> = { ...rawData };
    const newFiles: UploadedFile[] = [...uploadedFiles];

    for (const file of Array.from(fileList)) {
      try {
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: "array" });

        // Check if it's a bulk file (has "Sponsored Products Campaigns" sheet)
        const spCampSheet = wb.SheetNames.find(n =>
          n.toLowerCase().includes("sponsored products campaigns") ||
          n.toLowerCase().includes("sp campaigns")
        );
        const spSTSheet = wb.SheetNames.find(n =>
          n.toLowerCase().includes("sp search term") ||
          n.toLowerCase().includes("search term report")
        );

        if (spCampSheet) {
          // Bulk campaign file
          const campRows = parseSheet(wb.Sheets[spCampSheet]);
          newRaw.campaign = campRows as RawData["campaign"];

          if (spSTSheet) {
            const stRows = parseSheet(wb.Sheets[spSTSheet]);
            newRaw.searchTerm = stRows as RawData["searchTerm"];
          }

          const existing = newFiles.findIndex(f => f.type === "bulk");
          const entry: UploadedFile = {
            name: file.name,
            type: "bulk",
            rows: campRows.length,
            sheets: wb.SheetNames,
          };
          if (existing >= 0) newFiles[existing] = entry;
          else newFiles.push(entry);
        } else {
          // Single-sheet file — detect type
          const ws      = wb.Sheets[wb.SheetNames[0]];
          const rows    = parseSheet(ws);
          const headers = rows[0] ? Object.keys(rows[0]) : [];
          const type    = detectFileType(file.name, headers);

          if (!type) {
            setParseError(`Could not identify "${file.name}". Expected Sales, Traffic, or Bulk Campaign file.`);
            continue;
          }

          if (type === "sales")      newRaw.sales      = rows as RawData["sales"];
          if (type === "traffic")    newRaw.traffic     = rows as RawData["traffic"];
          if (type === "searchTerm") newRaw.searchTerm  = rows as RawData["searchTerm"];

          const existing = newFiles.findIndex(f => f.type === type);
          const entry: UploadedFile = { name: file.name, type, rows: rows.length };
          if (existing >= 0) newFiles[existing] = entry;
          else newFiles.push(entry);
        }
      } catch (e) {
        setParseError(`Error reading "${file.name}". Make sure it is a valid .xlsx file.`);
      }
    }

    setRawData(newRaw);
    setUploadedFiles(newFiles);
  }, [rawData, uploadedFiles]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const canAnalyze = uploadedFiles.some(f => f.type === "bulk") || uploadedFiles.some(f => f.type === "sales");

  // ── Start Analysis ──
  const startAnalysis = () => {
    if (!canAnalyze) return;
    const data: RawData = {
      sales:      (rawData.sales      ?? []) as Record<string, unknown>[],
      traffic:    (rawData.traffic     ?? []) as Record<string, unknown>[],
      campaign:   (rawData.campaign    ?? []) as Record<string, unknown>[],
      searchTerm: (rawData.searchTerm  ?? []) as Record<string, unknown>[],
    };
    const result = runAuditEngine(data);
    result.periodLabel = "Current Period";
    setAudit(result);
    setCompareAudit(null);
    setScreen("chat");

    const totalRows = uploadedFiles.reduce((s, f) => s + f.rows, 0);
    const brand = brandName.trim() || result.summary.topBrand || "Your Account";
    if (!brandName.trim()) setBrandName(brand);

    addBotMessage(
      `I've analyzed <strong>${totalRows.toLocaleString()} rows</strong> across ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? "s" : ""} for <strong>${brand}</strong>. Here's the snapshot:` +
      `<div class="chip-row">` +
      `<div class="chip-stat ${result.score < 65 ? "red" : result.score < 80 ? "yellow" : "green"}"><span>${result.score}</span>Health Score</div>` +
      (result.hasCampaignData ? `<div class="chip-stat red"><span>${fmt$(result.totalWaste)}</span>Total Waste</div>` : "") +
      (result.hasCampaignData ? `<div class="chip-stat green"><span>${fmt$(result.totalOpportunity)}</span>Opp/Month</div>` : "") +
      (result.hasSalesData ? `<div class="chip-stat blue"><span>${fmt$(result.summary.totalOrderedRevenue)}</span>Total Revenue</div>` : "") +
      `<div class="chip-stat ${result.criticalCount > 0 ? "red" : "green"}"><span>${result.criticalCount}</span>Critical Issues</div>` +
      `</div>` +
      (result.topWaste[0] ? `<strong>Top risk:</strong> ${result.topWaste[0].title}<br>` : "") +
      (result.topOpportunities[0] ? `<strong>Top opportunity:</strong> ${result.topOpportunities[0].title}<br>` : "") +
      (!result.hasCampaignData ? `<br>💡 <em>Upload the <strong>Bulk Campaign File</strong> to unlock keyword, ACOS, and spend analysis.</em>` : "") +
      `<br>What would you like to explore first?`
    );
  };

  // ── Compare Period file handler ──
  const handleComparePeriod = useCallback(async (fileList: FileList) => {
    if (!fileList.length || !audit) return;
    const file = fileList[0];
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "array" });

      const spCampSheet = wb.SheetNames.find(n =>
        n.toLowerCase().includes("sponsored products campaigns") ||
        n.toLowerCase().includes("sp campaigns")
      );
      const stSheet = wb.SheetNames.find(n =>
        n.toLowerCase().includes("sp search term") ||
        n.toLowerCase().includes("search term report")
      );

      let campRows: Record<string, unknown>[] = [];
      let stRows:   Record<string, unknown>[] = [];
      if (spCampSheet) campRows = parseSheet(wb.Sheets[spCampSheet]);
      if (stSheet)     stRows   = parseSheet(wb.Sheets[stSheet]);

      const compareData: RawData = {
        sales:      (rawData.sales      ?? []) as Record<string, unknown>[],
        traffic:    (rawData.traffic     ?? []) as Record<string, unknown>[],
        campaign:   campRows.length ? campRows : (rawData.campaign ?? []) as Record<string, unknown>[],
        searchTerm: stRows.length   ? stRows   : (rawData.searchTerm ?? []) as Record<string, unknown>[],
      };

      const compareResult = runAuditEngine(compareData);
      compareResult.periodLabel = `Compare: ${file.name.slice(0, 20)}`;
      setCompareAudit(compareResult);

      addBotMessage(
        `Period comparison loaded — <strong>${file.name}</strong>. Here's the side-by-side breakdown:<br>` +
        buildComparisonTable(audit, compareResult)
      );
    } catch {
      addBotMessage(`<div class="fc"><div class="fc-detail">Could not parse comparison file. Please upload a valid bulk campaign Excel file.</div></div>`);
    }
  }, [audit, rawData]);

  // ── Messaging ──
  function addBotMessage(content: string) {
    setMessages(prev => [...prev, { id: uid(), role: "assistant", content, timestamp: new Date() }]);
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isTyping || !audit) return;
    setMessages(prev => [...prev, { id: uid(), role: "user", content: text, timestamp: new Date() }]);
    setInput("");
    setIsTyping(true);

    // ── Step 1: Compute locally for PowerPoint/compare detection ──
    const localComputed = computeAnswer(audit, text);

    // PowerPoint
    if (localComputed.intent === "powerpoint") {
      setIsTyping(false);
      addBotMessage(
        `Preparing your presentation — <strong>8 slides</strong> from your data:<br><br>` +
        `1. Title &amp; Account Overview<br>2. Executive Summary<br>3. Account Scorecard<br>` +
        `4. Budget Waste Analysis<br>5. Keyword Audit<br>6. Search Term Opportunities<br>` +
        `7. ASIN Cohort Analysis<br>8. 30-Day Action Plan<br><br>` +
        `<button class="dl-btn" onclick="window._downloadPptx && window._downloadPptx()">⬇ Download PowerPoint</button>`
      );
      return;
    }

    // Period comparison
    if (/compar|vs\b|versus|week.?over.?week|last.?week/i.test(text) && compareAudit) {
      await new Promise(r => setTimeout(r, 400));
      setIsTyping(false);
      addBotMessage(
        `Period comparison — <strong>${audit.periodLabel}</strong> vs <strong>${compareAudit.periodLabel}</strong>:<br>` +
        buildComparisonTable(audit, compareAudit)
      );
      return;
    }

    // ── Step 2: Call GPT — it answers everything conversationally ──
    try {
      // Keep payload small — server rebuilds context from this
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, computed: localComputed, audit: {
          score: audit.score, scoreLabel: audit.scoreLabel,
          spendEfficiency: audit.spendEfficiency, structureQuality: audit.structureQuality,
          totalWaste: audit.totalWaste, totalOpportunity: audit.totalOpportunity,
          hasCampaignData: audit.hasCampaignData, hasSalesData: audit.hasSalesData,
          periodLabel: audit.periodLabel, summary: audit.summary,
          findings: audit.findings.slice(0, 50),
          asinCohorts: audit.asinCohorts.slice(0, 30),
          topWaste: audit.topWaste, topOpportunities: audit.topOpportunities,
          campaignTable: audit.campaignTable.slice(0, 40),
          asinTable: audit.asinTable.slice(0, 40),
          keywordTable: (audit.keywordTable ?? []).slice(0, 60),
          searchTermTable: (audit.searchTermTable ?? []).slice(0, 60),
          criticalCount: audit.criticalCount,
        } }),
      });
      const data = await res.json();
      if (data.answer) {
        setIsTyping(false);
        // Prose from GPT on top; table from compute engine below (never from GPT)
        const computedForTable = data.computed ?? localComputed;
        const tableHtml = computedForTable?.data?.rows?.length
          ? renderComputedTable(computedForTable)
          : "";
        // Convert GPT markdown bold/italic to HTML, then newlines
        const prose = data.answer
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/\n/g, "<br>");
        addBotMessage(prose + (tableHtml ? `<br>${tableHtml}` : ""));
        return;
      }
      // Show error in chat so we can debug
      if (data.error && data.error !== "NO_API_KEY") {
        setIsTyping(false);
        addBotMessage(`⚠️ GPT error: ${data.error}`);
        return;
      }
    } catch (err) {
      console.error("GPT call failed:", err);
    }

    // ── Step 3: Local computed fallback (no API key) ──
    await new Promise(r => setTimeout(r, 400));
    setIsTyping(false);
    const fallback = computeAnswer(audit, text);
    addBotMessage(renderLocalComputed(fallback));
  }

  // ── Local fallback renderer ──
  function renderLocalComputed(computed: ComputedAnswer): string {
    const parts: string[] = [];
    parts.push(`<strong>${computed.headline}</strong>`);
    if (computed.facts.length) parts.push(computed.facts.map(f => `• ${f}`).join("<br>"));
    if (computed.nextSteps.length) {
      parts.push(`<div style="margin-top:10px;padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
        <div style="font-weight:700;color:#166534;margin-bottom:4px">📋 Next Steps</div>
        ${computed.nextSteps.map((s, i) => `<div style="margin-top:4px;font-size:12px"><strong>${i+1}.</strong> ${s}</div>`).join("")}
      </div>`);
    }
    if (computed.data?.rows.length) parts.push(renderComputedTable(computed));
    return parts.join("<br>");
  }

  // ── Render computed table as HTML + CSV download button ──
  function renderComputedTable(computed: ComputedAnswer): string {
    const question = computed.intent;
    if (!computed.data) return "";
    const { columns, rows } = computed.data;

    const TH = (l: string) => `<th style="padding:5px 8px;border-bottom:2px solid #e5e7eb;white-space:nowrap;color:#57606a;font-weight:600;text-align:left">${l}</th>`;
    const TD = (v: string | number) => {
      const s = String(v);
      const isHighPct = s.includes("%") && parseFloat(s) > 50;
      const color = isHighPct ? "color:#ef4444" : "";
      return `<td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;${color}">${s}</td>`;
    };

    const csvContent = [columns.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const csvB64     = btoa(unescape(encodeURIComponent(csvContent)));
    const filename   = `${question.slice(0, 30).replace(/[^a-z0-9]/gi, "_")}.csv`;

    return `<div style="overflow-x:auto;margin-top:10px">
<table style="width:100%;border-collapse:collapse;font-size:12px">
<thead><tr>${columns.map(TH).join("")}</tr></thead>
<tbody>${rows.map(r => `<tr>${r.map(TD).join("")}</tr>`).join("")}</tbody>
</table></div>
<div style="margin-top:8px">
  <a href="data:text/csv;base64,${csvB64}" download="${filename}"
     style="display:inline-block;padding:6px 14px;background:#3b82d4;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none">
    ⬇ Download CSV
  </a>
</div>`;
  }

  // ── PowerPoint download ──
  useEffect(() => {
    (window as Window & { _downloadPptx?: () => void })._downloadPptx = async () => {
      if (!audit) return;
      try {
        const res = await fetch("/api/pptx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audit, brandName: brandName || "Account" }),
        });
        if (!res.ok) throw new Error("Failed");
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url;
        a.download = `${(brandName || "Account").replace(/\s+/g, "_")}_Audit.pptx`;
        a.click();
        URL.revokeObjectURL(url);
      } catch { alert("Could not generate PowerPoint. Please try again."); }
    };
  }, [audit, brandName]);

  const resetApp = () => {
    setScreen("upload"); setMessages([]); setAudit(null); setCompareAudit(null);
    setUploadedFiles([]); setRawData({}); setBrandName("");
  };

  // ── File type display ──
  const fileIcon = (type: FileType) =>
    ({ bulk: "🗂️", sales: "📊", traffic: "📈", searchTerm: "🔍", campaign: "🗂️" }[type] ?? "📄");
  const fileTypeLabel = (type: FileType) =>
    ({ bulk: "Bulk Campaign", sales: "Sales", traffic: "Traffic", searchTerm: "Search Terms", campaign: "Campaign" }[type] ?? type);

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,"Segoe UI",system-ui,sans-serif;background:#f0f2f5;color:#1f2328}
        .app{display:flex;flex-direction:column;height:100vh;overflow:hidden}

        /* NAV */
        .topnav{background:${brand.navBg};color:#fff;padding:0 20px;height:52px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .logo{font-size:16px;font-weight:800;letter-spacing:.02em}
        .logo span{color:${brand.navAccent}}
        .nav-right{display:flex;align-items:center;gap:12px}
        .brand-badge{background:rgba(255,255,255,.1);border-radius:6px;padding:4px 12px;font-size:12px;color:#e2e8f0;font-weight:600}
        .api-btn{background:none;border:1px solid rgba(255,255,255,.15);color:#8b949e;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;transition:all .15s}
        .api-btn:hover,.api-btn.connected{border-color:${brand.accentColor};color:${brand.accentColor}}
        .status-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;margin-right:4px}
        .nav-meta{font-size:12px;color:#8b949e}

        /* LAYOUT */
        .main{display:flex;flex:1;overflow:hidden}

        /* SIDEBAR */
        .sidebar{width:252px;min-width:252px;background:#fff;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;overflow-y:auto}
        .sb-section{padding:14px 14px 10px;border-bottom:1px solid #f0f0f0}
        .sb-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#57606a;margin-bottom:8px}

        /* FILE ITEMS */
        .file-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;background:#f7f8fa;margin-bottom:4px;border:1px solid #e5e7eb}
        .fi-icon{font-size:15px;flex-shrink:0}
        .fi-info{flex:1;min-width:0}
        .fi-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .fi-meta{font-size:10px;color:#57606a}
        .fi-check{color:#22c55e;font-weight:700;font-size:13px;flex-shrink:0}

        /* SCORE CARD */
        .score-card{background:${brand.scoreCardBg};border-radius:10px;padding:14px;color:#fff;text-align:center}
        .sc-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8b949e;margin-bottom:2px}
        .sc-num{font-size:48px;font-weight:900;line-height:1}
        .sc-status{font-size:11px;font-weight:700;margin-top:3px}
        .sc-divider{border:none;border-top:1px solid #3d4a5c;margin:10px 0}
        .sc-row{display:flex;justify-content:space-between;margin-bottom:4px;font-size:11px}
        .sc-row .lbl{color:#8b949e}

        /* QUICK NAV */
        .nav-link{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;font-size:13px;color:#1f2328;cursor:pointer;margin-bottom:2px}
        .nav-link:hover{background:#f7f8fa}
        .nav-link.active{background:${brand.accentColor}18;color:${brand.accentColor};font-weight:600}
        .nl-badge{margin-left:auto;background:#fee2e2;color:#991b1b;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px}
        .nl-badge.green{background:#dcfce7;color:#166534}

        /* UPLOAD SCREEN */
        .upload-screen{flex:1;display:flex;align-items:center;justify-content:center;padding:32px;overflow-y:auto}
        .upload-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:40px;max-width:560px;width:100%;overflow:hidden}
        .upload-card h1{font-size:22px;font-weight:800;margin-bottom:6px}
        .upload-card p{color:#57606a;font-size:13px;margin-bottom:24px;line-height:1.6}
        .brand-row{display:flex;gap:8px;margin-bottom:16px}
        .brand-input{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px;font-size:13px;outline:none;font-family:inherit}
        .brand-input:focus{border-color:${brand.accentColor}}

        /* FILE SLOTS */
        .file-slots{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;width:100%}
        .file-slot{min-width:0;overflow:hidden;border:1px dashed #d1d5db;border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all .15s}
        .file-slot:hover{border-color:#3b82d4;background:#f8faff}
        .file-slot.filled{border-style:solid;border-color:#22c55e;background:#f0fdf4}
        .file-slot.required{border-color:#f59e0b}
        .slot-icon{font-size:20px;margin-bottom:4px}
        .slot-name{font-size:12px;font-weight:700;color:#1f2328}
        .slot-sub{font-size:10px;color:#57606a;margin-top:2px}
        .slot-filled{font-size:10px;color:#22c55e;font-weight:600;margin-top:3px;white-space:normal;overflow:hidden;text-overflow:ellipsis;word-break:break-all;max-width:100%}
        .slot-badge{display:inline-block;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;margin-bottom:3px}
        .slot-badge.req{background:#fef3c7;color:#92400e}
        .slot-badge.opt{background:#f0f9ff;color:#0369a1}

        /* DROP ZONE */
        .drop-zone{border:2px dashed #c7d2fe;border-radius:10px;padding:20px;text-align:center;cursor:pointer;background:#f8f9ff;transition:all .15s;margin-bottom:16px}
        .drop-zone:hover,.drop-zone.dragging{border-color:#3b82d4;background:#eff6ff}
        .drop-icon{font-size:28px;margin-bottom:6px}
        .drop-text{font-size:13px;font-weight:600}
        .drop-sub{font-size:11px;color:#57606a;margin-top:3px}

        /* ANALYZE BTN */
        .analyze-btn{width:100%;background:${brand.accentColor};color:#fff;border:none;border-radius:8px;padding:13px;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s}
        .analyze-btn:disabled{background:${brand.accentColor}99;cursor:not-allowed}
        .analyze-btn:not(:disabled):hover{background:${brand.accentHover}}
        .parse-error{background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;font-size:12px;color:#991b1b;margin-bottom:12px}

        /* CHAT SCREEN */
        .chat-screen{flex:1;display:flex;flex-direction:column;overflow:hidden}
        .chat-header{background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .ch-title{font-weight:700;font-size:15px}
        .ch-sub{font-size:11px;color:#57606a;margin-top:1px}
        .ch-actions{display:flex;gap:8px}
        .ch-btn{border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer}
        .ch-btn:hover{background:#f7f8fa}
        .ch-btn.primary{background:${brand.accentColor};color:#fff;border-color:${brand.accentColor}}
        .ch-btn.primary:hover{background:${brand.accentHover}}
        .ch-btn.compare-btn{background:#f0f9ff;color:#0369a1;border-color:#bae6fd}
        .ch-btn.compare-btn:hover{background:#e0f2fe}

        /* MESSAGES */
        .messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:14px}
        .msg-row{display:flex;gap:10px;align-items:flex-start}
        .msg-row.user{flex-direction:row-reverse;align-self:flex-end;max-width:75%}
        .msg-row.bot{align-self:flex-start;max-width:88%}
        .avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0}
        .avatar.bot{background:${brand.navBg};color:${brand.accentColor}}
        .avatar.user{background:${brand.accentColor};color:#fff}
        .bubble{padding:11px 15px;border-radius:12px;font-size:13px;line-height:1.65}
        .bubble.bot{background:#fff;border:1px solid #e5e7eb;border-top-left-radius:3px}
        .bubble.user{background:${brand.accentColor};color:#fff;border-top-right-radius:3px}
        .typing-dots{display:flex;align-items:center;gap:4px;padding:4px 0}
        .typing-dots span{width:6px;height:6px;background:#adb5bd;border-radius:50%;animation:bounce 1.2s infinite;display:inline-block}
        .typing-dots span:nth-child(2){animation-delay:.2s}
        .typing-dots span:nth-child(3){animation-delay:.4s}
        @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}

        /* FINDING CARDS */
        .fc{background:#fff8f8;border:1px solid #fecaca;border-left:3px solid #ef4444;border-radius:6px;padding:9px 11px;margin:7px 0;font-size:12px}
        .fc.opp{background:#f0fdf4;border-color:#86efac;border-left-color:#22c55e}
        .fc.warn{background:#fffbeb;border-color:#fde68a;border-left-color:#f59e0b}
        .fc-title{font-weight:700;font-size:13px;margin-bottom:2px}
        .fc-detail{color:#57606a;line-height:1.5}
        .fc-action{font-weight:700;color:#991b1b;margin-top:3px;font-size:12px}

        /* CHIPS */
        .chip-row{display:flex;gap:8px;margin:8px 0;flex-wrap:wrap}
        .chip-stat{background:#f7f8fa;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;font-size:11px;text-align:center;min-width:70px;max-width:140px}
        .chip-stat span{font-size:15px;font-weight:800;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .chip-stat.red span{color:#ef4444}
        .chip-stat.green span{color:#22c55e}
        .chip-stat.yellow span{color:#f59e0b}
        .chip-stat.blue span{color:${brand.accentColor}}

        /* DL BTN */
        .dl-btn{background:${brand.accentColor};color:#fff;border:none;border-radius:6px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;margin-top:6px}
        .dl-btn:hover{background:${brand.accentHover}}

        /* SUGGESTIONS */
        .suggestions{padding:8px 18px;display:flex;flex-wrap:wrap;gap:6px;background:#f0f2f5;flex-shrink:0;border-top:1px solid #e5e7eb}
        .suggestion-chip{border:1px solid #d1d5db;background:#fff;border-radius:20px;padding:5px 13px;font-size:12px;color:${brand.accentColor};cursor:pointer;font-weight:500;white-space:nowrap}
        .suggestion-chip:hover{background:${brand.accentColor}14;border-color:${brand.accentColor}}

        /* INPUT */
        .input-bar{padding:11px 18px;background:#fff;border-top:1px solid #e5e7eb;display:flex;gap:10px;align-items:flex-end;flex-shrink:0}
        .chat-input{flex:1;border:1px solid #e5e7eb;border-radius:22px;padding:9px 16px;font-size:13px;font-family:inherit;resize:none;outline:none;background:#f7f8fa;color:#1f2328;line-height:1.5}
        .chat-input:focus{border-color:${brand.accentColor};background:#fff}
        .send-btn{background:${brand.accentColor};color:#fff;border:none;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;flex-shrink:0}
        .send-btn:hover{background:${brand.accentHover}}
        .send-btn:disabled{background:${brand.accentColor}55;cursor:not-allowed}

        /* MODAL */
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:50}
        .modal{background:#fff;border-radius:12px;padding:28px;max-width:420px;width:90%}
        .modal h2{font-size:17px;font-weight:700;margin-bottom:6px}
        .modal p{font-size:13px;color:#57606a;margin-bottom:16px;line-height:1.6}
        .modal-input{width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:9px 12px;font-size:13px;margin-bottom:8px;outline:none;font-family:monospace}
        .modal-input:focus{border-color:${brand.accentColor}}
        .modal-note{font-size:11px;color:#57606a;margin-bottom:14px}
        .modal-actions{display:flex;gap:8px;justify-content:flex-end}
        .modal-btn{border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;font-weight:600}
        .modal-btn.save{background:${brand.accentColor};color:#fff;border-color:${brand.accentColor}}
        .messages::-webkit-scrollbar{width:4px}
        .messages::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px}
      `}</style>

      <div className="app">
        {/* NAV */}
        <div className="topnav">
          <div className="logo">{brand.logoText}<span>{brand.logoAccent}</span></div>
          <div className="nav-right">
            {screen === "chat" && brandName && <div className="brand-badge">{brandName}</div>}
            <span className="nav-meta"><span className="status-dot" />Ready</span>
          </div>
        </div>

        <div className="main">

          {/* ── SIDEBAR (chat only) ── */}
          {screen === "chat" && audit && (
            <div className="sidebar">
              <div className="sb-section">
                <div className="sb-title">Files Loaded</div>
                {uploadedFiles.map(f => (
                  <div key={f.type} className="file-item">
                    <span className="fi-icon">{fileIcon(f.type)}</span>
                    <div className="fi-info">
                      <div className="fi-name">{f.name}</div>
                      <div className="fi-meta">{fileTypeLabel(f.type)} · {f.rows.toLocaleString()} rows</div>
                    </div>
                    <span className="fi-check">✓</span>
                  </div>
                ))}
              </div>

              <div className="sb-section">
                <div className="sb-title">Health Score</div>
                <div className="score-card">
                  <div className="sc-label">Account Health</div>
                  <div className="sc-num" style={{ color: scoreColor(audit.score) }}>{audit.score}</div>
                  <div className="sc-status" style={{ color: scoreColor(audit.score) }}>{audit.scoreLabel}</div>
                  <hr className="sc-divider" />
                  {audit.hasCampaignData && <>
                    <div className="sc-row"><span className="lbl">Spend Efficiency</span><span style={{ color: scoreColor((audit.spendEfficiency/70)*100), fontWeight:700 }}>{audit.spendEfficiency}/70</span></div>
                    <div className="sc-row"><span className="lbl">Structure Quality</span><span style={{ color: scoreColor((audit.structureQuality/30)*100), fontWeight:700 }}>{audit.structureQuality}/30</span></div>
                    <div className="sc-row"><span className="lbl">Total Waste</span><span style={{ color:"#ef4444", fontWeight:700 }}>{fmt$(audit.totalWaste)}</span></div>
                    <div className="sc-row"><span className="lbl">Opportunity</span><span style={{ color:"#22c55e", fontWeight:700 }}>{fmt$(audit.totalOpportunity)}/mo</span></div>
                  </>}
                  {audit.hasSalesData && <>
                    <div className="sc-row"><span className="lbl">Total Revenue</span><span style={{ color:"#3b82d4", fontWeight:700 }}>{fmt$(audit.summary.totalOrderedRevenue)}</span></div>
                    <div className="sc-row"><span className="lbl">Total Units</span><span style={{ fontWeight:700 }}>{audit.summary.totalOrderedUnits.toLocaleString()}</span></div>
                    <div className="sc-row"><span className="lbl">Return Rate</span><span style={{ color: audit.summary.returnRate > 0.12 ? "#ef4444" : "#22c55e", fontWeight:700 }}>{(audit.summary.returnRate*100).toFixed(1)}%</span></div>
                  </>}
                </div>
              </div>

              <div className="sb-section">
                <div className="sb-title">Quick Topics</div>
                {[
                  { key:"all",      icon:"💬", label:"All Topics" },
                  { key:"summary",  icon:"📊", label:"Account Summary" },
                  ...(audit.hasCampaignData ? [
                    { key:"waste",    icon:"🔥", label:"Budget Waste",    badge: audit.findings.filter(f=>f.category==="waste").length,       badgeColor:"" },
                    { key:"opp",      icon:"🚀", label:"Opportunities",   badge: audit.findings.filter(f=>f.category==="opportunity").length,  badgeColor:"green" },
                    { key:"keywords", icon:"🔑", label:"Keywords" },
                    { key:"campaigns",icon:"📣", label:"Campaigns" },
                  ] : []),
                  ...(audit.hasSalesData ? [
                    { key:"asins",    icon:"📦", label:"ASINs" },
                  ] : []),
                  { key:"pptx",     icon:"📑", label:"Export Report" },
                ].map(item => (
                  <div
                    key={item.key}
                    className={`nav-link${activeTopic === item.key ? " active" : ""}`}
                    onClick={() => {
                      const qMap: Record<string,string> = {
                        summary:   "Give me an overall account summary",
                        waste:     "What is our biggest budget waste?",
                        opp:       "Show me top growth opportunities",
                        keywords:  "Which keywords should I pause?",
                        asins:     "Show me the ASIN cohort analysis",
                        campaigns: "Show me campaign health overview",
                        pptx:      "Create a PowerPoint presentation of the full audit",
                      };
                      setActiveTopic(item.key);
                      if (qMap[item.key]) sendMessage(qMap[item.key]);
                    }}
                  >
                    <span>{item.icon}</span> {item.label}
                    {"badge" in item && item.badge ? <span className={`nl-badge ${item.badgeColor}`}>{item.badge}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── UPLOAD SCREEN ── */}
          {screen === "upload" && (
            <div className="upload-screen">
              <div className="upload-card">
                <h1>{brand.uploadHeading}</h1>
                <p>{brand.uploadSubtext}</p>

                <div className="brand-row">
                  <input
                    className="brand-input"
                    placeholder="Brand / Account name (optional)"
                    value={brandName}
                    onChange={e => setBrandName(e.target.value)}
                  />
                </div>

                {/* File slots */}
                <div className="file-slots">
                  {[
                    { type: "bulk",    label: "Bulk Campaign File", sub: "SP Campaigns + Search Terms", icon: "🗂️", required: true },
                    { type: "sales",   label: "Sales by ASIN",      sub: "Vendor Central Sales Report",  icon: "📊", required: false },
                    { type: "traffic", label: "Traffic by ASIN",    sub: "Vendor Central Traffic Report",icon: "📈", required: false },
                  ].map(slot => {
                    const filled = uploadedFiles.find(f => f.type === slot.type);
                    return (
                      <div
                        key={slot.type}
                        className={`file-slot${filled ? " filled" : slot.required ? " required" : ""}`}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="slot-icon">{slot.icon}</div>
                        <span className={`slot-badge ${slot.required ? "req" : "opt"}`}>{slot.required ? "Required" : "Optional"}</span>
                        <div className="slot-name">{slot.label}</div>
                        <div className="slot-sub">{slot.sub}</div>
                        {filled && <div className="slot-filled">✓ {filled.name} ({filled.rows.toLocaleString()} rows)</div>}
                      </div>
                    );
                  })}
                  <div
                    className={`file-slot${uploadedFiles.find(f => f.type === "searchTerm") ? " filled" : ""}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="slot-icon">🔍</div>
                    <span className="slot-badge opt">Optional</span>
                    <div className="slot-name">Search Term Report</div>
                    <div className="slot-sub">Standalone ST report</div>
                    {uploadedFiles.find(f => f.type === "searchTerm") && (
                      <div className="slot-filled">✓ {uploadedFiles.find(f => f.type === "searchTerm")!.name}</div>
                    )}
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  className={`drop-zone${isDragging ? " dragging" : ""}`}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="drop-icon">📂</div>
                  <div className="drop-text">Drop files here or click to browse</div>
                  <div className="drop-sub">Upload one or more files at once — app auto-detects each type</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    multiple
                    style={{ display: "none" }}
                    onChange={e => e.target.files && handleFiles(e.target.files)}
                  />
                </div>

                {parseError && <div className="parse-error">⚠ {parseError}</div>}

                <button
                  className="analyze-btn"
                  disabled={!canAnalyze}
                  onClick={startAnalysis}
                >
                  {canAnalyze
                    ? `Analyze ${uploadedFiles.reduce((s,f)=>s+f.rows,0).toLocaleString()} rows →`
                    : "Upload the Bulk Campaign File or Sales Report to start"}
                </button>
              </div>
            </div>
          )}

          {/* ── CHAT SCREEN ── */}
          {screen === "chat" && audit && (
            <div className="chat-screen">
              <div className="chat-header">
                <div>
                  <div className="ch-title">{brand.appName}</div>
                  <div className="ch-sub">
                    {uploadedFiles.reduce((s,f)=>s+f.rows,0).toLocaleString()} rows · {audit.findings.length} findings · Ask anything
                  </div>
                </div>
                <div className="ch-actions">
                  <button className="ch-btn primary" onClick={() => sendMessage("Create a PowerPoint presentation of the full audit")}>📑 Export PPT</button>
                  <button className="ch-btn compare-btn" onClick={() => compareInputRef.current?.click()}>
                    {compareAudit ? "✓ Period Loaded" : "⇄ Compare Period"}
                  </button>
                  <button className="ch-btn" onClick={resetApp}>Upload New Files</button>
                </div>
                <input
                  ref={compareInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={e => { if (e.target.files) handleComparePeriod(e.target.files); e.target.value = ""; }}
                />
              </div>

              <div className="messages">
                {messages.map(msg => (
                  <div key={msg.id} className={`msg-row ${msg.role === "user" ? "user" : "bot"}`}>
                    <div className={`avatar ${msg.role === "user" ? "user" : "bot"}`}>
                      {msg.role === "user" ? "You" : "AI"}
                    </div>
                    <div
                      className={`bubble ${msg.role === "user" ? "user" : "bot"}`}
                      dangerouslySetInnerHTML={{ __html: msg.content }}
                    />
                  </div>
                ))}
                {isTyping && (
                  <div className="msg-row bot">
                    <div className="avatar bot">AI</div>
                    <div className="bubble bot">
                      <div className="typing-dots"><span /><span /><span /></div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="suggestions">
                {SUGGESTIONS.map(s => (
                  <div key={s.q} className="suggestion-chip" onClick={() => sendMessage(s.q)}>{s.label}</div>
                ))}
              </div>

              <div className="input-bar">
                <textarea
                  className="chat-input"
                  placeholder="Ask anything about your campaigns…"
                  value={input}
                  rows={1}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                />
                <button className="send-btn" disabled={isTyping || !input.trim()} onClick={() => sendMessage(input)}>➤</button>
              </div>
            </div>
          )}

        </div>
      </div>

    </>
  );
}
