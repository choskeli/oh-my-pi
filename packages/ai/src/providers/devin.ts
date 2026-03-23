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

			const title =
				context.systemPrompt && context.systemPrompt.trim().length > 0
					? `Devin Session: ${context.systemPrompt.split("\n", 1)[0].slice(0, 80)}`
					: "Devin Session";

			const createRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/sessions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					prompt: context.systemPrompt ? `${context.systemPrompt}\n\n${prompt}` : prompt,
					title,
				}),
				signal: options?.signal,
			});

			if (!createRes.ok) {
				const text = await createRes.text();
				throw new Error(`Devin API session creation failed (${createRes.status}): ${text}`);
			}

			const sessionData = await createRes.json();
			const sessionId = sessionData?.session_id;

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

					const pollRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/sessions/${sessionId}`, {
						headers: { Authorization: `Bearer ${apiKey}` },
						signal: options?.signal,
					});

					if (!pollRes.ok) {
						const text = await pollRes.text();
						throw new Error(`Devin API polling failed (${pollRes.status}): ${text}`);
					}

					const pollData = await pollRes.json();

					if (pollData) {
						if (
							pollData.status === "finished" ||
							pollData.status === "errored" ||
							pollData.status === "stopped" ||
							pollData.status === "blocked" ||
							pollData.status === "canceled"
						) {
							isDone = true;
							if (pollData.status === "errored") output.stopReason = "error";
							if (pollData.status === "canceled") output.stopReason = "aborted";
						}

						const msg = `Session ${sessionId} status: ${pollData.status}\n`;
						if (msg !== lastStatus) {
							if (!firstTokenTime) firstTokenTime = Date.now();
							currentTextBlock.text += msg;
							stream.push({ type: "text_delta", contentIndex: 0, delta: msg, partial: output });
							lastStatus = msg;
						}
					}

					if (!isDone) {
						await new Promise(r => setTimeout(r, 5000));
					}
				}
			} else {
				const txt = "Successfully requested Devin session, but could not parse session ID.";
				currentTextBlock.text += txt;
				stream.push({ type: "text_delta", contentIndex: 0, delta: txt, partial: output });
			}

			stream.push({
				type: "text_end",
				contentIndex: 0,
				content: currentTextBlock.text,
				partial: output,
			});

			if (model.cost) calculateCost(model, output.usage);

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
