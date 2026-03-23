/**
 * Devin login flow.
 *
 * Devin uses an API key from the account settings page.
 * This is an API key flow:
 * 1. Open browser to Devin settings (or just prompt for it)
 * 2. User copies API key
 * 3. User pastes key into CLI
 */

import type { OAuthController } from "./types";

const AUTH_URL = "https://docs.devin.ai/";

/**
 * Login to Devin.
 *
 * Prompts user to paste their API key.
 * Returns the API key directly.
 */
export async function loginDevin(options: OAuthController): Promise<string> {
	if (!options.onPrompt) {
		throw new Error("Devin login requires onPrompt callback");
	}

	options.onAuth?.({
		url: AUTH_URL,
		instructions: "Copy your Devin API key from your account settings.",
	});

	const apiKey = await options.onPrompt({
		message: "Paste your Devin API key",
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
