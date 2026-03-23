/**
 * Warp login flow.
 *
 * Warp Oz uses an API key from the platform settings page.
 * This is an API key flow:
 * 1. Open browser to Warp settings (or just prompt for it)
 * 2. User copies API key
 * 3. User pastes key into CLI
 */

import type { OAuthController } from "./types";

const AUTH_URL = "https://docs.warp.dev/agent-platform/cloud-agents/team-access-billing-and-identity";

/**
 * Login to Warp.
 *
 * Prompts user to paste their API key.
 * Returns the API key directly.
 */
export async function loginWarp(options: OAuthController): Promise<string> {
	if (!options.onPrompt) {
		throw new Error("Warp login requires onPrompt callback");
	}

	options.onAuth?.({
		url: AUTH_URL,
		instructions: "Copy your Warp team API key from the Settings > Platform page.",
	});

	const apiKey = await options.onPrompt({
		message: "Paste your Warp team API key",
		placeholder: "sk-...",
	});

	if (options.signal?.aborted) {
		throw new Error("Login cancelled");
	}

	const trimmed = apiKey.trim();
	if (!trimmed) {
		throw new Error("API key is required");
	}

	return trimmed;
}
