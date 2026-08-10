import Link from "next/link";

const TABS = [
  { href: "/campaign-generator", label: "Campaign Generator", icon: "🚀" },
  { href: "/audit-engine", label: "Audit Engine", icon: "⚙️" },
  { href: "/keyword-harvest", label: "Keyword Harvest", icon: "🔎" },
];

export default function ToolkitNav({ active }: { active?: string }) {
  return (
    <div className="tk-nav">
      <div className="tk-nav-left">
        <Link className="tk-logo" href="/">
          <span className="tk-logo-mark">ACOSTA<span> ONE</span></span>
          <span className="tk-logo-sub">Retail Media Toolkit</span>
        </Link>
        <div className="tk-tabs">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={`tk-tab${active === t.href ? " active" : ""}`}>
              <span className="tk-tab-icon">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="tk-nav-right">
        <span className="tk-status"><span className="tk-status-dot" />Processed locally</span>
      </div>
    </div>
  );
}
