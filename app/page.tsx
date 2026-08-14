import Link from "next/link";
import ToolkitNav from "@/components/ToolkitNav";

const MODULES = [
  {
    href: "/campaign-generator",
    icon: "🚀",
    title: "Bulk Campaign Generator",
    description:
      "Create Amazon Sponsored Products campaigns at scale — targeting, bids, budgets and ad groups generated from your product and keyword data, exported as an Amazon Bulk Operations file.",
    cta: "Build campaigns",
    meta: "Module 1",
  },
  {
    href: "/audit-engine",
    icon: "⚙️",
    title: "Campaign Audit Engine",
    description:
      "Run a full account audit — keyword, search term, budget and ASIN analysis, health scoring, growth opportunities and prioritized recommendations — then export a leadership-ready summary.",
    cta: "Run an audit",
    meta: "Module 2",
  },
  {
    href: "/keyword-harvest",
    icon: "🔎",
    title: "Keyword Harvesting",
    description:
      "Discover campaign gaps by comparing what you're already targeting against real search-term performance, then prioritize branded, generic and competitor keyword opportunities.",
    cta: "Harvest keywords",
    meta: "Module 3",
  },
];

export default function DashboardPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <ToolkitNav />

      <main style={{ flex: 1, padding: "56px 24px 80px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div style={{ marginBottom: 44 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--orange)",
                marginBottom: 10,
              }}
            >
              Retail Media Toolkit
            </div>
            <h1 style={{ fontSize: 34, fontWeight: 800, margin: 0, lineHeight: 1.15, color: "var(--ink)" }}>
              Accelerate campaign creation, account audits and keyword discovery.
            </h1>
            <p style={{ fontSize: 15, color: "var(--ink-soft)", marginTop: 12, maxWidth: 620, lineHeight: 1.6 }}>
              Three retail media tools, one workspace. Every file is processed in your browser —
              nothing leaves your machine.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 20,
            }}
          >
            {MODULES.map((m) => (
              <Link key={m.href} href={m.href} className="module-card">
                <div className="module-card-icon">{m.icon}</div>
                <div className="module-card-meta">{m.meta}</div>
                <h3>{m.title}</h3>
                <p>{m.description}</p>
                <span className="module-card-cta">{m.cta} →</span>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "18px 24px",
          fontSize: 12,
          color: "var(--ink-faint)",
          textAlign: "center",
        }}
      >
        Acosta Commerce · Retail Media Toolkit · Data processed locally in your browser
      </footer>
    </div>
  );
}
