import type { Connector, ConnectorContext, NormalizedItem } from "./types";
import { createLogger } from "../logger";

const logger = createLogger("connector:reddit");

interface RedditListingChild {
  data: {
    id: string;
    title: string;
    selftext: string;
    author: string;
    permalink: string;
    created_utc: number;
    num_comments: number;
    score: number;
  };
}

interface RedditListingResponse {
  data: { children: RedditListingChild[] };
}

const DEFAULT_SUBREDDITS = ["FulfillmentByAmazon", "AmazonSeller", "PPC"];

export const redditConnector: Connector = {
  key: "reddit",
  name: "Reddit",
  description:
    "Pulls recent posts from Amazon seller/advertising subreddits via Reddit's public JSON listing endpoints (no API key required).",
  implemented: true,
  enabledByDefault: true,
  defaultConfig: { subreddits: DEFAULT_SUBREDDITS, postsPerSubreddit: 25 },

  async fetch(ctx: ConnectorContext): Promise<NormalizedItem[]> {
    const subreddits = (ctx.config.subreddits as string[] | undefined) ?? DEFAULT_SUBREDDITS;
    const postsPerSubreddit = (ctx.config.postsPerSubreddit as number | undefined) ?? 25;

    const results: NormalizedItem[] = [];

    for (const subreddit of subreddits) {
      const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/new.json?limit=${postsPerSubreddit}`;
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "ReachyBot/1.0 (Amazon ecosystem market research; contact: reachy@a-one.local)" },
          cache: "no-store",
        });
        if (!res.ok) {
          logger.warn("Non-200 response from Reddit", { subreddit, status: res.status });
          continue;
        }
        const json = (await res.json()) as RedditListingResponse;
        for (const child of json.data.children) {
          const publishedAt = new Date(child.data.created_utc * 1000);
          if (ctx.since && publishedAt < ctx.since) continue;
          const body = child.data.selftext?.trim();
          if (!body || body.length < 40) continue; // skip link-only / empty posts, not enough signal to extract from

          results.push({
            externalId: child.data.id,
            title: child.data.title,
            url: `https://www.reddit.com${child.data.permalink}`,
            author: child.data.author,
            content: body,
            publishedAt,
          });
        }
      } catch (error) {
        logger.error("Failed to fetch subreddit", { subreddit, error: String(error) });
      }
    }

    return results;
  },
};
