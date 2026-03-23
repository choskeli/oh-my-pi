import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_MODEL_PER_PROVIDER, PROVIDER_DESCRIPTORS } from "../src/provider-models/descriptors";
import { devinModelManagerOptions } from "../src/provider-models/devin";
import { getEnvApiKey } from "../src/stream";
import { getOAuthProviders } from "../src/utils/oauth";

const originalDevinApiKey = Bun.env.DEVIN_API_KEY;

afterEach(() => {
	if (originalDevinApiKey === undefined) {
		delete Bun.env.DEVIN_API_KEY;
	} else {
		Bun.env.DEVIN_API_KEY = originalDevinApiKey;
	}
});

describe("devin provider support", () => {
	test("resolves DEVIN_API_KEY from environment", () => {
		Bun.env.DEVIN_API_KEY = "devin-test-key";
		expect(getEnvApiKey("devin")).toBe("devin-test-key");
	});

	test("registers built-in descriptor and default model", () => {
		const descriptor = PROVIDER_DESCRIPTORS.find(item => item.providerId === "devin");
		expect(descriptor).toBeDefined();
		expect(descriptor?.defaultModel).toBe("devin-agent");
		expect(descriptor?.catalogDiscovery?.envVars).toContain("DEVIN_API_KEY");
		expect(DEFAULT_MODEL_PER_PROVIDER.devin).toBe("devin-agent");
	});

	test("registers Devin in OAuth provider selector", () => {
		const provider = getOAuthProviders().find(item => item.id === "devin");
		expect(provider?.name).toBe("Devin");
	});

	test("returns static devin-agent model config", async () => {
		const options = devinModelManagerOptions();
		expect(options.providerId).toBe("devin");
		expect(options.fetchDynamicModels).toBeDefined();

		const models = await options.fetchDynamicModels?.();
		expect(models).toHaveLength(1);
		expect(models?.[0]?.id).toBe("devin-agent");
		expect(models?.[0]?.api).toBe("devin-agent");
		expect(models?.[0]?.baseUrl).toBe("https://api.devin.ai/v3");
	});

	test("respects custom baseUrl", async () => {
		const options = devinModelManagerOptions({ baseUrl: "https://custom.devin.example/v1" });
		const models = await options.fetchDynamicModels?.();
		expect(models?.[0]?.baseUrl).toBe("https://custom.devin.example/v1");
	});
});
