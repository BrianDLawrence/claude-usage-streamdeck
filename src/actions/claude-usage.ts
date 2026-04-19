import streamDeck, {
  action,
  DidReceiveSettingsEvent,
  KeyAction,
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
    // Dials can't render our custom icon, and the manifest is Keypad-only, so
    // we simply skip any non-key action that somehow gets here.
    if (!ev.action.isKey()) return;
    const keyAction = ev.action;

    await this.refreshAction(keyAction, ev.payload.settings);

    const global = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    const minutes = Math.max(
      MIN_POLL_MINUTES,
      Number(global.pollMinutes) || DEFAULT_POLL_MINUTES,
    );
    const intervalMs = minutes * 60 * 1000;

    const timer = setInterval(() => {
      this.refreshAction(keyAction).catch((err) =>
        streamDeck.logger.error("Poll failed", err),
      );
    }, intervalMs);

    this.pollTimers.set(keyAction.id, timer);
  }

  override onWillDisappear(ev: WillDisappearEvent<ActionSettings>): void {
    const timer = this.pollTimers.get(ev.action.id);
    if (timer) clearInterval(timer);
    this.pollTimers.delete(ev.action.id);
    this.lastUsage.delete(ev.action.id);
  }

  /** Pressing the key forces an immediate refresh — handy for on-demand updates. */
  override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
    await this.refreshAction(ev.action, ev.payload.settings);
  }

  /** Re-render when the user tweaks the label or display mode. */
  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<ActionSettings>,
  ): Promise<void> {
    if (!ev.action.isKey()) return;
    const cached = this.lastUsage.get(ev.action.id);
    if (cached) {
      await this.render(ev.action, ev.payload.settings, cached);
    }
  }

  /**
   * Force-refresh every visible instance of this action.
   *
   * Called right after Test connection succeeds so the Stream Deck key flips
   * from its "Add session key" placeholder to the live gauge within a second,
   * instead of waiting up to `pollMinutes` for the next scheduled poll.
   *
   * Takes optional `auth` credentials so we can bypass global-settings storage.
   * This matters because `setGlobalSettings` doesn't fully round-trip before
   * the next `getGlobalSettings` returns — on macOS the write goes over a
   * websocket to the SD host app and through Keychain, so a read immediately
   * after a write can see stale (empty) data. Passing the credentials straight
   * through avoids the race.
   *
   * Also folds in `preferredAction` (the action tied to the PI that triggered
   * this) so we always refresh *something* even if `this.actions` happens to
   * return empty (rare, but has been observed when the PI is opened before
   * the action's own willAppear has completed).
   */
  private async refreshAllVisibleActions(
    auth?: { sessionKey: string; organizationId?: string },
    preferredAction?: KeyAction<ActionSettings>,
  ): Promise<void> {
    const all = new Set<KeyAction<ActionSettings>>();
    for (const a of this.actions) {
      if (a.isKey()) all.add(a);
    }
    if (preferredAction) all.add(preferredAction);

    streamDeck.logger.info(
      `Force-refreshing ${all.size} visible action(s) (preferred=${preferredAction?.id ?? "none"}, hasAuth=${!!auth}).`,
    );

    await Promise.all(
      Array.from(all).map((a) =>
        this.refreshAction(a, undefined, auth).catch((err) =>
          streamDeck.logger.error("Forced refresh failed", err),
        ),
      ),
    );
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
      const { organizations, recommendedOrgId } =
        await testSessionKey(validated);
      streamDeck.logger.info(
        `Found ${organizations.length} organization(s). Recommended: ${recommendedOrgId}`,
      );

      // Persist globally so every button on every Stream Deck profile picks it up.
      // Auto-select the subscription-bearing org (not necessarily the first one
      // — for multi-org accounts, orgs[0] is often the user's empty personal org).
      const existing =
        await streamDeck.settings.getGlobalSettings<GlobalSettings>();
      await streamDeck.settings.setGlobalSettings({
        ...existing,
        sessionKey: validated,
        organizationId: recommendedOrgId ?? existing.organizationId,
      });

      // Immediate confirmation back to the PI — don't wait for the forced
      // refresh below, which may take a beat on slow connections.
      await (pi as any)?.sendToPropertyInspector({
        event: "testConnection",
        ok: true,
        organizations,
        recommendedOrgId,
      });

      // Force-refresh every visible action instance so the Stream Deck key
      // itself reflects the live numbers within ~1s, instead of waiting for
      // the next scheduled poll (up to `pollMinutes` away).
      //
      // Pass the just-validated credentials directly — do NOT rely on the
      // refresh re-reading them from global settings, because on macOS the
      // setGlobalSettings write above may not have committed yet when the
      // refresh starts (websocket + Keychain round-trip).
      //
      // Also surface the PI's own action explicitly so we always refresh at
      // least that one, even in edge cases where `this.actions` hasn't yet
      // been populated with it.
      const preferred = ev.action.isKey()
        ? (ev.action as KeyAction<ActionSettings>)
        : undefined;
      this.refreshAllVisibleActions(
        { sessionKey: validated, organizationId: recommendedOrgId },
        preferred,
      ).catch((err) =>
        streamDeck.logger.error("Post-connect refresh failed", err),
      );
    } catch (err) {
      streamDeck.logger.error("Test connection failed", err);
      await (pi as any)?.sendToPropertyInspector({
        event: "testConnection",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Fetch the latest usage and render it onto the given action.
   *
   * - If `settings` is omitted we fetch it from the SDK — that's what the
   *   forced refresh path (post-Test-connection) uses, because we don't have
   *   an event object to hand us the current per-action settings.
   * - If `auth` is provided, we use those credentials directly instead of
   *   reading `getGlobalSettings()`. This avoids a setGlobalSettings →
   *   getGlobalSettings round-trip race on macOS where the write hasn't
   *   committed by the time we read. The Test connection flow always passes
   *   `auth` so the forced refresh renders real numbers immediately.
   */
  private async refreshAction(
    actionInstance: KeyAction<ActionSettings>,
    settings?: ActionSettings,
    auth?: { sessionKey: string; organizationId?: string },
  ): Promise<void> {
    let sessionKey: string | undefined;
    let organizationId: string | undefined;
    if (auth) {
      sessionKey = auth.sessionKey;
      organizationId = auth.organizationId;
      streamDeck.logger.info(
        `refreshAction: id=${actionInstance.id} using provided auth, orgId=${organizationId ?? "<auto>"}`,
      );
    } else {
      const global =
        await streamDeck.settings.getGlobalSettings<GlobalSettings>();
      sessionKey = global.sessionKey;
      organizationId = global.organizationId;
      streamDeck.logger.info(
        `refreshAction: id=${actionInstance.id} using global settings, hasKey=${!!sessionKey} orgId=${organizationId ?? "<auto>"}`,
      );
    }

    if (!sessionKey) {
      await actionInstance.setTitle("Add\nsession\nkey");
      await actionInstance.setImage(undefined);
      return;
    }

    try {
      const { usage, organizationId: resolvedOrgId } = await fetchUsage({
        sessionKey,
        organizationId,
      });

      // Persist any newly-discovered org ID, but only when we weren't using an
      // `auth` override — when we were, onSendToPlugin already wrote it.
      if (!auth && resolvedOrgId !== organizationId) {
        const global =
          await streamDeck.settings.getGlobalSettings<GlobalSettings>();
        await streamDeck.settings.setGlobalSettings({
          ...global,
          organizationId: resolvedOrgId,
        });
      }

      this.lastUsage.set(actionInstance.id, usage);

      const effectiveSettings =
        settings ?? (await actionInstance.getSettings<ActionSettings>());
      await this.render(actionInstance, effectiveSettings, usage);
    } catch (err) {
      streamDeck.logger.error("Failed to fetch usage", err);

      const message = err instanceof Error ? err.message : "Error";
      const short = message.toLowerCase().includes("unauthor")
        ? "Session\nexpired"
        : "Error";

      await actionInstance.setTitle(short);
      await actionInstance.setImage(undefined);
    }
  }

  private async render(
    actionInstance: KeyAction<ActionSettings>,
    settings: ActionSettings,
    data: UsageData,
  ): Promise<void> {
    const display = settings.display ?? "both";
    const label = settings.label?.trim() || undefined;

    const svg = renderUsageImage({ data, display, label });
    await actionInstance.setImage(`data:image/svg+xml;base64,${svg}`);

    // Clear the fallback title so the custom icon is the source of truth.
    await actionInstance.setTitle("");
  }
}
