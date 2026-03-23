import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_MODEL_PER_PROVIDER, PROVIDER_DESCRIPTORS } from "../src/provider-models/descriptors";
import { warpModelManagerOptions } from "../src/provider-models/warp";
import { getEnvApiKey } from "../src/stream";
import { getOAuthProviders } from "../src/utils/oauth";

const originalWarpApiKey = Bun.env.WARP_API_KEY;

afterEach(() => {
	if (originalWarpApiKey === undefined) {
		delete Bun.env.WARP_API_KEY;
	} else {
		Bun.env.WARP_API_KEY = originalWarpApiKey;
	}
});

describe("warp provider support", () => {
	test("resolves WARP_API_KEY from environment", () => {
		Bun.env.WARP_API_KEY = "warp-test-key";
		expect(getEnvApiKey("warp")).toBe("warp-test-key");
	});

	test("registers built-in descriptor and default model", () => {
		const descriptor = PROVIDER_DESCRIPTORS.find(item => item.providerId === "warp");
		expect(descriptor).toBeDefined();
		expect(descriptor?.defaultModel).toBe("warp-agent");
		expect(descriptor?.catalogDiscovery?.envVars).toContain("WARP_API_KEY");
		expect(DEFAULT_MODEL_PER_PROVIDER.warp).toBe("warp-agent");
	});

	test("registers Warp in OAuth provider selector", () => {
		const provider = getOAuthProviders().find(item => item.id === "warp");
		expect(provider?.name).toBe("Warp");
	});

	test("returns static warp-agent model config", async () => {
		const options = warpModelManagerOptions();
		expect(options.providerId).toBe("warp");
		expect(options.fetchDynamicModels).toBeDefined();

		const models = await options.fetchDynamicModels?.();
		expect(models).toHaveLength(1);
		expect(models?.[0]?.id).toBe("warp-agent");
		expect(models?.[0]?.api).toBe("warp-agent");
		expect(models?.[0]?.baseUrl).toBe("https://app.warp.dev/api/v1");
	});

	test("respects custom baseUrl", async () => {
		const options = warpModelManagerOptions({ baseUrl: "https://custom.warp.example/api/v1" });
		const models = await options.fetchDynamicModels?.();
		expect(models?.[0]?.baseUrl).toBe("https://custom.warp.example/api/v1");
	});
});
