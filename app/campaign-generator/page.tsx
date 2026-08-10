import ToolkitNav from "@/components/ToolkitNav";

export default function CampaignGeneratorPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <ToolkitNav active="/campaign-generator" />
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="card" style={{ padding: 40, maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🚀</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Bulk Campaign Generator</h1>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            This module is being built out from the source Amazon Bulk Campaign Generator tool. Check back shortly.
          </p>
        </div>
      </main>
    </div>
  );
}
