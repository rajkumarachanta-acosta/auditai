import ToolkitNav from "@/components/ToolkitNav";

export default function KeywordHarvestPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <ToolkitNav active="/keyword-harvest" />
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="card" style={{ padding: 40, maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🔎</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Keyword Harvesting</h1>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            This module is being built out from the source Keyword Harvest — Campaign Gap Analysis tool. Check back shortly.
          </p>
        </div>
      </main>
    </div>
  );
}
