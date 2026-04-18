import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { ClaudeUsageAction } from "./actions/claude-usage";

// Logging — change to DEBUG while developing, INFO for release.
streamDeck.logger.setLevel(LogLevel.DEBUG);

// Register the action.
streamDeck.actions.registerAction(new ClaudeUsageAction());

// Connect to Stream Deck.
streamDeck.connect();
