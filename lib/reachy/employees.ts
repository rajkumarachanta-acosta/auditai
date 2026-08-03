import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  AlertTriangle,
  TrendingUp,
  Radar,
  FileText,
  Plug,
  Settings,
  Megaphone,
  Users,
  MessageSquareHeart,
  Brain,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface AiEmployee {
  id: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
  /** Base route this employee is mounted at, e.g. "/reachy" */
  basePath: string;
  live: boolean;
  nav?: NavItem[];
}

/**
 * A One's employee registry. Every AI employee — live or "coming soon" —
 * is a single entry here. The sidebar, route guards, and future dashboards
 * are all driven off this list, so adding Marketing/Monitory/Feedy/Brainy
 * later means adding an entry (and a route folder), not touching this file's
 * consumers.
 */
export const AI_EMPLOYEES: AiEmployee[] = [
  {
    id: "reachy",
    name: "Reachy",
    tagline: "Market Research",
    icon: Radar,
    basePath: "/reachy",
    live: true,
    nav: [
      { label: "Dashboard", href: "/reachy", icon: LayoutDashboard },
      { label: "Pain Points", href: "/reachy/pain-points", icon: AlertTriangle },
      { label: "Opportunities", href: "/reachy/opportunities", icon: TrendingUp },
      { label: "Competitor Watch", href: "/reachy/competitors", icon: Radar },
      { label: "Reports", href: "/reachy/reports", icon: FileText },
      { label: "Sources", href: "/reachy/sources", icon: Plug },
      { label: "Settings", href: "/reachy/settings", icon: Settings },
    ],
  },
  {
    id: "marketing",
    name: "Marketing",
    tagline: "Content Marketing & Lead Generation",
    icon: Megaphone,
    basePath: "/marketing",
    live: false,
  },
  {
    id: "monitory",
    name: "Monitory",
    tagline: "CRM & Lead Monitoring",
    icon: Users,
    basePath: "/monitory",
    live: false,
  },
  {
    id: "feedy",
    name: "Feedy",
    tagline: "Customer Feedback",
    icon: MessageSquareHeart,
    basePath: "/feedy",
    live: false,
  },
  {
    id: "brainy",
    name: "Brainy",
    tagline: "Executive Decision Making",
    icon: Brain,
    basePath: "/brainy",
    live: false,
  },
];

export function getEmployee(id: string): AiEmployee | undefined {
  return AI_EMPLOYEES.find((e) => e.id === id);
}
