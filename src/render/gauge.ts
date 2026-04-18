/**
 * Render the usage button as an SVG data URL.
 *
 * Stream Deck keys are displayed at 144×144 on modern hardware (XL) and
 * 72×72 on classic hardware; SVGs scale cleanly on both. We return base64-
 * encoded SVG so the action can hand it directly to `setImage(dataUrl)`.
 *
 * Layout:
 *   ┌─────────────┐
 *   │  [label]    │   (optional, 12px)
 *   │  S  ██  42% │
 *   │  W  ████ 68%│
 *   │  reset 3:12 │
 *   └─────────────┘
 *
 * In "session" or "week" display modes we use a big centered ring instead
 * of the two-row layout.
 */

import type { UsageData } from "../claude/api";

type DisplayMode = "both" | "session" | "week";

type RenderOpts = {
  data: UsageData;
  display: DisplayMode;
  label?: string;
};

const SIZE = 144;

/** Color ramp matches the mature macOS app's threshold levels. */
function colorFor(pct: number): string {
  if (pct >= 95) return "#ff3b30"; // critical
  if (pct >= 90) return "#ff9500"; // high
  if (pct >= 75) return "#ffcc00"; // warning
  return "#34c759"; // ok
}

export function renderUsageImage(opts: RenderOpts): string {
  const svg =
    opts.display === "both"
      ? renderDualBars(opts)
      : renderRing(opts);

  // Node 20+ has `btoa` globally.
  return btoa(svg);
}

// ─── Dual-bar layout ───────────────────────────────────────────────────────

function renderDualBars({ data, label }: RenderOpts): string {
  const pad = 12;
  const headerH = label ? 20 : 0;
  const barAreaY = headerH + pad;
  const rowH = (SIZE - barAreaY - pad) / 2;

  const sessionRow = barRow({
    y: barAreaY,
    height: rowH,
    labelText: "S",
    pct: data.sessionPct,
  });

  const weeklyRow = barRow({
    y: barAreaY + rowH,
    height: rowH,
    labelText: "W",
    pct: data.weeklyPct,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" fill="#111"/>
    ${label ? header(label) : ""}
    ${sessionRow}
    ${weeklyRow}
  </svg>`;
}

function header(text: string): string {
  return `<text x="${SIZE / 2}" y="16" fill="#fff" font-family="SF Pro, -apple-system, Helvetica, Arial, sans-serif"
    font-size="13" font-weight="600" text-anchor="middle">${escapeXml(text)}</text>`;
}

function barRow(opts: { y: number; height: number; labelText: string; pct: number }): string {
  const { y, height, labelText, pct } = opts;
  const pad = 12;
  const labelW = 18;
  const pctW = 34;
  const barX = pad + labelW + 4;
  const barY = y + height / 2 - 8;
  const barH = 16;
  const barW = SIZE - barX - pctW - pad;
  const fillW = Math.max(2, Math.round((barW * pct) / 100));
  const color = colorFor(pct);

  return `
    <text x="${pad}" y="${y + height / 2 + 5}" fill="#9a9a9e"
      font-family="SF Pro, -apple-system, Helvetica, Arial, sans-serif"
      font-size="15" font-weight="600">${labelText}</text>
    <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="3" fill="#2c2c2e"/>
    <rect x="${barX}" y="${barY}" width="${fillW}" height="${barH}" rx="3" fill="${color}"/>
    <text x="${SIZE - pad}" y="${y + height / 2 + 5}" fill="#fff"
      font-family="SF Pro, -apple-system, Helvetica, Arial, sans-serif"
      font-size="15" font-weight="700" text-anchor="end">${pct}%</text>
  `;
}

// ─── Ring layout (single metric) ───────────────────────────────────────────

function renderRing({ data, display, label }: RenderOpts): string {
  const pct = display === "session" ? data.sessionPct : data.weeklyPct;
  const windowLabel = display === "session" ? "Session" : "Week";
  const color = colorFor(pct);

  const cx = SIZE / 2;
  const cy = SIZE / 2 + (label ? 6 : 0);
  const radius = 48;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
    <rect width="${SIZE}" height="${SIZE}" fill="#111"/>
    ${label ? header(label) : ""}
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#2c2c2e" stroke-width="${stroke}"/>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none"
      stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${dash} ${circumference}"
      transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy + 2}" fill="#fff"
      font-family="SF Pro, -apple-system, Helvetica, Arial, sans-serif"
      font-size="28" font-weight="700" text-anchor="middle">${pct}%</text>
    <text x="${cx}" y="${cy + 24}" fill="#9a9a9e"
      font-family="SF Pro, -apple-system, Helvetica, Arial, sans-serif"
      font-size="12" font-weight="500" text-anchor="middle">${windowLabel}</text>
  </svg>`;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
