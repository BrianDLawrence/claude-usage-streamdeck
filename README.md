# Claude Usage — Stream Deck Plugin

Free, unofficial Stream Deck plugin that shows your **Claude.ai** session (5-hour) and weekly usage on a Stream Deck key. Paste your session key once, pick what to display per button, and you're done.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Claude    │     │   Session   │     │    Week     │
│  S  42%     │     │    42%      │     │    68%      │
│  W  68%     │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
   both mode         session only         week only
```

> ⚠️ **Unofficial.** Anthropic does not publish a public API for Claude.ai subscription usage. This plugin calls the same internal endpoint the [Claude.ai usage page](https://claude.ai/settings/usage) uses, authenticated with your browser session key. It may break at any time.
>
> 🔐 **Treat your session key like a password.** It grants full access to your Claude.ai account. It's stored by Stream Deck locally on your machine — not in this repo, not on our servers (there are no servers). Don't share it.

---

## Contents

- [Install in 3 clicks](#install-in-3-clicks)
- [How to get your session key](#how-to-get-your-session-key)
- [Configuring each button](#configuring-each-button)
- [Uninstall / rotate / troubleshoot](#uninstall--rotate--troubleshoot)
- [What this plugin sends and stores](#what-this-plugin-sends-and-stores)
- [Build it yourself](#build-it-yourself)
- [Contributing](#contributing)
- [License](#license)

---

## Install in 3 clicks

No Node, no npm, no CLI.

1. **Download** the latest `com.speroautem.claude-usage.streamDeckPlugin` from the [Releases page](https://github.com/BrianDLawrence/claude-usage-streamdeck/releases/latest).
2. **Double-click** the downloaded file. Stream Deck will install it and ask you to enable it — say yes.
3. **Drag** the **Claude Usage** action from the right-hand action list onto any Stream Deck key.

The key will show `Add session key` until you paste yours in. Open the key's Property Inspector (the settings panel) and continue to the next section.

> **Stream Deck 6.5+** is required. Mac 10.15+ or Windows 10+.

---

## How to get your session key

Your session key is a cookie named `sessionKey` in your logged-in Claude.ai browser session. It looks like `sk-ant-sid01-…` and is roughly 100–200 characters long.

### Chrome / Edge / Brave / Arc

1. Go to **https://claude.ai** and make sure you're logged in.
2. Open DevTools: **View → Developer → Developer Tools** (Mac: `⌥⌘I`, Windows: `F12`).
3. Switch to the **Application** tab.
4. In the left sidebar, expand **Storage → Cookies → https://claude.ai**.
5. Find the row named **`sessionKey`**. Double-click the **Value** column and copy the whole string (it starts with `sk-ant-sid01-`).

### Firefox

1. Go to **https://claude.ai** logged in.
2. Open DevTools (`⌥⌘I` / `F12`).
3. Switch to the **Storage** tab.
4. Expand **Cookies → https://claude.ai**.
5. Find **`sessionKey`**, copy the Value.

### Safari

1. Enable the Develop menu: **Safari → Settings → Advanced → Show features for web developers**.
2. Go to **https://claude.ai**, then **Develop → Show Web Inspector**.
3. **Storage → Cookies → claude.ai**.
4. Copy the **Value** for `sessionKey`.

Now back in Stream Deck:

1. Paste the session key into the **Session key** field in the Property Inspector.
2. Click **Test connection**.
3. If it's valid, you'll see a green "Connected" status and your organization name. That's it — every Claude Usage button on this machine now uses this key.

> **Pasting the whole Cookie header by accident?** That's fine. The plugin auto-extracts `sessionKey=…` from a full cookie string, so you can paste `sessionKey=sk-ant-sid01-…; __cf_bm=…` and it still works.

---

## Configuring each button

You only paste the session key once. Each individual button then has two per-key settings:

- **Display** — `Both` (session + week bars), `Session only`, or `Week only`.
- **Label** — optional text drawn above the gauge (e.g. "Claude" or a project name).

You can put multiple Claude Usage buttons on the same profile — one for session, one for week, one that shows both. They all share the single session key.

The button refreshes every **5 minutes** by default. Press the key to force a refresh. You can change the interval (1–30 min) in the Property Inspector.

Colors on the gauge:

- 🟢 Green — under 75%
- 🟡 Yellow — 75% or more
- 🟠 Orange — 90% or more
- 🔴 Red — 95% or more

---

## Uninstall / rotate / troubleshoot

**Uninstall** — right-click the plugin in Stream Deck's action list and choose **Uninstall**.

**Rotate the session key** — open any Claude Usage button's Property Inspector, click **Clear saved key**, paste the new one, Test connection. The new key applies to every button.

**Button shows `Session expired`** — your `sessionKey` cookie expired. Log in to claude.ai again, grab the new `sessionKey` value, paste it in. Session keys typically last days to weeks.

**Button shows `Error`** — open Stream Deck logs and look for a `com.speroautem.claude-usage.*.log` file:

- **macOS**: `~/Library/Logs/ElgatoStreamDeck/`
- **Windows**: `%APPDATA%\Elgato\StreamDeck\logs\`

Before sharing a log, **redact any line containing `sessionKey` or `Cookie:`** — those contain your credential.

**`Rate-limited`** — you're polling too fast. Set the interval to 5 minutes or more.

---

## What this plugin sends and stores

This plugin makes HTTP requests only to **`https://claude.ai/api/...`**. There are no third-party servers, no telemetry, no analytics. Specifically:

- `GET https://claude.ai/api/organizations` — to find your organization ID on first run.
- `GET https://claude.ai/api/organizations/{id}/usage` — every poll interval.

Both requests include a `Cookie: sessionKey=…` header with the value you pasted in. This is exactly what your browser does when you visit the Claude.ai usage page.

**Stored on your machine, by the Stream Deck SDK's own settings store:**

- Your session key (global).
- The organization ID the first successful call returned (global, cached so subsequent polls skip the /organizations lookup).
- Each button's display mode and label.

Nothing is stored in this repo or transmitted anywhere else.

---

## Build it yourself

If you'd rather build from source than download a release — or you want to hack on it — you'll need:

- **Node.js 20.5.1+**
- **Stream Deck 6.5+**
- **Stream Deck CLI**: `npm install -g @elgato/cli`

```bash
git clone https://github.com/BrianDLawrence/claude-usage-streamdeck.git
cd claude-usage-streamdeck
npm install
npm run build
streamdeck link com.speroautem.claude-usage.sdPlugin
```

Stream Deck will restart and load the plugin in developer mode. To iterate:

```bash
npm run watch
```

This rebuilds on save and restarts the plugin automatically.

To produce your own `.streamDeckPlugin` installable:

```bash
npm run pack
```

The output lands in `release/com.speroautem.claude-usage.streamDeckPlugin` — double-click it to install.

For architecture, fragile points, and file layout see [CLAUDE.md](CLAUDE.md).

---

## Contributing

Issues and pull requests welcome. A few ground rules:

- `npm run build` must pass cleanly before you submit a PR.
- **Never** paste a real `sessionKey` value into an issue, PR, or log. If the maintainer asks for repro, share the JSON response *shape* and the HTTP status code, not the credential.
- The plugin is deliberately minimal — no tests, no lint. Open an issue to discuss scope before adding tooling.
- If the Claude.ai endpoint shape changes and breaks parsing, PR the fix in `src/claude/api.ts` (look at `parseUsage`).

---

## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 Spero Autem LLC.

Not affiliated with, endorsed by, or sponsored by Anthropic. "Claude" is a trademark of Anthropic, PBC.
