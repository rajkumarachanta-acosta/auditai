import { SELLER_TYPES, ADVERTISING_TYPES } from "./ai/schemas";
import type { PainPointFilters } from "./repositories/pain-point.repository";

export function parsePainPointFilters(searchParams: URLSearchParams): PainPointFilters {
  const sellerType = searchParams.get("sellerType");
  const advertisingType = searchParams.get("advertisingType");
  const minScore = searchParams.get("minScore");
  const maxScore = searchParams.get("maxScore");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = searchParams.get("page");
  const pageSize = searchParams.get("pageSize");
  const sort = searchParams.get("sort");

  return {
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    subcategory: searchParams.get("subcategory") ?? undefined,
    sellerType: sellerType && (SELLER_TYPES as readonly string[]).includes(sellerType) ? (sellerType as PainPointFilters["sellerType"]) : undefined,
    advertisingType:
      advertisingType && (ADVERTISING_TYPES as readonly string[]).includes(advertisingType)
        ? (advertisingType as PainPointFilters["advertisingType"])
        : undefined,
    competitor: searchParams.get("competitor") ?? undefined,
    minScore: minScore ? Number(minScore) : undefined,
    maxScore: maxScore ? Number(maxScore) : undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
    sort: sort === "recent" ? "recent" : "score",
  };
}
