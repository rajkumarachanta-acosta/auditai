import type { Connector } from "./types";

/**
 * Sources that need an official/partner API (or credentialed access) before
 * they can ingest anything for real. Each is a fully interface-compliant
 * `Connector` so it shows up in Sources, can be toggled, and slots into the
 * ingestion pipeline unchanged the day a real implementation lands — it
 * just can't be *enabled* yet because there is no ToS-compliant way to pull
 * this data without that access.
 */

export const amazonForumsConnector: Connector = {
  key: "amazon-forums",
  name: "Amazon Seller Forums",
  description:
    "Amazon Seller Central / Vendor Central community forums. Requires an authenticated session or an official Amazon data-sharing agreement — no public read API exists. Stub until that access is in place.",
  implemented: false,
  enabledByDefault: false,
  async fetch() {
    return [];
  },
};

export const linkedinConnector: Connector = {
  key: "linkedin",
  name: "LinkedIn",
  description:
    "Posts/discussions from Amazon-seller and advertising groups on LinkedIn. Requires the LinkedIn Marketing API with partner approval; scraping would violate LinkedIn's ToS. Stub until API access is granted.",
  implemented: false,
  enabledByDefault: false,
  async fetch() {
    return [];
  },
};

export const youtubeConnector: Connector = {
  key: "youtube",
  name: "YouTube Transcripts",
  description:
    "Transcripts of Amazon-seller-focused YouTube channels/videos, via the official YouTube Data API (search) plus a captions/transcript fetch. Requires a YOUTUBE_API_KEY. Stub until that key is provisioned.",
  implemented: false,
  enabledByDefault: false,
  async fetch() {
    return [];
  },
};

export const internalDocsConnector: Connector = {
  key: "internal-docs",
  name: "Internal Documents",
  description: "Future: ingest internal research docs/notes. Not yet built.",
  implemented: false,
  enabledByDefault: false,
  async fetch() {
    return [];
  },
};
