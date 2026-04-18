# CLAUDE.md

Guidance for Claude Code when working in this repo. Keep edits surgical — the project is deliberately small.

## What this is

A Stream Deck plugin (TypeScript, Node 20) that shows Claude.ai session (5-hour) and weekly usage percentages on a button key. **Unofficial** — it calls an internal claude.ai JSON endpoint with the user's browser session cookie. Anthropic does not publish a public API for subscription usage, so the endpoint shape and auth may change without notice.

## Build & run

```bash
npm install
npm run build      # one-off rollup build → com.speroautem.claude-usage.sdPlugin/bin/plugin.js
npm run watch      # rollup -w + auto-restart of the Stream Deck daemon on rebuild
```

One-time, per developer machine:

```bash
npm install -g @elgato/cli
streamdeck link com.speroautem.claude-usage.sdPlugin
```

Logs land at `~/Library/Logs/ElgatoStreamDeck/com.speroautem.claude-usage.*.log` on macOS and `%APPDATA%\Elgato\StreamDeck\logs\` on Windows.

## Architecture

- Entry: [src/plugin.ts](src/plugin.ts) — registers the action, sets log level, connects to the Stream Deck SDK.
- Single action: [src/actions/claude-usage.ts](src/actions/claude-usage.ts) — a `SingletonAction` with three lifecycle handlers:
  - `onWillAppear` — starts a `setInterval` poll per button instance.
  - `onWillDisappear` — clears the timer and cache (prevents leaks).
  - `onKeyDown` — forces an immediate refresh.
- Property Inspector UI: [com.speroautem.claude-usage.sdPlugin/ui/claude-usage.html](com.speroautem.claude-usage.sdPlugin/ui/claude-usage.html) — per-button label in action settings; cookie + endpoint + poll interval in **global settings** so they're entered once.
- Icons: static PNGs in `com.speroautem.claude-usage.sdPlugin/imgs/`. [generate_icons.py](generate_icons.py) regenerates placeholder artwork (Pillow required, not in the build pipeline).

## Fragile points — read before editing

1. **`fetchUsage` field paths are guesses.** The code tries `json.session?.utilization`, `json.five_hour?.utilization`, etc. ([src/actions/claude-usage.ts:146-161](src/actions/claude-usage.ts#L146-L161)). Before "fixing" parsing, dump the real response via `streamDeck.logger.debug` and align the field paths — don't assume the current fallbacks are right.
2. **Session cookies expire in days to weeks.** When the button shows `Error`, the first hypothesis is an expired cookie, not a code bug.
3. **Plugin UUID `com.speroautem.claude-usage` is intentional** — Spero Autem LLC's namespace. Do not rename it, even if a contributor suggests it looks like a placeholder.

## Security-sensitive areas

Anything touching `sessionCookie`:

- [src/actions/claude-usage.ts](src/actions/claude-usage.ts) — `GlobalSettings.sessionCookie`, `fetchUsage` Cookie header.
- [com.speroautem.claude-usage.sdPlugin/ui/claude-usage.html](com.speroautem.claude-usage.sdPlugin/ui/claude-usage.html) — the textarea the user pastes into.

Rules:

- Never log the cookie value. `streamDeck.logger.debug` is fine for the JSON response; it must not be fine for request headers.
- Never echo the cookie into error messages surfaced to the button title.
- Never commit a real cookie, even in a "test fixture."

## Built-in skills worth invoking

- `/security-review` — run before tagging a release. Cookie handling is the main risk surface.
- `/code-review` or `/review` — for PRs from outside contributors.
- `/simplify` — after feature work. The codebase is ~175 lines of TS; keep it lean.
- `/fewer-permission-prompts` — after a few sessions, to allowlist the `npm run`, `streamdeck`, and `rollup` commands you keep approving.

## What not to do

- Don't introduce a test framework, linter, or formatter without asking. The minimal toolchain is a deliberate choice.
- Don't add dependencies for convenience. Node 20 built-ins (`fetch`, `setInterval`) cover everything the plugin needs.
- Don't poll faster than 1 minute — default is 5. The endpoint is undocumented; being polite is protective.
- Don't delete the "placeholder parsing" comment in `fetchUsage` until someone has actually verified the live response shape.
