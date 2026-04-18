import streamDeck, {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
} from "@elgato/streamdeck";

import { fetchUsage, testSessionKey, UsageData } from "../claude/api";
import { validateSessionKey } from "../claude/session-key";
import { renderUsageImage } from "../render/gauge";

/**
 * Per-button settings.
 * - `display` controls what the button renders (both, session-only, week-only).
 * - `label` is an optional override label rendered above the gauge.
 */
type ActionSettings = {
  display?: "both" | "session" | "week";
  label?: string;
};

/**
 * Global settings shared across every button instance.
 * - `sessionKey` is the value of the `sessionKey` cookie on claude.ai.
 *   It's stored by the Stream Deck SDK in its own settings store, not this repo.
 * - `organizationId` is cached after the first successful fetch so we skip the
 *   /organizations round-trip on every poll.
 * - `pollMinutes` defaults to 5.
 */
type GlobalSettings = {
  sessionKey?: string;
  organizationId?: string;
  pollMinutes?: number;
};

const DEFAULT_POLL_MINUTES = 5;
const MIN_POLL_MINUTES = 1;

@action({ UUID: "com.speroautem.claude-usage.display" })
export class ClaudeUsageAction extends SingletonAction<ActionSettings> {
  /** One poll timer per visible button instance. */
  private pollTimers = new Map<string, NodeJS.Timeout>();

  /** Cache the last result per instance so we can re-render without refetching. */
  private lastUsage = new Map<string, UsageData>();

  override async onWillAppear(ev: WillAppearEvent<ActionSettings>): Promise<void> {
    await this.refresh(ev.action.id, ev);

    const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    const minutes = Math.max(
      MIN_POLL_MINUTES,
      Number(global.pollMinutes) || DEFAULT_POLL_MINUTES,
    );
    const intervalMs = minutes * 60 * 1000;

    const timer = setInterval(() => {
      this.refresh(ev.action.id, ev).catch((err) =>
        streamDeck.logger.error("Poll failed", err),
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

  /** Pressing the key forces an immediate refresh — handy for on-demand updates. */
  override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
    await this.refresh(ev.action.id, ev);
  }

  /** Re-render when the user tweaks the label or display mode. */
  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<ActionSettings>,
  ): Promise<void> {
    const cached = this.lastUsage.get(ev.action.id);
    if (cached) {
      await this.render(ev, cached);
    }
  }

  /**
   * Property Inspector "Test connection" button.
   * We receive a `{ event: "testConnection", sessionKey }` payload, try to list
   * organizations, and send back the list (or an error) for the UI to display.
   */
  override async onSendToPlugin(
    ev: SendToPluginEvent<any, ActionSettings>,
  ): Promise<void> {
    const payload = ev.payload as { event?: string; sessionKey?: string };
    streamDeck.logger.info(
      `onSendToPlugin: event=${payload?.event ?? "<none>"} keyLen=${payload?.sessionKey?.length ?? 0}`,
    );

    if (payload?.event !== "testConnection") {
      return;
    }

    // Prefer replying to the exact PI that sent this event; fall back to ui.current.
    const pi = (ev.action as any).sendToPropertyInspector
      ? ev.action
      : streamDeck.ui.current;

    try {
      const validated = validateSessionKey(payload.sessionKey ?? "");
      streamDeck.logger.info("Session key validated. Listing organizations…");
      const organizations = await testSessionKey(validated);
      streamDeck.logger.info(`Found ${organizations.length} organization(s).`);

      // Persist globally so every button on every Stream Deck profile picks it up.
      const existing =
        await streamDeck.settings.getGlobalSettings<GlobalSettings>();
      await streamDeck.settings.setGlobalSettings({
        ...existing,
        sessionKey: validated,
        // Auto-select the first org (matches the mature macOS app's default).
        organizationId: organizations[0]?.uuid ?? existing.organizationId,
      });

      await (pi as any)?.sendToPropertyInspector({
        event: "testConnection",
        ok: true,
        organizations,
      });
    } catch (err) {
      streamDeck.logger.error("Test connection failed", err);
      await (pi as any)?.sendToPropertyInspector({
        event: "testConnection",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async refresh(
    instanceId: string,
    ev: WillAppearEvent<ActionSettings> | KeyDownEvent<ActionSettings>,
  ): Promise<void> {
    const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();

    if (!global.sessionKey) {
      await ev.action.setTitle("Add\nsession\nkey");
      await ev.action.setImage(undefined);
      return;
    }

    try {
      const { usage, organizationId } = await fetchUsage({
        sessionKey: global.sessionKey,
        organizationId: global.organizationId,
      });

      // Cache the org ID for subsequent polls.
      if (organizationId !== global.organizationId) {
        await streamDeck.settings.setGlobalSettings({
          ...global,
          organizationId,
        });
      }

      this.lastUsage.set(instanceId, usage);
      await this.render(ev, usage);
    } catch (err) {
      streamDeck.logger.error("Failed to fetch usage", err);

      const message = err instanceof Error ? err.message : "Error";
      const short = message.toLowerCase().includes("unauthor")
        ? "Session\nexpired"
        : "Error";

      await ev.action.setTitle(short);
      await ev.action.setImage(undefined);
    }
  }

  private async render(
    ev:
      | WillAppearEvent<ActionSettings>
      | KeyDownEvent<ActionSettings>
      | DidReceiveSettingsEvent<ActionSettings>,
    data: UsageData,
  ): Promise<void> {
    const settings = ev.payload.settings;
    const display = settings.display ?? "both";
    const label = settings.label?.trim() || undefined;

    const svg = renderUsageImage({ data, display, label });
    await ev.action.setImage(`data:image/svg+xml;base64,${svg}`);

    // Clear the fallback title so the custom icon is the source of truth.
    await ev.action.setTitle("");
  }
}
