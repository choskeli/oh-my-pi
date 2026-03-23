import type { ModelManagerOptions } from "../model-manager";

export interface DevinModelManagerConfig {
	apiKey?: string;
	baseUrl?: string;
}

export function devinModelManagerOptions(config?: DevinModelManagerConfig): ModelManagerOptions<"devin-agent"> {
	const baseUrl = config?.baseUrl ?? "https://api.devin.ai/v1";
	return {
		providerId: "devin",
		fetchDynamicModels: async () => [
			{
				id: "devin-agent",
				name: "Devin MCP Agent",
				api: "devin-agent",
				provider: "devin",
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
