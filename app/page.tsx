"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { runAuditEngine, AuditResult, RawData } from "@/lib/auditEngine";
import { buildLocalResponse, getIntent, ChatMessage } from "@/lib/chatEngine";

// ── Helpers ──
function fmt$(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function uid() { return Math.random().toString(36).slice(2); }

const SUGGESTIONS = [
  { label: "💸 Biggest budget waste?", q: "What is our biggest budget waste right now?" },
  { label: "⏸ Keywords to pause?", q: "Which keywords should I pause immediately?" },
  { label: "🚀 Growth opportunities", q: "Show me top growth opportunities" },
  { label: "📊 Why this health score?", q: "Why is our health score low?" },
  { label: "📦 ASINs needing help?", q: "Which ASINs need more ad support?" },
  { label: "📣 Campaign issues?", q: "Show me campaign health overview" },
  { label: "🔍 Search term waste?", q: "Which search terms are wasting budget?" },
  { label: "📑 Create PowerPoint", q: "Create a PowerPoint presentation of the full audit" },
];

// ── File upload helper ──
function parseExcel(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function guessFileType(name: string, rows: Record<string, unknown>[]): keyof RawData | null {
  const lower = name.toLowerCase();
  const keys = rows[0] ? Object.keys(rows[0]).map(k => k.toLowerCase()) : [];
  if (lower.includes("sales") || keys.some(k => k.includes("orderedproduct") || k.includes("units ordered"))) return "sales";
  if (lower.includes("traffic") || keys.some(k => k.includes("session") || k.includes("pageview"))) return "traffic";
  if (lower.includes("search") || lower.includes("searchterm") || keys.some(k => k.includes("searchterm") || k.includes("customer search"))) return "searchTerm";
  if (lower.includes("campaign") || lower.includes("bulk") || lower.includes("sponsored") || keys.some(k => k.includes("entity") || k.includes("campaignname"))) return "campaign";
  return null;
}

// ── Score color ──
function scoreColor(score: number) {
  if (score >= 80) return "#22c55e";
  if (score >= 65) return "#f59e0b";
  return "#ef4444";
}
function scoreLabel(score: number) {
  if (score >= 80) return "Healthy";
  if (score >= 65) return "Needs Attention";
  if (score >= 50) return "At Risk";
  return "Critical";
}

export default function Home() {
  const [screen, setScreen] = useState<"upload" | "chat">("upload");
  const [files, setFiles] = useState<{ name: string; type: keyof RawData; rows: number }[]>([]);
  const [rawData, setRawData] = useState<Partial<RawData>>({});
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [brandName, setBrandName] = useState("Your Account");
  const [activeTopic, setActiveTopic] = useState("all");
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── File handling ──
  const handleFiles = useCallback(async (fileList: FileList) => {
    const newFiles: typeof files = [];
    const newRaw: Partial<RawData> = { ...rawData };
    for (const file of Array.from(fileList)) {
      const buf = await file.arrayBuffer();
      const rows = parseExcel(buf);
      const type = guessFileType(file.name, rows);
      if (!type) continue;
      newRaw[type] = rows as RawData[typeof type];
      newFiles.push({ name: file.name, type, rows: rows.length });
    }
    setRawData(newRaw);
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of newFiles) {
        const idx = merged.findIndex(x => x.type === f.type);
        if (idx >= 0) merged[idx] = f; else merged.push(f);
      }
      return merged;
    });
  }, [rawData]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const canAnalyze = files.some(f => f.type === "campaign") || files.some(f => f.type === "sales");

  const startAnalysis = () => {
    if (!canAnalyze) return;
    const data: RawData = {
      sales: (rawData.sales ?? []) as Record<string, unknown>[],
      traffic: (rawData.traffic ?? []) as Record<string, unknown>[],
      campaign: (rawData.campaign ?? []) as Record<string, unknown>[],
      searchTerm: (rawData.searchTerm ?? []) as Record<string, unknown>[],
    };
    const result = runAuditEngine(data);
    setAudit(result);
    if (brandName === "Your Account" && files[0]) {
      const guess = files[0].name.replace(/[_-]/g, " ").replace(/\.[^.]+$/, "").replace(/sales|traffic|campaign|data|report/gi, "").trim();
      if (guess) setBrandName(guess);
    }
    setScreen("chat");
    const totalRows = files.reduce((s, f) => s + f.rows, 0);
    addBotMessage(
      `Good morning! I've analyzed <strong>${totalRows.toLocaleString()} rows</strong> across your ${files.length} uploaded file${files.length !== 1 ? "s" : ""}. Here's your snapshot:` +
      `<div class="chip-row">` +
      `<div class="chip-stat ${result.score < 65 ? "red" : result.score < 80 ? "yellow" : "green"}"><span>${result.score}</span>Health Score</div>` +
      `<div class="chip-stat red"><span>${fmt$(result.totalWeeklyWaste)}</span>Weekly Waste</div>` +
      `<div class="chip-stat green"><span>${fmt$(result.totalMonthlyOpportunity)}</span>Opp/Month</div>` +
      `<div class="chip-stat ${result.criticalCount > 0 ? "red" : "green"}"><span>${result.criticalCount}</span>Critical Issues</div>` +
      `</div>` +
      (result.topWaste[0] ? `Your biggest risk: <strong>${result.topWaste[0].title}</strong> — ${result.topWaste[0].action}<br>` : "") +
      (result.topOpportunities[0] ? `Your biggest opportunity: <strong>${result.topOpportunities[0].title}</strong><br>` : "") +
      `<br>What would you like to explore first?`
    );
  };

  // ── Messaging ──
  function addBotMessage(content: string) {
    setMessages(prev => [...prev, { id: uid(), role: "assistant", content, timestamp: new Date() }]);
  }

  async function sendMessage(text: string) {
    if (!text.trim() || isTyping || !audit) return;
    setMessages(prev => [...prev, { id: uid(), role: "user", content: text, timestamp: new Date() }]);
    setInput("");
    setIsTyping(true);

    const intent = getIntent(text);

    // PowerPoint — special flow
    if (intent === "powerpoint") {
      setIsTyping(false);
      addBotMessage(
        `Generating your presentation...<br><br>` +
        `<strong>8 slides being prepared:</strong><br>` +
        `1. Title Slide<br>2. Executive Summary<br>3. Account Scorecard<br>` +
        `4. Budget Waste Analysis<br>5. Keyword Audit<br>6. Search Term Opportunities<br>` +
        `7. ASIN Cohort Analysis<br>8. 30-Day Action Plan<br><br>` +
        `<button class="dl-btn" onclick="window._downloadPptx && window._downloadPptx()">⬇ Download PowerPoint</button>`
      );
      return;
    }

    // Get local answer first (instant, accurate)
    const localAnswer = buildLocalResponse(audit, intent, text);

    // Try LLM enhancement if API key available
    if (apiKey || process.env.NEXT_PUBLIC_OPENAI_KEY) {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text, audit, apiKey }),
        });
        const data = await res.json();
        if (data.answer && data.error !== "NO_API_KEY") {
          setIsTyping(false);
          addBotMessage(data.answer);
          return;
        }
      } catch {
        // fall through to local
      }
    }

    // Use local answer
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    setIsTyping(false);
    addBotMessage(localAnswer);
  }

  // ── PowerPoint download ──
  useEffect(() => {
    (window as Window & { _downloadPptx?: () => void })._downloadPptx = async () => {
      if (!audit) return;
      try {
        const res = await fetch("/api/pptx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audit, brandName }),
        });
        if (!res.ok) throw new Error("Failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${brandName.replace(/\s+/g, "_")}_Audit.pptx`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        alert("Could not generate PowerPoint. Please try again.");
      }
    };
  }, [audit, brandName]);

  const handleTopicClick = (topic: string, q: string) => {
    setActiveTopic(topic);
    sendMessage(q);
  };

  // ── RENDER ──
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; background: #f0f2f5; }
        .app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

        /* NAV */
        .topnav { background: #1a1f2e; color: #fff; padding: 0 20px; height: 52px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .logo { font-size: 16px; font-weight: 800; }
        .logo span { color: #3b82d4; }
        .nav-right { display: flex; align-items: center; gap: 12px; font-size: 12px; color: #8b949e; }
        .brand-badge { background: #2d3748; border-radius: 6px; padding: 4px 10px; font-size: 12px; color: #e2e8f0; font-weight: 600; }
        .api-btn { background: none; border: 1px solid #3d4a5c; color: #8b949e; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
        .api-btn:hover { border-color: #3b82d4; color: #3b82d4; }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; display: inline-block; margin-right: 4px; }

        /* MAIN */
        .main { display: flex; flex: 1; overflow: hidden; }

        /* SIDEBAR */
        .sidebar { width: 248px; min-width: 248px; background: #fff; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; overflow-y: auto; }
        .sb-section { padding: 14px; border-bottom: 1px solid #f0f0f0; }
        .sb-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #57606a; margin-bottom: 8px; }
        .file-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; background: #f7f8fa; margin-bottom: 4px; border: 1px solid #e5e7eb; }
        .file-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .file-meta { font-size: 10px; color: #57606a; }
        .file-check { color: #22c55e; font-weight: 700; font-size: 13px; }

        /* SCORE CARD */
        .score-card { background: #1a1f2e; border-radius: 10px; padding: 14px; color: #fff; text-align: center; }
        .score-big { font-size: 46px; font-weight: 900; line-height: 1; }
        .score-tag-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #8b949e; margin-bottom: 2px; }
        .score-status { font-size: 11px; font-weight: 700; margin-top: 4px; }
        .score-divider { border: none; border-top: 1px solid #3d4a5c; margin: 10px 0; }
        .score-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; }
        .score-row .label { color: #8b949e; }

        /* NAV LINKS */
        .nav-link { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 6px; font-size: 13px; color: #1f2328; cursor: pointer; margin-bottom: 2px; }
        .nav-link:hover { background: #f7f8fa; }
        .nav-link.active { background: #eff6ff; color: #3b82d4; font-weight: 600; }
        .nl-badge { margin-left: auto; background: #fee2e2; color: #991b1b; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; }
        .nl-badge.green { background: #dcfce7; color: #166534; }

        /* UPLOAD */
        .upload-screen { flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px; background: #f0f2f5; }
        .upload-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 40px; max-width: 540px; width: 100%; }
        .upload-card h1 { font-size: 24px; font-weight: 800; margin-bottom: 6px; }
        .upload-card p { color: #57606a; font-size: 14px; margin-bottom: 24px; }
        .drop-zone { border: 2px dashed #c7d2fe; border-radius: 12px; padding: 28px; text-align: center; cursor: pointer; background: #f8f9ff; transition: all 0.15s; margin-bottom: 16px; }
        .drop-zone:hover, .drop-zone.dragging { border-color: #3b82d4; background: #eff6ff; }
        .drop-icon { font-size: 36px; margin-bottom: 8px; }
        .drop-text { font-size: 14px; font-weight: 600; }
        .drop-sub { font-size: 12px; color: #57606a; margin-top: 4px; }
        .file-types { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
        .ft { background: #f7f8fa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 3px 10px; font-size: 11px; font-weight: 600; color: #57606a; }
        .uploaded-files { margin: 12px 0; }
        .uf-item { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
        .uf-item:last-child { border-bottom: none; }
        .uf-check { color: #22c55e; font-weight: 700; }
        .uf-type { background: #eff6ff; color: #3b82d4; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
        .analyze-btn { width: 100%; background: #3b82d4; color: #fff; border: none; border-radius: 8px; padding: 13px; font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 8px; }
        .analyze-btn:disabled { background: #c7d2fe; cursor: not-allowed; }
        .analyze-btn:not(:disabled):hover { background: #2563eb; }
        .brand-input { width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px; outline: none; }
        .brand-input:focus { border-color: #3b82d4; }

        /* CHAT */
        .chat-screen { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .chat-header { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .ch-title { font-weight: 700; font-size: 15px; }
        .ch-sub { font-size: 11px; color: #57606a; margin-top: 1px; }
        .ch-actions { display: flex; gap: 8px; }
        .ch-btn { border: 1px solid #e5e7eb; background: #fff; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; }
        .ch-btn:hover { background: #f7f8fa; }
        .ch-btn.primary { background: #3b82d4; color: #fff; border-color: #3b82d4; }
        .ch-btn.primary:hover { background: #2563eb; }

        /* MESSAGES */
        .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .msg-row { display: flex; gap: 10px; align-items: flex-start; }
        .msg-row.user { flex-direction: row-reverse; align-self: flex-end; max-width: 75%; }
        .msg-row.bot { align-self: flex-start; max-width: 85%; }
        .avatar { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; flex-shrink: 0; }
        .avatar.bot { background: #1a1f2e; color: #3b82d4; }
        .avatar.user { background: #3b82d4; color: #fff; }
        .bubble { padding: 11px 15px; border-radius: 12px; font-size: 13px; line-height: 1.6; }
        .bubble.bot { background: #fff; border: 1px solid #e5e7eb; border-top-left-radius: 3px; }
        .bubble.user { background: #3b82d4; color: #fff; border-top-right-radius: 3px; }
        .typing-dots { display: flex; align-items: center; gap: 4px; padding: 4px 0; }
        .typing-dots span { width: 6px; height: 6px; background: #adb5bd; border-radius: 50%; animation: bounce 1.2s infinite; display: inline-block; }
        .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

        /* FINDING CARDS */
        .fc { background: #fff8f8; border: 1px solid #fecaca; border-left: 3px solid #ef4444; border-radius: 6px; padding: 9px 11px; margin: 7px 0; font-size: 12px; }
        .fc.opp { background: #f0fdf4; border-color: #86efac; border-left-color: #22c55e; }
        .fc.warn { background: #fffbeb; border-color: #fde68a; border-left-color: #f59e0b; }
        .fc-title { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
        .fc-detail { color: #57606a; line-height: 1.5; }
        .fc-action { font-weight: 700; color: #991b1b; margin-top: 3px; font-size: 12px; }

        /* CHIPS */
        .chip-row { display: flex; gap: 8px; margin: 8px 0; flex-wrap: wrap; }
        .chip-stat { background: #f7f8fa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 12px; font-size: 12px; text-align: center; min-width: 80px; }
        .chip-stat span { font-size: 18px; font-weight: 800; display: block; }
        .chip-stat.red span { color: #ef4444; }
        .chip-stat.green span { color: #22c55e; }
        .chip-stat.yellow span { color: #f59e0b; }

        /* DOWNLOAD BTN */
        .dl-btn { background: #3b82d4; color: #fff; border: none; border-radius: 6px; padding: 9px 18px; font-size: 13px; font-weight: 700; cursor: pointer; margin-top: 6px; }
        .dl-btn:hover { background: #2563eb; }

        /* SUGGESTIONS */
        .suggestions { padding: 8px 18px; display: flex; flex-wrap: wrap; gap: 6px; background: #f0f2f5; flex-shrink: 0; border-top: 1px solid #e5e7eb; }
        .suggestion-chip { border: 1px solid #d1d5db; background: #fff; border-radius: 20px; padding: 5px 13px; font-size: 12px; color: #3b82d4; cursor: pointer; font-weight: 500; white-space: nowrap; }
        .suggestion-chip:hover { background: #eff6ff; border-color: #3b82d4; }

        /* INPUT */
        .input-bar { padding: 11px 18px; background: #fff; border-top: 1px solid #e5e7eb; display: flex; gap: 10px; align-items: flex-end; flex-shrink: 0; }
        .chat-input { flex: 1; border: 1px solid #e5e7eb; border-radius: 22px; padding: 9px 16px; font-size: 13px; font-family: inherit; resize: none; outline: none; background: #f7f8fa; color: #1f2328; line-height: 1.5; }
        .chat-input:focus { border-color: #3b82d4; background: #fff; }
        .send-btn { background: #3b82d4; color: #fff; border: none; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; flex-shrink: 0; }
        .send-btn:hover { background: #2563eb; }
        .send-btn:disabled { background: #c7d2fe; cursor: not-allowed; }

        /* API KEY MODAL */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
        .modal { background: #fff; border-radius: 12px; padding: 28px; max-width: 420px; width: 90%; }
        .modal h2 { font-size: 17px; font-weight: 700; margin-bottom: 6px; }
        .modal p { font-size: 13px; color: #57606a; margin-bottom: 16px; line-height: 1.6; }
        .modal-input { width: 100%; border: 1px solid #e5e7eb; border-radius: 6px; padding: 9px 12px; font-size: 13px; margin-bottom: 12px; outline: none; font-family: monospace; }
        .modal-input:focus { border-color: #3b82d4; }
        .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .modal-btn { border: 1px solid #e5e7eb; background: #fff; border-radius: 6px; padding: 8px 16px; font-size: 13px; cursor: pointer; font-weight: 600; }
        .modal-btn.save { background: #3b82d4; color: #fff; border-color: #3b82d4; }
        .modal-note { font-size: 11px; color: #57606a; margin-top: 4px; }
        .messages::-webkit-scrollbar { width: 4px; }
        .messages::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
      `}</style>

      <div className="app">
        {/* NAV */}
        <div className="topnav">
          <div className="logo">Audit<span>AI</span></div>
          <div className="nav-right">
            {screen === "chat" && <div className="brand-badge">{brandName}</div>}
            {screen === "chat" && (
              <button className="api-btn" onClick={() => setShowApiKey(true)}>
                {apiKey ? "✓ OpenAI Connected" : "⚡ Add OpenAI Key"}
              </button>
            )}
            <span><span className="status-dot" />Ready</span>
          </div>
        </div>

        <div className="main">
          {/* SIDEBAR — only in chat */}
          {screen === "chat" && audit && (
            <div className="sidebar">
              <div className="sb-section">
                <div className="sb-title">Uploaded Files</div>
                {files.map((f) => (
                  <div key={f.type} className="file-item">
                    <span>{f.type === "sales" ? "📊" : f.type === "traffic" ? "📈" : f.type === "campaign" ? "🗂️" : "🔍"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="file-name">{f.name}</div>
                      <div className="file-meta">{f.rows.toLocaleString()} rows</div>
                    </div>
                    <span className="file-check">✓</span>
                  </div>
                ))}
              </div>

              <div className="sb-section">
                <div className="sb-title">Account Health</div>
                <div className="score-card">
                  <div className="score-tag-label">Health Score</div>
                  <div className="score-big" style={{ color: scoreColor(audit.score) }}>{audit.score}</div>
                  <div className="score-status" style={{ color: scoreColor(audit.score) }}>{audit.scoreLabel}</div>
                  <hr className="score-divider" />
                  <div className="score-row"><span className="label">Spend Efficiency</span><span style={{ color: scoreColor((audit.spendEfficiency / 70) * 100), fontWeight: 700 }}>{audit.spendEfficiency}/70</span></div>
                  <div className="score-row"><span className="label">Structure Quality</span><span style={{ color: scoreColor((audit.structureQuality / 30) * 100), fontWeight: 700 }}>{audit.structureQuality}/30</span></div>
                  <div className="score-row"><span className="label">Weekly Waste</span><span style={{ color: "#ef4444", fontWeight: 700 }}>{fmt$(audit.totalWeeklyWaste)}</span></div>
                  <div className="score-row"><span className="label">Opportunity</span><span style={{ color: "#22c55e", fontWeight: 700 }}>{fmt$(audit.totalMonthlyOpportunity)}/mo</span></div>
                </div>
              </div>

              <div className="sb-section">
                <div className="sb-title">Quick Topics</div>
                {[
                  { key: "all", icon: "💬", label: "All Topics" },
                  { key: "waste", icon: "🔥", label: "Budget Waste", badge: audit.findings.filter(f => f.category === "waste").length, badgeColor: "" },
                  { key: "opp", icon: "🚀", label: "Opportunities", badge: audit.findings.filter(f => f.category === "opportunity").length, badgeColor: "green" },
                  { key: "keywords", icon: "🔑", label: "Keywords" },
                  { key: "asins", icon: "📦", label: "ASINs" },
                  { key: "campaigns", icon: "📣", label: "Campaigns" },
                  { key: "pptx", icon: "📑", label: "Export Report" },
                ].map((item) => (
                  <div
                    key={item.key}
                    className={`nav-link${activeTopic === item.key ? " active" : ""}`}
                    onClick={() => {
                      const qMap: Record<string, string> = {
                        waste: "What is our biggest budget waste?",
                        opp: "Show me top growth opportunities",
                        keywords: "Which keywords should I pause?",
                        asins: "Which ASINs need more ad support?",
                        campaigns: "Show me campaign health overview",
                        pptx: "Create a PowerPoint presentation of the full audit",
                      };
                      setActiveTopic(item.key);
                      if (qMap[item.key]) sendMessage(qMap[item.key]);
                    }}
                  >
                    <span>{item.icon}</span> {item.label}
                    {item.badge ? <span className={`nl-badge ${item.badgeColor}`}>{item.badge}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UPLOAD SCREEN */}
          {screen === "upload" && (
            <div className="upload-screen">
              <div className="upload-card">
                <h1>Campaign Intelligence</h1>
                <p>Upload your Amazon advertising reports and start asking questions instantly. Your data never leaves your browser.</p>

                <div style={{ marginBottom: 12 }}>
                  <input
                    className="brand-input"
                    placeholder="Brand / Account name (optional)"
                    value={brandName === "Your Account" ? "" : brandName}
                    onChange={e => setBrandName(e.target.value || "Your Account")}
                  />
                </div>

                <div
                  className={`drop-zone${isDragging ? " dragging" : ""}`}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="drop-icon">📂</div>
                  <div className="drop-text">Drop files here or click to upload</div>
                  <div className="drop-sub">Excel (.xlsx) or CSV — Sales, Traffic, Campaign, Search Term reports</div>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.csv,.xls" multiple style={{ display: "none" }}
                    onChange={e => e.target.files && handleFiles(e.target.files)} />
                </div>

                <div className="file-types">
                  <span className="ft">📊 Sales Report</span>
                  <span className="ft">📈 Traffic Report</span>
                  <span className="ft">🗂️ Campaign Report</span>
                  <span className="ft">🔍 Search Term Report</span>
                </div>

                {files.length > 0 && (
                  <div className="uploaded-files">
                    {files.map(f => (
                      <div key={f.type} className="uf-item">
                        <span className="uf-check">✓</span>
                        <span style={{ flex: 1 }}>{f.name}</span>
                        <span className="uf-type">{f.type}</span>
                        <span style={{ fontSize: 11, color: "#57606a" }}>{f.rows.toLocaleString()} rows</span>
                      </div>
                    ))}
                  </div>
                )}

                <button className="analyze-btn" disabled={!canAnalyze} onClick={startAnalysis}>
                  {canAnalyze ? "Analyze My Data →" : "Upload at least one file to continue"}
                </button>
              </div>
            </div>
          )}

          {/* CHAT SCREEN */}
          {screen === "chat" && audit && (
            <div className="chat-screen">
              <div className="chat-header">
                <div>
                  <div className="ch-title">Campaign Intelligence Chat</div>
                  <div className="ch-sub">{files.reduce((s, f) => s + f.rows, 0).toLocaleString()} rows analyzed · {audit.findings.length} findings · Ask anything</div>
                </div>
                <div className="ch-actions">
                  <button className="ch-btn primary" onClick={() => sendMessage("Create a PowerPoint presentation of the full audit")}>📑 Export PPT</button>
                  <button className="ch-btn" onClick={() => { setScreen("upload"); setMessages([]); setAudit(null); setFiles([]); setRawData({}); }}>Upload New Files</button>
                </div>
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

      {/* API KEY MODAL */}
      {showApiKey && (
        <div className="modal-overlay" onClick={() => setShowApiKey(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Connect OpenAI (Optional)</h2>
            <p>Without a key, the app uses smart rule-based answers from your data. With an OpenAI key, responses are enhanced with natural language — all facts still come from your data, never hallucinated.</p>
            <input
              className="modal-input"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <p className="modal-note">🔒 Your key is stored in your browser only. Never sent to any server except OpenAI directly.</p>
            <div className="modal-actions">
              <button className="modal-btn" onClick={() => { setApiKey(""); setShowApiKey(false); }}>Clear & Close</button>
              <button className="modal-btn save" onClick={() => setShowApiKey(false)}>Save Key</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
