import streamDeck, {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";

/**
 * Per-button settings (configured via the Property Inspector).
 * Keep secrets like the session cookie in global settings instead — see below.
 */
type ActionSettings = {
  /** Label prefix shown above the percentages (e.g. "Claude"). Optional. */
  label?: string;
};

/**
 * Global settings shared across all buttons using this plugin.
 * Store the session cookie + endpoint here so you only configure them once.
 */
type GlobalSettings = {
  /** Full Cookie header value copied from your browser (includes sessionKey=...). */
  sessionCookie?: string;
  /** The internal JSON endpoint you identified in DevTools. */
  endpoint?: string;
  /** Poll interval in minutes. Defaults to 5. */
  pollMinutes?: number;
};

type UsageData = {
  sessionPct: number;
  weeklyPct: number;
  sessionResetsAt?: string;
  weeklyResetsAt?: string;
};

const DEFAULT_POLL_MINUTES = 5;

@action({ UUID: "com.speroautem.claude-usage.display" })
export class ClaudeUsageAction extends SingletonAction<ActionSettings> {
  /** One poll timer per visible button instance. */
  private pollTimers = new Map<string, NodeJS.Timeout>();

  /** Cache the last result per instance so we can re-render without refetching. */
  private lastUsage = new Map<string, UsageData>();

  override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
    await this.refresh(ev.action.id, ev);
    const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    const intervalMs = (global.pollMinutes ?? DEFAULT_POLL_MINUTES) * 60 * 1000;

    const timer = setInterval(() => {
      this.refresh(ev.action.id, ev).catch((err) =>
        streamDeck.logger.error("Poll failed", err)
      );
    }, intervalMs);

    this.pollTimers.set(ev.action.id, timer);
  }

  override onWillDisappear(ev: WillDisappearEvent<ActionSettings>): void {
    const timer = this.pollTimers.get(ev.action.id);
    if (timer) clearInterval(timer);
    this.pollTimers.delete(ev.action.id);
    this.lastUsage.delete(ev.action.id);
  }

  /** A key press triggers an immediate refresh — handy for on-demand updates. */
  override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
    await this.refresh(ev.action.id, ev);
  }

  /** Per-action settings changed (e.g. label tweak) — just re-render. */
  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<ActionSettings>
  ): Promise<void> {
    const cached = this.lastUsage.get(ev.action.id);
    if (cached) {
      await this.renderTitle(ev, cached);
    }
  }

  private async refresh(
    instanceId: string,
    ev: WillAppearEvent<ActionSettings> | KeyDownEvent<ActionSettings>
  ): Promise<void> {
    const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    const { sessionCookie, endpoint } = global;

    if (!sessionCookie || !endpoint) {
      await ev.action.setTitle("Not\nconfigured");
      return;
    }

    try {
      const data = await this.fetchUsage(endpoint, sessionCookie);
      this.lastUsage.set(instanceId, data);
      await this.renderTitle(ev, data);
    } catch (err) {
      streamDeck.logger.error("Failed to fetch usage", err);
      await ev.action.setTitle("Error");
    }
  }

  private async renderTitle(
    ev:
      | WillAppearEvent<ActionSettings>
      | KeyDownEvent<ActionSettings>
      | DidReceiveSettingsEvent<ActionSettings>,
    data: UsageData
  ): Promise<void> {
    const label = ev.payload.settings.label?.trim();
    const header = label ? `${label}\n` : "";
    const title = `${header}S ${data.sessionPct}%\nW ${data.weeklyPct}%`;
    await ev.action.setTitle(title);
  }

  /**
   * Fetch usage from the internal JSON endpoint.
   *
   * !!! IMPORTANT !!!
   * The field paths below (`json.session?.utilization`, etc.) are GUESSES.
   * You MUST inspect the real response in Chrome DevTools (Network tab,
   * visit claude.ai/settings/usage) and adjust the parsing to match.
   */
  private async fetchUsage(endpoint: string, cookie: string): Promise<UsageData> {
    const res = await fetch(endpoint, {
      headers: {
        Cookie: cookie,
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${endpoint}`);
    }

    const json: any = await res.json();
    streamDeck.logger.debug("Usage response:", JSON.stringify(json));

    // --- PLACEHOLDER PARSING — edit to match your actual response shape ---
    const sessionPct = Math.round(
      json?.session?.utilization ?? json?.five_hour?.utilization ?? 0
    );
    const weeklyPct = Math.round(
      json?.weekly?.utilization ?? json?.seven_day?.utilization ?? 0
    );

    return {
      sessionPct,
      weeklyPct,
      sessionResetsAt:
        json?.session?.resets_at ?? json?.five_hour?.resets_at,
      weeklyResetsAt:
        json?.weekly?.resets_at ?? json?.seven_day?.resets_at,
    };
  }
}
