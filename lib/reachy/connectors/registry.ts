import type { Connector } from "./types";
import { redditConnector } from "./reddit";
import { createRssConnector } from "./rss";
import { amazonForumsConnector, linkedinConnector, youtubeConnector, internalDocsConnector } from "./stubs";

const amazonAdsAnnouncementsConnector = createRssConnector({
  key: "amazon-ads-announcements",
  name: "Amazon Advertising Announcements",
  description:
    "Official/industry coverage of Amazon Advertising product announcements. Default feed config is admin-editable on the Sources page — point it at whichever announcement feed your org tracks.",
  enabledByDefault: false,
  defaultFeeds: [],
});

const industryBlogsConnector = createRssConnector({
  key: "industry-blogs",
  name: "Industry Blogs",
  description: "RSS feeds from Amazon-seller and advertising industry blogs.",
  enabledByDefault: true,
  defaultFeeds: [
    { name: "Jungle Scout Blog", url: "https://www.junglescout.com/blog/feed/" },
    { name: "SellerApp Blog", url: "https://sellerapp.com/blog/feed/" },
  ],
});

/**
 * The plugin registry. This is the ONLY place source implementations are
 * wired together — the ingestion pipeline, seed script, and Sources API all
 * read from here and never import a specific connector by name.
 */
export const CONNECTOR_DEFINITIONS: Connector[] = [
  redditConnector,
  amazonAdsAnnouncementsConnector,
  industryBlogsConnector,
  amazonForumsConnector,
  linkedinConnector,
  youtubeConnector,
  internalDocsConnector,
];

const registryByKey = new Map(CONNECTOR_DEFINITIONS.map((c) => [c.key, c]));

export function getConnector(key: string): Connector | undefined {
  return registryByKey.get(key);
}

export function listConnectors(): Connector[] {
  return CONNECTOR_DEFINITIONS;
}
