/**
 * Session key validation — mirrors the checks in the mature macOS app's
 * SessionKeyValidator (Shared/Utilities/SessionKeyValidator.swift).
 *
 * The claude.ai session key is the value of the `sessionKey` cookie at
 * https://claude.ai. It looks like `sk-ant-sid01-XXXXXX...XXXXXX` and is
 * typically 50-400 characters of [A-Za-z0-9_-].
 *
 * We do *not* verify the key against Claude here — that happens via the
 * "Test connection" button in the Property Inspector, which calls
 * `/organizations`. This function only catches obvious paste mistakes early
 * (empty, wrong prefix, pasted a whole Cookie header, etc.) so users get
 * a clear error before we hit the network.
 */

const REQUIRED_PREFIX = "sk-ant-";
const MIN_LENGTH = 20;
const MAX_LENGTH = 500;
const ALLOWED = /^[A-Za-z0-9_-]+$/;

export class SessionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionKeyError";
  }
}

export function validateSessionKey(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new SessionKeyError("Session key is empty.");
  }

  // Common footgun: pasting the full `Cookie:` header or `sessionKey=...` form.
  if (trimmed.toLowerCase().includes("sessionkey=")) {
    const match = /sessionkey\s*=\s*([^;\s]+)/i.exec(trimmed);
    if (match) {
      return validateSessionKey(match[1]);
    }
  }

  if (trimmed.length < MIN_LENGTH) {
    throw new SessionKeyError(
      `Session key looks too short (${trimmed.length} chars). Make sure you copied the whole cookie value.`,
    );
  }

  if (trimmed.length > MAX_LENGTH) {
    throw new SessionKeyError(
      `Session key looks too long (${trimmed.length} chars). Did you paste more than just the cookie value?`,
    );
  }

  if (/\s/.test(trimmed)) {
    throw new SessionKeyError("Session key contains whitespace. Remove any spaces or line breaks.");
  }

  if (!trimmed.startsWith(REQUIRED_PREFIX)) {
    throw new SessionKeyError(
      `Session key should start with "${REQUIRED_PREFIX}". You may have copied the wrong cookie.`,
    );
  }

  if (!ALLOWED.test(trimmed)) {
    throw new SessionKeyError(
      "Session key contains unexpected characters. Re-copy the `sessionKey` cookie value from your browser.",
    );
  }

  return trimmed;
}
