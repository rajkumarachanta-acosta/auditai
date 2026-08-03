import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
        <Icon className="h-4 w-4 text-neutral-600" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-neutral-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between border-b border-neutral-900 px-8 py-6">
      <div>
        <h1 className="text-lg font-semibold text-neutral-100">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
