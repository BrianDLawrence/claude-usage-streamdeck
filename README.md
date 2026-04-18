# Claude Usage — Stream Deck Plugin

A Stream Deck plugin that displays your **Claude.ai** session (5-hour) and weekly usage percentages on a Stream Deck key.

```
┌─────────────┐
│   Claude    │
│   S 42%     │
│   W 68%     │
└─────────────┘
```

> ⚠️ **Unofficial.** Anthropic does not publish a public API for Claude.ai subscription usage. This plugin calls an **internal** endpoint using your browser session cookie. It may break at any time — when it does, you'll need to re-discover the endpoint and update the parsing. Use at your own risk.

> 🔐 **Your cookie is sensitive.** The Cookie header you paste into this plugin grants full access to your Claude.ai account. Treat it like a password: don't commit it, don't paste it into issues, and redact it from logs before sharing.

---

## Contents

- [Prerequisites](#prerequisites)
- [Install & use](#install--use)
- [Develop on it](#develop-on-it)
- [How it works](#how-it-works)
- [Security](#security)
- [Gotchas](#gotchas)
- [Logs](#logs)
- [Contributing](#contributing)
- [License](#license)

---

## Prerequisites

- **Node.js 24+** — use [nvm](https://github.com/nvm-sh/nvm) or [nvm-windows](https://github.com/coreybutler/nvm-windows)
- **Stream Deck 7.1+** installed
- **Stream Deck CLI**: `npm install -g @elgato/cli`
- A logged-in Claude.ai browser session (to extract the cookie + endpoint)

---

## Install & use

### 1. Clone and build

```bash
git clone https://github.com/BrianDLawrence/claude-usage-streamdeck.git
cd claude-usage-streamdeck
npm install
npm run build
```

### 2. Find the real endpoint and cookie

The parsing code in [src/actions/claude-usage.ts](src/actions/claude-usage.ts) contains **placeholder field paths** that you must verify against the actual response on your account.

1. Open Chrome (logged into claude.ai)
2. Open DevTools → **Network** tab → filter **Fetch/XHR**
3. Navigate to `https://claude.ai/settings/usage`
4. Look for a JSON response containing your session/weekly numbers (something under `api.claude.ai/api/...`)
5. Right-click that request → **Copy → Copy as cURL**
6. Note:
   - The **URL** (this is your `endpoint`)
   - The full `Cookie:` header value (this is your `sessionCookie`)
   - The **JSON shape** of the response — if the field paths in `fetchUsage()` don't match, update them

### 3. Link the plugin into Stream Deck

```bash
streamdeck link com.speroautem.claude-usage.sdPlugin
```

### 4. Configure the button

Drag the **Claude Usage** action onto a Stream Deck key. Open the Property Inspector and paste:

- **Endpoint URL** — from step 2
- **Cookie** — the full Cookie header value from step 2
- **Poll interval** — how often to refresh (default: 5 min)

---

## Develop on it

```bash
npm run watch
```

`watch` runs Rollup in watch mode and auto-restarts the Stream Deck daemon on every rebuild. The plugin reloads with your changes without a manual restart.

For a walkthrough of the architecture, fragile points, and file layout, see [CLAUDE.md](CLAUDE.md).

---

## How it works

- **On `willAppear`** — starts a poll timer (default 5 min) that fetches usage and updates the key title.
- **On `keyDown`** — triggers an immediate refresh.
- **On `willDisappear`** — clears the timer to avoid leaks.
- **Global settings** — cookie + endpoint are stored once and shared across every button instance, so you don't re-enter them per key.
- **Placeholder icons** — the orange "C" tiles in `imgs/`. Replace with real artwork when ready; rerun `python generate_icons.py` to regenerate defaults (requires Pillow).

---

## Security

Your Claude.ai session cookie is the only credential in this plugin, and it grants full access to your account.

- **Never commit it.** The Cookie field is stored by the Stream Deck SDK in its own settings store, outside this repo. Keep it that way.
- **Redact logs before sharing.** Stream Deck logs contain the raw JSON response. If you attach logs to a bug report, scrub the `Cookie` line and any account-identifying values first.
- **Don't paste cookies into issues, PRs, or Discord.** If a maintainer asks for repro steps, share the endpoint URL shape and the JSON response shape, not the cookie.
- **Rotate if exposed.** If you suspect your cookie has leaked, log out of claude.ai in your browser — that invalidates the session.

---

## Gotchas

- **Cookie expiry** — session cookies expire in days to weeks. When the plugin starts showing `Error`, re-grab the cookie from DevTools before assuming it's a code bug.
- **Don't hammer the endpoint** — 5 minutes is plenty. Anything under 1 minute is rude.
- **The parsing is a guess** — the response shape is inferred from Claude Code's similar `five_hour` / `seven_day` endpoint. Claude.ai chat may return `session` / `weekly` or entirely different keys. Check `streamDeck.logger.debug` output (see [Logs](#logs)) to see the raw response, then adjust.
- **macOS Gatekeeper** — on first launch, Stream Deck may prompt you to allow the plugin. This is expected for any unsigned plugin linked via `streamdeck link`.

---

## Logs

- **macOS**: `~/Library/Logs/ElgatoStreamDeck/`
- **Windows**: `%APPDATA%\Elgato\StreamDeck\logs\`

Look for `com.speroautem.claude-usage.*.log`.

---

## Contributing

Issues and pull requests welcome.

- Read [CLAUDE.md](CLAUDE.md) first — it documents the architecture, fragile points, and conventions.
- `npm run build` must pass before submitting a PR.
- Don't include real cookies or logs containing them in bug reports.
- The plugin is deliberately minimal (no tests, no lint, no CI). If you want to add tooling, open an issue to discuss scope before submitting a PR.

---

## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 Spero Autem LLC.
