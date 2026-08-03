import Parser from "rss-parser";
import type { Connector, ConnectorContext, NormalizedItem } from "./types";
import { createLogger } from "../logger";

const parser = new Parser();

/**
 * Generic, real RSS/Atom connector. Any source that publishes a feed
 * (industry blogs, Amazon Advertising's announcements blog, etc.) is just a
 * different `feeds` config on this same implementation — no per-source code.
 */
export function createRssConnector(options: {
  key: string;
  name: string;
  description: string;
  defaultFeeds: { name: string; url: string }[];
  enabledByDefault?: boolean;
}): Connector {
  const logger = createLogger(`connector:${options.key}`);

  return {
    key: options.key,
    name: options.name,
    description: options.description,
    implemented: true,
    enabledByDefault: options.enabledByDefault ?? false,
    defaultConfig: { feeds: options.defaultFeeds },

    async fetch(ctx: ConnectorContext): Promise<NormalizedItem[]> {
      const feeds = (ctx.config.feeds as { name: string; url: string }[] | undefined) ?? options.defaultFeeds;
      const results: NormalizedItem[] = [];

      for (const feed of feeds) {
        try {
          const parsed = await parser.parseURL(feed.url);
          for (const item of parsed.items) {
            const content = (item.contentSnippet || item.content || item.summary || "").trim();
            if (!content || content.length < 40) continue;

            const publishedAt = item.isoDate ? new Date(item.isoDate) : undefined;
            if (ctx.since && publishedAt && publishedAt < ctx.since) continue;

            results.push({
              externalId: item.guid ?? item.link ?? `${feed.name}:${item.title}`,
              title: item.title ?? "(untitled)",
              url: item.link ?? feed.url,
              author: item.creator ?? item.author,
              content,
              publishedAt,
            });
          }
        } catch (error) {
          logger.error("Failed to fetch feed", { feed: feed.url, error: String(error) });
        }
      }

      return results;
    },
  };
}
