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

  // Don't log the whole response in production; it contains account identifiers.
  streamDeck.logger.debug(
    `Usage response keys: ${Object.keys(json ?? {}).join(", ")}`,
  );

  return {
    organizationId: orgId,
    usage: parseUsage(json),
  };
}

/**
 * Parse Claude's subscription-usage JSON.
 *
 * Shape (as of April 2026, from the macOS app):
 *   {
 *     "five_hour":       { "utilization": 42, "resets_at": "..." },
 *     "seven_day":       { "utilization": 68, "resets_at": "..." },
 *     "seven_day_opus":  { "utilization": 12, "resets_at": "..." },
 *     "seven_day_sonnet":{ "utilization": 40, "resets_at": "..." }
 *   }
 *
 * `utilization` may be an Int, Double, or numeric String. We coerce all three.
 */
function parseUsage(json: any): UsageData {
  return {
    sessionPct: readUtilization(json?.five_hour),
    weeklyPct: readUtilization(json?.seven_day),
    weeklyOpusPct: readUtilization(json?.seven_day_opus),
    weeklySonnetPct: readUtilization(json?.seven_day_sonnet),
    sessionResetsAt: readResetsAt(json?.five_hour),
    weeklyResetsAt: readResetsAt(json?.seven_day),
  };
}

function readUtilization(block: any): number {
  if (block == null) return 0;

  const raw = block.utilization;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return clampPct(raw);
  }
  if (typeof raw === "string") {
    const cleaned = raw.replace("%", "").trim();
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return clampPct(parsed);
  }
  return 0;
}

function readResetsAt(block: any): string | undefined {
  if (block == null) return undefined;
  const raw = block.resets_at;
  return typeof raw === "string" ? raw : undefined;
}

function clampPct(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}
