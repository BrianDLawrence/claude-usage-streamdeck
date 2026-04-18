/**
 * Claude.ai usage API client.
 *
 * Endpoint shapes below match the *documented-by-reverse-engineering* paths
 * used by the mature Claude-Usage-Tracker macOS app
 * (Shared/Services/ClaudeAPIService.swift). They are UNOFFICIAL — Anthropic
 * does not publish a public subscription-usage API, so these endpoints may
 * change without notice. If you see repeated 404s after an Anthropic update,
 * start by dumping the real response structure via `streamDeck.logger.debug`.
 *
 * Auth: the `sessionKey` cookie value (starts with `sk-ant-sid01-`) read from
 * a logged-in claude.ai session in the user's browser. We send it as
 * `Cookie: sessionKey=<value>` just like the macOS app does.
 */

import streamDeck from "@elgato/streamdeck";

const BASE_URL = "https://claude.ai/api";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type Organization = {
  uuid: string;
  name: string;
};

export type UsageData = {
  /** 0-100 for the 5-hour window */
  sessionPct: number;
  /** 0-100 for the 7-day window (all models) */
  weeklyPct: number;
  /** 0-100 for 7-day Opus usage, if present in the response */
  weeklyOpusPct: number;
  /** 0-100 for 7-day Sonnet usage, if present in the response */
  weeklySonnetPct: number;
  /** ISO timestamp (or undefined if Claude didn't return one) */
  sessionResetsAt?: string;
  weeklyResetsAt?: string;
};

type AuthOpts = {
  sessionKey: string;
  organizationId?: string;
};

type FetchOpts = AuthOpts & {
  /** Override base URL for tests. */
  baseURL?: string;
};

/** Builds a GET request pre-configured with the claude.ai cookie + headers. */
function authedGet(url: string, sessionKey: string): RequestInit {
  return {
    method: "GET",
    headers: {
      Cookie: `sessionKey=${sessionKey}`,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      Referer: "https://claude.ai",
      Origin: "https://claude.ai",
    },
  };
}

