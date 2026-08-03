/**
 * Plugin architecture for Reachy's data sources. Every source — live or
 * future — implements this interface. Nothing in the ingestion pipeline
 * ever branches on a source's identity; it only calls `fetch()` on whatever
 * connectors are enabled. Adding a new source is: implement `Connector`,
 * register it in `registry.ts`. No other file changes.
 */

export interface NormalizedItem {
  /** Stable id within the source (e.g. Reddit post id, RSS guid). */
  externalId: string;
  title: string;
  url: string;
  author?: string;
  content: string;
  publishedAt?: Date;
}

export interface ConnectorContext {
  /** Per-source config as stored in `Source.config` (rate limits, feed URLs, etc). */
  config: Record<string, unknown>;
  /** Only return items published after this date when the source supports it. */
  since?: Date;
}

export interface Connector {
  /** Stable key, matches `Source.key` in the database. */
  key: string;
  name: string;
  description: string;
  /** Whether this connector is fully implemented (vs. a documented stub). */
  implemented: boolean;
  enabledByDefault: boolean;
  defaultConfig?: Record<string, unknown>;
  fetch(ctx: ConnectorContext): Promise<NormalizedItem[]>;
}
