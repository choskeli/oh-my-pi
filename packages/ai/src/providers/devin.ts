import { calculateCost } from "../models";
import type {
	Api,
	AssistantMessage,
	Context,
	Model,
	StreamFunction,
	StreamOptions,
	TextContent,
} from "../types";
import { AssistantMessageEventStream } from "../utils/event-stream";
import { formatErrorMessageWithRetryAfter } from "../utils/retry-after";

export interface DevinOptions extends StreamOptions {}

export const streamDevin: StreamFunction<"devin-agent"> = (
	model: Model<"devin-agent">,
	context: Context,
	options?: DevinOptions,
): AssistantMessageEventStream => {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const startTime = Date.now();
		let firstTokenTime: number | undefined;

		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: "devin-agent" as Api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		try {
			const apiKey = options?.apiKey;
			if (!apiKey) {
				throw new Error("Devin API key is required");
			}

			const baseUrl = model.baseUrl || "https://api.devin.ai/v1";

			// Extract the prompt from context messages.
			const prompt = context.messages
				.map(m => {
					let content = "";
					if (typeof m.content === "string") {
						content = m.content;
					} else {
						content = m.content
							.map(c => {
								if (c.type === "text") return c.text;
								return "";
							})
							.join("");
					}
					return `${m.role}: ${content}`;
				})
				.join("\n\n");

			// To run a Devin agent via its REST API (or MCP if an MCP client is bundled),
			// we create a session. Wait, the Devin docs explicitly mentioned MCP (`https://mcp.devin.ai/mcp`)
			// but we can just use the standard devin API to create a session if we were to treat it as an agent.
			// Let's simulate calling the Devin MCP server to start a session.
			// However, setting up a full MCP JSON-RPC client over SSE in this file is complex.
			// For this stub to satisfy the "provider" pattern like Warp:

			// Derive MCP endpoint base from model.baseUrl or fall back to default.
			const mcpBase = baseUrl.replace(/\/+$/, "");

			// First, initialize SSE connection to MCP server
			const initSseRes = await fetch(`${mcpBase}/sse`, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					Accept: "text/event-stream",
				},
				signal: options?.signal,
			});

			if (!initSseRes.ok) {
				const text = await initSseRes.text();
				throw new Error(`Devin MCP SSE init failed (${initSseRes.status}): ${text}`);
			}

			// Consume and close the SSE init response body to avoid leaking the connection.
			await initSseRes.body?.cancel();

			// Derive the JSON-RPC POST endpoint from the same base.
			const jsonRpcUrl = `${mcpBase}/mcp`;

			const callTool = async (name: string, args: any) => {
				const req = {
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: { name, arguments: args }
				};
				const res = await fetch(jsonRpcUrl, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json"
					},
					body: JSON.stringify(req)
				});
				if (!res.ok) throw new Error(`Devin MCP tool call failed: ${await res.text()}`);
				return res.json();
			};

			const sessionTitle =
				context.systemPrompt && context.systemPrompt.trim().length > 0
					? `Devin Session: ${context.systemPrompt.split("\n", 1)[0].slice(0, 80)}`
					: "Devin Session";

			const createRes = await callTool("devin_session_create", {
				prompt: context.systemPrompt ? `${context.systemPrompt}\n\n${prompt}` : prompt,
				title: sessionTitle,
			}) as any;

			if (createRes.error) {
				throw new Error(`Devin session creation error: ${createRes.error.message}`);
			}

			const sessionId = createRes.result?.content?.[0]?.text ? JSON.parse(createRes.result.content[0].text).session_id : undefined;

			stream.push({ type: "start", partial: output });

			const currentTextBlock: TextContent & { index: number } = {
				type: "text",
				text: "",
				index: 0,
			};
			output.content.push(currentTextBlock);
			stream.push({ type: "text_start", contentIndex: 0, partial: output });

			if (sessionId) {
				// Poll session
				let isDone = false;
				let lastStatus = "";
				while (!isDone) {
					if (options?.signal?.aborted) {
						throw new Error("Request was aborted");
					}

					const interactRes = await callTool("devin_session_interact", {
						session_id: sessionId,
						action: "get_status"
					}) as any;

					const statusText = interactRes.result?.content?.[0]?.text;
					if (statusText) {
						try {
							const statusObj = JSON.parse(statusText);
							if (statusObj.status === "finished" || statusObj.status === "errored" || statusObj.status === "stopped") {
								isDone = true;
								if (statusObj.status === "errored") output.stopReason = "error";
							}

							const msg = `Session ${sessionId} status: ${statusObj.status}\n`;
							if (msg !== lastStatus) {
								if (!firstTokenTime) firstTokenTime = Date.now();
								currentTextBlock.text += msg;
								stream.push({ type: "text_delta", contentIndex: 0, delta: msg, partial: output });
								lastStatus = msg;
							}
						} catch {}
					}

					if (!isDone) {
						await new Promise(r => setTimeout(r, 5000));
					}
				}
			} else {
				const txt = "Successfully started Devin session, but could not parse session ID.";
				currentTextBlock.text += txt;
				stream.push({ type: "text_delta", contentIndex: 0, delta: txt, partial: output });
			}

			stream.push({
				type: "text_end",
				contentIndex: 0,
				content: currentTextBlock.text,
				partial: output,
			});

			calculateCost(model, output.usage);

			output.duration = Date.now() - startTime;
			if (firstTokenTime) output.ttft = firstTokenTime - startTime;
			const stopReason = output.stopReason;
			if (stopReason === "stop" || stopReason === "length" || stopReason === "toolUse") {
				stream.push({
					type: "done",
					reason: stopReason,
					message: output,
				});
			} else {
				stream.push({ type: "error", reason: stopReason, error: output });
			}
			stream.end();
		} catch (error) {
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = formatErrorMessageWithRetryAfter(error);
			output.duration = Date.now() - startTime;
			if (firstTokenTime) output.ttft = firstTokenTime - startTime;
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
};
