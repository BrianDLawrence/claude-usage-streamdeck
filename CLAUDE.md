# CLAUDE.md

Guidance for Claude Code when working in this repo. Keep edits surgical — the project is deliberately small.

## What this is

A Stream Deck plugin (TypeScript, Node 20) that shows Claude.ai session (5-hour) and weekly usage percentages on a button key. **Unofficial** — it calls an internal claude.ai JSON endpoint using the user's `sessionKey` cookie. Anthropic does not publish a public API for subscription usage, so the endpoint shape and auth may change without notice.

## Build & run

```bash
npm install
npm run build      # one-off rollup build → com.speroautem.claude-usage.sdPlugin/bin/plugin.js
npm run watch      # rollup -w + auto-restart of the Stream Deck daemon on rebuild
npm run pack       # build + produce release/com.speroautem.claude-usage.streamDeckPlugin
npm run validate   # streamdeck validate on the sdPlugin folder
```

One-time, per developer machine:

```bash
npm install -g @elgato/cli
npm run link       # = streamdeck link com.speroautem.claude-usage.sdPlugin
```

Logs land at `~/Library/Logs/ElgatoStreamDeck/com.speroautem.claude-usage.*.log` on macOS and `%APPDATA%\Elgato\StreamDeck\logs\` on Windows.

## Architecture

- Entry: [src/plugin.ts](src/plugin.ts) — registers the action, sets log level, connects to the Stream Deck SDK.
- Single action: [src/actions/claude-usage.ts](src/actions/claude-usage.ts) — a `SingletonAction` with five lifecycle handlers:
  - `onWillAppear` — starts a `setInterval` poll per button instance, using the global `pollMinutes`.
  - `onWillDisappear` — clears the timer and cache (prevents leaks).
  - `onKeyDown` — forces an immediate refresh.
  - `onDidReceiveSettings` — re-renders with cached data when the user toggles display mode / label.
  - `onSendToPlugin` — handles the Property Inspector's "Test connection" button; validates the session key, lists organizations, and persists globally.
- Claude API: [src/claude/api.ts](src/claude/api.ts) — two endpoints, `/organizations` (list) and `/organizations/{id}/usage` (fetch). Both are called with `Cookie: sessionKey=…`. The org ID is cached in global settings after the first successful fetch.
- Session-key validation + extraction: [src/claude/session-key.ts](src/claude/session-key.ts) — validates `sk-ant-*` prefix and character set; auto-extracts `sessionKey=…` from a full pasted Cookie header.
- Icon rendering: [src/render/gauge.ts](src/render/gauge.ts) — generates a base64 SVG data URL (144×144) with dual bars (both mode) or a single ring (session/week only). Color thresholds: 0–74% green, 75–89% yellow, 90–94% orange, 95%+ red.
- Property Inspector UI: [com.speroautem.claude-usage.sdPlugin/ui/claude-usage.html](com.speroautem.claude-usage.sdPlugin/ui/claude-usage.html) — per-button `display` (both/session/week) + optional `label` live in action settings; `sessionKey`, `organizationId`, and `pollMinutes` live in **global settings** so they're entered once per machine. The "Test connection" button round-trips through `onSendToPlugin`.

## Fragile points — read before editing

1. **Endpoint shape may drift.** `parseUsage()` in [src/claude/api.ts](src/claude/api.ts) reads `json.five_hour.utilization`, `json.seven_day.utilization`, `json.seven_day_opus.utilization`, and `json.seven_day_sonnet.utilization`. If Claude.ai renames these, update parsing — don't guess new keys, dump the real response via `streamDeck.logger.debug` (with the cookie header stripped).
2. **Session keys expire in days to weeks.** When the button shows `Session expired`, the first hypothesis is an expired `sessionKey`, not a code bug.
3. **Plugin UUID `com.speroautem.claude-usage` is intentional** — Spero Autem LLC's namespace. Do not rename it, even if a contributor suggests it looks like a placeholder.
4. **TC39 Stage 3 decorators.** `@elgato/streamdeck` v1.4.1 uses the modern decorator signature `(target, context: ClassDecoratorContext)`. Do NOT re-add `experimentalDecorators: true` to tsconfig — it will silently break the `@action` decorator at build time (TS1238). The current `tsconfig.json` deliberately omits it.
5. **Rollup sourcemaps.** `sourceMap` is only enabled in watch mode, in both `rollup.config.mjs` (output.sourcemap) and the typescript plugin call. If you enable one, enable the other — mismatched settings produce a confusing "sourcemap option must be set" warning on every build.

## Security-sensitive areas

Anything touching the `sessionKey`:

- [src/actions/claude-usage.ts](src/actions/claude-usage.ts) — `GlobalSettings.sessionKey`, passed into `fetchUsage`.
- [src/claude/api.ts](src/claude/api.ts) — where the Cookie header is assembled.
- [src/claude/session-key.ts](src/claude/session-key.ts) — validation + extraction.
- [com.speroautem.claude-usage.sdPlugin/ui/claude-usage.html](com.speroautem.claude-usage.sdPlugin/ui/claude-usage.html) — the `<sdpi-password>` input the user pastes into.

Rules:

- Never log the session key value. `streamDeck.logger.debug` is fine for the JSON response body; it is not fine for request headers or settings snapshots.
- Never echo the session key into error messages surfaced to the button title or the Property Inspector status card.
- Never commit a real session key, even as a "test fixture." Validator tests should use synthetic `sk-ant-sid01-AAAA…` strings.

## Release process

Releases are driven entirely by Git tags:

1. Bump `package.json` `version` and the manifest's `Version` field (keep them in sync).
2. Commit, then `git tag vX.Y.Z && git push --tags`.
3. [.github/workflows/release.yml](.github/workflows/release.yml) builds + packs the `.streamDeckPlugin` and attaches it to a GitHub Release.

Users then download the single `.streamDeckPlugin` file and double-click to install — no Node, no npm, no CLI required.

## Built-in skills worth invoking

- `/security-review` — run before tagging a release. Session-key handling is the main risk surface.
- `/code-review` or `/review` — for PRs from outside contributors.
- `/simplify` — after feature work. Keep the codebase lean.

## What not to do

- Don't introduce a test framework, linter, or formatter without asking. The minimal toolchain is a deliberate choice.
- Don't add dependencies for convenience. Node 20 built-ins (`fetch`, `setInterval`) cover almost everything; rendering uses inline SVG, not a canvas dependency.
- Don't poll faster than 1 minute — default is 5. The endpoint is undocumented; being polite is protective.
- Don't ask the user for an "endpoint URL" or a "full Cookie header" — the plugin derives both from just the `sessionKey`. Reverting to the old cookie+endpoint UX would undo the session-key-only flow this version shipped.
- Don't re-enable `experimentalDecorators` in tsconfig (see Fragile points #4).
