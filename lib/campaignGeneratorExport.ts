// ── Bulk Campaign Generator — workbook export ──
// Writes the Amazon SP Bulk Operations .xlsx exactly as the source tool does:
// same sheet order/names, same Config reference data, same column widths.
"use client";

import * as XLSX from "xlsx";
import { SP_HEADER, type GenerationResult } from "./campaignGenerator";

const CONFIG_DATA: (string | null)[][] = [
  ["SponsoredProductsProductNames", "Sponsored Products"],
  ["SponsoredProductsEntityNames", "Campaign"],
  ["SponsoredProductsOperationNames", "Create"],
  ["SponsoredProductsCreateCampaignOffAmazonBudgetControlStrategys", "Increase reach"],
  ["SponsoredProductsUpdateCampaignOffAmazonBudgetControlStrategys", "Increase reach"],
  ["SponsoredProductsCreateCampaignNegativeKeywordMatchTypes", "negativeExact"],
  ["SponsoredProductsCreateKeywordMatchTypes", "exact"],
  ["SponsoredProductsCreateNegativeKeywordMatchTypes", "negativeExact"],
  ["SponsoredProductsCreateCampaignTargetingTypes", "AUTO"],
  ["SponsoredProductsCreateCampaignStates", "enabled"],
  ["SponsoredProductsUpdateCampaignStates", "enabled"],
  ["SponsoredProductsCreateCampaignNegativeKeywordStates", "enabled"],
  ["SponsoredProductsUpdateCampaignNegativeKeywordStates", "archived"],
  ["SponsoredProductsCreateAdGroupStates", "enabled"],
  ["SponsoredProductsUpdateAdGroupStates", "enabled"],
  ["SponsoredProductsUpdateProductAdStates", "enabled"],
  ["SponsoredProductsCreateProductTargetingStates", "enabled"],
  ["SponsoredProductsUpdateProductTargetingStates", "enabled"],
  ["SponsoredProductsCreateNegativeProductTargetingStates", "enabled"],
  ["SponsoredProductsUpdateNegativeProductTargetingStates", "enabled"],
  ["SponsoredProductsCreateKeywordStates", "enabled"],
  ["SponsoredProductsUpdateKeywordStates", "enabled"],
  ["SponsoredProductsCreateNegativeKeywordStates", "enabled"],
  ["SponsoredProductsUpdateNegativeKeywordStates", "enabled"],
  ["SponsoredProductsCreateProductAdStates", "enabled"],
  ["SponsoredProductsCreateBiddingAdjustmentPlacements", "placementTop"],
  ["SponsoredProductsUpdateBiddingAdjustmentPlacements", "placementTop"],
  ["SponsoredProductsCreateCampaignStrategys", "Dynamic bids - down only"],
  ["SponsoredProductsUpdateCampaignStrategys", "Dynamic bids - down only"],
  ["SponsoredProductsCreateCampaignSiteRestrictions", "Amazon Business"],
  ["SponsoredProductsCreateCampaignRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsUpdateCampaignRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsArchiveCampaignRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsCreateBiddingAdjustmentRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsUpdateBiddingAdjustmentRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsArchiveBiddingAdjustmentRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsCreateCampaignNegativeKeywordRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsUpdateCampaignNegativeKeywordRequiredHeaders", "Keyword Id"],
  ["SponsoredProductsArchiveCampaignNegativeKeywordRequiredHeaders", "Keyword Id"],
  ["SponsoredProductsCreateAdGroupRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsUpdateAdGroupRequiredHeaders", "Ad Group Id"],
  ["SponsoredProductsArchiveAdGroupRequiredHeaders", "Ad Group Id"],
  ["SponsoredProductsUpdateProductAdRequiredHeaders", "Ad Id"],
  ["SponsoredProductsArchiveProductAdRequiredHeaders", "Ad Id"],
  ["SponsoredProductsCreateProductTargetingRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsUpdateProductTargetingRequiredHeaders", "Product Targeting Id"],
  ["SponsoredProductsArchiveProductTargetingRequiredHeaders", "Product Targeting Id"],
  ["SponsoredProductsCreateNegativeProductTargetingRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsUpdateNegativeProductTargetingRequiredHeaders", "Product Targeting Id"],
  ["SponsoredProductsArchiveNegativeProductTargetingRequiredHeaders", "Product Targeting Id"],
  ["SponsoredProductsCreateKeywordRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsUpdateKeywordRequiredHeaders", "Keyword Id"],
  ["SponsoredProductsArchiveKeywordRequiredHeaders", "Keyword Id"],
  ["SponsoredProductsCreateNegativeKeywordRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsUpdateNegativeKeywordRequiredHeaders", "Keyword Id"],
  ["SponsoredProductsArchiveNegativeKeywordRequiredHeaders", "Keyword Id"],
  ["SponsoredProductsCreateProductAdRequiredHeaders", "Campaign Id"],
  ["SponsoredProductsCreateCampaignOptionalHeaders", "Portfolio Id"],
  ["SponsoredProductsUpdateCampaignOptionalHeaders", "Portfolio Id"],
  ["SponsoredProductsArchiveCampaignOptionalHeaders", null],
  ["SponsoredProductsCreateBiddingAdjustmentOptionalHeaders", "Percentage"],
  ["SponsoredProductsUpdateBiddingAdjustmentOptionalHeaders", "Percentage"],
  ["SponsoredProductsArchiveBiddingAdjustmentOptionalHeaders", null],
  ["SponsoredProductsCreateCampaignNegativeKeywordOptionalHeaders", null],
  ["SponsoredProductsUpdateCampaignNegativeKeywordOptionalHeaders", null],
  ["SponsoredProductsArchiveCampaignNegativeKeywordOptionalHeaders", null],
  ["SponsoredProductsCreateAdGroupOptionalHeaders", null],
  ["SponsoredProductsUpdateAdGroupOptionalHeaders", null],
  ["SponsoredProductsArchiveAdGroupOptionalHeaders", null],
  ["SponsoredProductsUpdateProductAdOptionalHeaders", null],
  ["SponsoredProductsArchiveProductAdOptionalHeaders", null],
  ["SponsoredProductsCreateProductTargetingOptionalHeaders", "Bid"],
  ["SponsoredProductsUpdateProductTargetingOptionalHeaders", "Bid"],
  ["SponsoredProductsArchiveProductTargetingOptionalHeaders", null],
  ["SponsoredProductsCreateNegativeProductTargetingOptionalHeaders", null],
  ["SponsoredProductsUpdateNegativeProductTargetingOptionalHeaders", null],
  ["SponsoredProductsArchiveNegativeProductTargetingOptionalHeaders", null],
  ["SponsoredProductsCreateKeywordOptionalHeaders", "Bid"],
  ["SponsoredProductsUpdateKeywordOptionalHeaders", "Bid"],
  ["SponsoredProductsArchiveKeywordOptionalHeaders", null],
  ["SponsoredProductsCreateNegativeKeywordOptionalHeaders", null],
  ["SponsoredProductsUpdateNegativeKeywordOptionalHeaders", null],
  ["SponsoredProductsArchiveNegativeKeywordOptionalHeaders", null],
  ["SponsoredProductsCreateProductAdOptionalHeaders", null],
];

