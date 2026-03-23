import type { ModelManagerOptions } from "../model-manager";

export interface WarpModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}

export function warpModelManagerOptions(config?: WarpModelManagerConfig): ModelManagerOptions<"warp-agent"> {
	const baseUrl = config?.baseUrl ?? "https://app.warp.dev/api/v1";
	return {
		providerId: "warp",
		fetchDynamicModels: async () => [
			{
				id: "warp-agent",
				name: "Warp Oz Agent",
				api: "warp-agent",
				provider: "warp",
				baseUrl,
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 8192,
			},
		],
	};
}
