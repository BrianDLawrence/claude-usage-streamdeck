# Claude Usage — Stream Deck Plugin

A Stream Deck plugin that displays your **Claude.ai** session (5-hour) and weekly usage percentages on a Stream Deck key.

```
┌─────────────┐
│   Claude    │
│   S 42%     │
│   W 68%     │
└─────────────┘
```

> ⚠️ **Unofficial.** Anthropic does not publish an API for Claude.ai subscription usage. This plugin calls an **internal** endpoint using your browser session cookie. It may break at any time — when it does, you'll need to re-discover the endpoint and update the parsing. Use at your own risk.

---

## Prerequisites

- **Node.js 24+** — use [nvm](https://github.com/nvm-sh/nvm) or [nvm-windows](https://github.com/coreybutler/nvm-windows)
- **Stream Deck 7.1+** installed
- **Stream Deck CLI**:
  ```bash
  npm install -g @elgato/cli
  ```
- A logged-in Claude.ai browser session (to extract the cookie + endpoint)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Find the real endpoint and cookie

This is the most important step. The parsing code in `src/actions/claude-usage.ts` contains **placeholder field paths** that you must verify against the actual response.

1. Open Chrome (logged into claude.ai)
2. Open DevTools → **Network** tab → filter **Fetch/XHR**
3. Navigate to `https://claude.ai/settings/usage`
4. Look for a JSON response containing your session/weekly numbers (something under `api.claude.ai/api/...`)
5. Right-click that request → **Copy → Copy as cURL**
6. Note:
   - The **URL** (this is your `endpoint`)
   - The full `Cookie:` header value (this is your `sessionCookie`)
   - The **JSON shape** of the response — update `fetchUsage()` in `src/actions/claude-usage.ts` to read the correct fields

### 3. Link the plugin into Stream Deck

```bash
streamdeck link com.speroautem.claude-usage.sdPlugin
```

### 4. Build and watch

```bash
npm run watch
```

The plugin auto-reloads on source changes. Drag the **Claude Usage** action onto a Stream Deck key from the action list.

### 5. Configure

Click the key in Stream Deck, open the Property Inspector, and paste:
- **Endpoint URL** — from step 2
- **Cookie** — the full cookie header value from step 2
- **Poll interval** — how often to refresh (default: 5 min)

---

## Project layout

```
.
├── com.speroautem.claude-usage.sdPlugin/   # Stream Deck bundle
│   ├── manifest.json                     # plugin metadata
│   ├── bin/plugin.js                     # built output (gitignored)
│   ├── imgs/                             # icons
│   └── ui/claude-usage.html              # Property Inspector
├── src/
│   ├── plugin.ts                         # entry point
│   └── actions/
│       └── claude-usage.ts               # main action logic
├── generate_icons.py                     # regenerate placeholder icons
├── rollup.config.mjs
├── tsconfig.json
└── package.json
```

---

## What the code does

- **On `willAppear`** — starts a poll timer (default 5 min) that fetches usage and updates the key title.
- **On `keyDown`** — triggers an immediate refresh.
- **On `willDisappear`** — clears the timer to avoid leaks.
- **Global settings** — cookie + endpoint are stored once and shared across every button instance, so you don't re-enter them per key.
- **Placeholder icons** — the orange "C" tiles in `imgs/`. Replace with real artwork when ready; rerun `python generate_icons.py` to regenerate defaults.

---

## Rename the plugin UUID

Before publishing or committing, change `com.speroautem.claude-usage` everywhere to your own reverse-DNS identifier. Affected files:

- folder name `com.speroautem.claude-usage.sdPlugin/`
- `manifest.json` → `UUID` and action `UUID`
- `src/actions/claude-usage.ts` → `@action({ UUID: ... })`
- `package.json` → `name` and the `watch` script's restart target
- `rollup.config.mjs` → `sdPlugin` constant

---

## Gotchas

- **Cookie expiry** — session cookies expire in days to weeks. When the plugin starts showing `Error`, re-grab the cookie from DevTools.
- **Don't hammer the endpoint** — 5 minutes is plenty. Anything under 1 minute is a bad idea.
- **The parsing is a guess** — I inferred the response shape from Claude Code's similar `five_hour` / `seven_day` endpoint. Claude.ai chat may return `session` / `weekly` or entirely different keys. **Check `streamDeck.logger.debug` output** (Stream Deck logs folder) to see the raw response, then adjust.
- **Keep the cookie private** — the Cookie field grants full access to your Claude.ai account. Don't commit it, don't share logs containing it.

---

## Logs

- **macOS**: `~/Library/Logs/ElgatoStreamDeck/`
- **Windows**: `%APPDATA%\Elgato\StreamDeck\logs\`

Look for `com.speroautem.claude-usage.*.log`.

---

## License

MIT — see [LICENSE](LICENSE).