async function call<T>(url: string, sessionKey: string): Promise<T> {
  const res = await fetch(url, authedGet(url, sessionKey));

  if (res.status === 401 || res.status === 403) {
    throw new Error("Unauthorized — your Claude session key may have expired. Sign back into claude.ai and re-paste the cookie.");
  }
  if (res.status === 429) {
    throw new Error("Rate-limited by Claude. Wait a minute, then refresh.");
  }
  if (!res.ok) {
    throw new Error(`Claude API returned HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

/**
 * Lists the organizations this session key has access to.
 * Equivalent to the macOS app's `fetchAllOrganizations`.
 */
export async function listOrganizations(sessionKey: string): Promise<Organization[]> {
  const raw = await call<any[]>(`${BASE_URL}/organizations`, sessionKey);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("Claude returned no organizations for this session key.");
  }
  return raw.map((o) => ({ uuid: String(o.uuid), name: String(o.name ?? "Unnamed org") }));
}

/**
 * Read-only test used by the "Test connection" button in the Property Inspector.
 * Returns the list of organizations the key can see — doesn't persist anything.
 */
export async function testSessionKey(sessionKey: string): Promise<Organization[]> {
  return listOrganizations(sessionKey);
}

/**
 * Fetch session + weekly usage.
 *
 * Uses a cached organization ID when provided; otherwise discovers one via
 * `/organizations` (picking the first, matching the macOS app's default).
 */
export async function fetchUsage(
  opts: FetchOpts,
): Promise<{ usage: UsageData; organizationId: string }> {
  const { sessionKey } = opts;

  let orgId = opts.organizationId;
  if (!orgId) {
    const orgs = await listOrganizations(sessionKey);
    orgId = orgs[0].uuid;
    streamDeck.logger.info(`Auto-selected organization ${orgs[0].name} (${orgId})`);
  }

  const url = `${BASE_URL}/organizations/${encodeURIComponent(orgId)}/usage`;
  const json = await call<any>(url, sessionKey);

  // v0.2.2: Log the raw response once per poll so we can diagnose shape drift.
  // This is INFO-level on purpose (debug is filtered out by default) and is
  // worth the slightly noisy log while we stabilize the parser against
  // real-world account responses.
  try {
    streamDeck.logger.info(
      `Usage response (raw): ${JSON.stringify(json)}`,
    );
  } catch {
    streamDeck.logger.info(
      `Usage response keys: ${Object.keys(json ?? {}).join(", ")}`,
    );
  }

  const usage = parseUsage(json);
  streamDeck.logger.info(
    `Parsed usage → session=${usage.sessionPct}% week=${usage.weeklyPct}% opus=${usage.weeklyOpusPct}% sonnet=${usage.weeklySonnetPct}%`,
  );

  return {
    organizationId: orgId,
    usage,
  };
}

/**
 * Parse Claude's subscription-usage JSON.
 *
 * Historical shape (from the mature macOS app, up through early 2026):
 *   {
 *     "five_hour":       { "utilization": 42, "resets_at": "..." },
 *     "seven_day":       { "utilization": 68, "resets_at": "..." },
 *     "seven_day_opus":  { "utilization": 12, "resets_at": "..." },
 *     "seven_day_sonnet":{ "utilization": 40, "resets_at": "..." }
 *   }
 *
 * In practice we've seen responses where the block keys are slightly different
 * (e.g. `fiveHour` / `sevenDay`), where the percentage field is named
 * `percentage_used` / `pct` / `used` / `value` instead of `utilization`, and
 * where the value is a 0-1 float rather than a 0-100 integer. We try every
 * combination we've observed — if all fail we log what we saw and return 0.
 */
function parseUsage(json: any): UsageData {
  const sessionBlock = pickBlock(json, [
    "five_hour",
    "fiveHour",
    "five_hour_window",
    "session",
    "current_session",
  ]);
  const weekBlock = pickBlock(json, [
    "seven_day",
    "sevenDay",
    "seven_day_window",
    "week",
    "weekly",
  ]);
  const opusBlock = pickBlock(json, [
    "seven_day_opus",
    "sevenDayOpus",
    "opus",
    "weekly_opus",
  ]);
  const sonnetBlock = pickBlock(json, [
    "seven_day_sonnet",
    "sevenDaySonnet",
    "sonnet",
    "weekly_sonnet",
  ]);

  return {
    sessionPct: readUtilization(sessionBlock),
    weeklyPct: readUtilization(weekBlock),
    weeklyOpusPct: readUtilization(opusBlock),
    weeklySonnetPct: readUtilization(sonnetBlock),
    sessionResetsAt: readResetsAt(sessionBlock),
    weeklyResetsAt: readResetsAt(weekBlock),
  };
}

/** Return the first nested object that exists under any of the given keys. */
function pickBlock(json: any, keys: string[]): any {
  if (!json || typeof json !== "object") return undefined;
  for (const k of keys) {
    if (json[k] != null) return json[k];
  }
  return undefined;
}

/**
 * Read a percentage out of a block, trying several common field names.
 * Values between 0 and 1 are treated as 0-1 floats and multiplied by 100.
 */
function readUtilization(block: any): number {
  if (block == null) return 0;

  // A block might itself be a raw number (e.g. `"five_hour": 0.42`).
  const candidates: any[] = [
    typeof block === "number" || typeof block === "string" ? block : undefined,
    block.utilization,
    block.percentage_used,
    block.percentageUsed,
    block.percent_used,
    block.percentUsed,
    block.pct,
    block.used,
    block.value,
    block.usage,
    block.usage_percent,
    block.usagePercent,
  ];

  for (const raw of candidates) {
    const parsed = coercePct(raw);
    if (parsed != null) return parsed;
  }
  return 0;
}

/** Coerce an Int/Double/numeric-string into a 0-100 integer. `null` on failure. */
function coercePct(raw: any): number | null {
  if (raw == null) return null;
  let n: number;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    n = raw;
  } else if (typeof raw === "string") {
    const cleaned = raw.replace("%", "").trim();
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return null;
    n = parsed;
  } else {
    return null;
  }
  // Treat small values as 0-1 fractions (e.g. 0.42 → 42%).
  if (n > 0 && n <= 1) n = n * 100;
  return clampPct(n);
}

function readResetsAt(block: any): string | undefined {
  if (block == null || typeof block !== "object") return undefined;
  const raw = block.resets_at ?? block.resetsAt ?? block.reset_at ?? block.resetAt;
  return typeof raw === "string" ? raw : undefined;
}

function clampPct(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}