const COL_W = [22, 20, 10, 13, 13, 13, 10, 11, 16, 42, 26, 11, 11, 14, 10, 12, 16, 12, 17, 9, 32, 20, 20, 11, 26, 20, 12, 34, 12, 20, 20, 14, 20];

export function downloadBulkWorkbook(result: GenerationResult) {
  const spData = [SP_HEADER, ...result.spRows];
  const spWs = XLSX.utils.aoa_to_sheet(spData);
  spWs["!cols"] = COL_W.map((w) => ({ wch: w }));
  spWs["!freeze"] = { xSplit: 0, ySplit: 1 };
  spWs["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, result.spRows.length), c: SP_HEADER.length - 1 } }) };

  const cfgWs = XLSX.utils.aoa_to_sheet(CONFIG_DATA);
  cfgWs["!cols"] = [{ wch: 62 }, { wch: 34 }];

  const sumWs = XLSX.utils.aoa_to_sheet(result.summaryRows);
  sumWs["!cols"] = [{ wch: 42 }, { wch: 34 }];

  const emptyWs = () => XLSX.utils.aoa_to_sheet([]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, emptyWs(), "RAS Campaigns");
  XLSX.utils.book_append_sheet(wb, spWs, "Sponsored Products Campaigns");
  XLSX.utils.book_append_sheet(wb, emptyWs(), "SB Multi Ad Group Campaigns");
  XLSX.utils.book_append_sheet(wb, emptyWs(), "Sponsored Display Campaigns");
  XLSX.utils.book_append_sheet(wb, emptyWs(), "Sponsored Brands Campaigns");
  XLSX.utils.book_append_sheet(wb, emptyWs(), "Portfolios");
  XLSX.utils.book_append_sheet(wb, cfgWs, "Config");
  XLSX.utils.book_append_sheet(wb, sumWs, "Run Summary");

  XLSX.writeFile(wb, result.fileName);
}
