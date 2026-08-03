import { SELLER_TYPES, ADVERTISING_TYPES } from "@/lib/reachy/ai/schemas";

export function PainPointFilterBar({
  action,
  categories,
  current,
}: {
  action: string;
  categories: { name: string; slug: string }[];
  current: Record<string, string | undefined>;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-900 bg-neutral-900/30 p-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500" htmlFor="q">
          Search
        </label>
        <input
          id="q"
          name="q"
          defaultValue={current.q ?? ""}
          placeholder="keyword…"
          className="w-48 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500" htmlFor="category">
          Category
        </label>
        <select
          id="category"
          name="category"
          defaultValue={current.category ?? ""}
          className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        >
          <option value="">All</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500" htmlFor="sellerType">
          Seller Type
        </label>
        <select
          id="sellerType"
          name="sellerType"
          defaultValue={current.sellerType ?? ""}
          className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        >
          <option value="">All</option>
          {SELLER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500" htmlFor="advertisingType">
          Advertising Type
        </label>
        <select
          id="advertisingType"
          name="advertisingType"
          defaultValue={current.advertisingType ?? ""}
          className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        >
          <option value="">All</option>
          {ADVERTISING_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500" htmlFor="minScore">
          Min score
        </label>
        <input
          id="minScore"
          name="minScore"
          type="number"
          min={0}
          max={100}
          defaultValue={current.minScore ?? ""}
          className="w-20 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500" htmlFor="from">
          From
        </label>
        <input
          id="from"
          name="from"
          type="date"
          defaultValue={current.from ?? ""}
          className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500" htmlFor="to">
          To
        </label>
        <input
          id="to"
          name="to"
          type="date"
          defaultValue={current.to ?? ""}
          className="rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-600"
        />
      </div>

      <button type="submit" className="rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white">
        Apply
      </button>
      {Object.values(current).some(Boolean) && (
        <a href={action} className="text-xs text-neutral-500 hover:text-neutral-300">
          Clear
        </a>
      )}
    </form>
  );
}
