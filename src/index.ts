import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { images } from "@db/schema.js";
import { createLogger } from "@log/index.js";
import { type ModelMessage, stepCountIs, streamText, type UserContent } from "ai";
import dedent from "dedent";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import {
	abandonChecklist,
	type ChecklistErrorStatus,
	ChecklistStateError,
	completeChecklistTask,
	formatChecklistForPrompt,
	getSessionChecklist,
	resetChecklist,
	skipChecklistTask,
} from "./ai/checklists/persistence.js";
import { createContext } from "./ai/context/create-context.js";
import { getSessionMessages, persistChatTurn } from "./ai/session/persistence.js";
import { prepareSession } from "./ai/session/prepare-session.js";
import { findRelevantContent } from "./ai/tools/find-relevant-content.js";
import type { PageImageToolOutput } from "./ai/tools/get-image.js";
import { createTools } from "./ai/tools/index.js";
import { validate } from "./ai/validation/validate.js";
import { transcriptionRoutes } from "./transcription/routes.js";

const app = new Hono({});
const log = createLogger("api");
const chatLog = createLogger("api:chat");
const ragLog = createLogger("api:rag");
const sessionLog = createLogger("api:session");
const checklistLog = createLogger("api:checklist");

type SelectableDatabase = Pick<ReturnType<typeof createContext>["db"], "select">;

function normalizeBase64Image(imageBase64: string) {
	const dataUrlMatch = imageBase64.match(/^data:(?<mediaType>[^;]+);base64,(?<data>.+)$/);

	return {
		data: dataUrlMatch?.groups?.data ?? imageBase64,
		mediaType: dataUrlMatch?.groups?.mediaType,
	};
}

function jsonSafe(value: unknown) {
	if (value === undefined) return undefined;

	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return String(value);
	}
}

function withoutUndefined(metadata: Record<string, unknown>) {
	return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));
}

function summarizeToolCalls(toolCalls: readonly unknown[]) {
	return toolCalls.map((toolCall) => {
		if (typeof toolCall !== "object" || toolCall === null) {
			return { value: String(toolCall) };
		}

		const record = toolCall as Record<string, unknown>;

		return withoutUndefined({
			toolCallId: record.toolCallId,
			toolName: record.toolName,
			input: jsonSafe(record.input ?? record.args),
		});
	});
}

function summarizeToolOutput(output: unknown) {
	if (Array.isArray(output)) return { type: "array", items: output.length };
	if (output === null) return { type: "null" };
	if (typeof output !== "object") return { type: typeof output };

	return {
		type: "object",
		keys: Object.keys(output).slice(0, 10),
	};
}

function createStreamHeartbeat(sessionId: string) {
	const trace = {
		startedAt: performance.now(),
		lastEvent: "stream-created",
		stepNumber: undefined as number | undefined,
		chunks: 0,
		textChars: 0,
		reasoningChars: 0,
		toolCalls: 0,
		toolExecutions: 0,
	};
	let timer: ReturnType<typeof setInterval> | undefined;

	const elapsedMs = () => Math.round(performance.now() - trace.startedAt);

	return {
		start: () => {
			if (timer) return;

			timer = setInterval(() => {
				chatLog.info("AI stream heartbeat", {
					sessionId,
					elapsedMs: elapsedMs(),
					lastEvent: trace.lastEvent,
					stepNumber: trace.stepNumber,
					chunks: trace.chunks,
					textChars: trace.textChars,
					reasoningChars: trace.reasoningChars,
					toolCalls: trace.toolCalls,
					toolExecutions: trace.toolExecutions,
				});
			}, 5000);
		},
		stop: () => {
			if (!timer) return;

			clearInterval(timer);
			timer = undefined;
		},
		mark: (lastEvent: string) => {
			trace.lastEvent = lastEvent;
		},
		stepStarted: (stepNumber: number) => {
			trace.lastEvent = "step-start";
			trace.stepNumber = stepNumber;
		},
		chunkReceived: () => {
			trace.chunks += 1;
		},
		textDelta: (chars: number) => {
			trace.lastEvent = "text-delta";
			trace.textChars += chars;
		},
		reasoningDelta: (chars: number) => {
			trace.lastEvent = "reasoning-delta";
			trace.reasoningChars += chars;
		},
		toolCallEmitted: () => {
			trace.lastEvent = "tool-call";
			trace.toolCalls += 1;
		},
		toolExecutionStarted: () => {
			trace.lastEvent = "tool-start";
			trace.toolExecutions += 1;
		},
		elapsedMs,
	};
}

function isPageImageToolOutput(output: unknown): output is PageImageToolOutput {
	return (
		typeof output === "object" &&
		output !== null &&
		"documentId" in output &&
		"imageId" in output &&
		"pageNumber" in output &&
		"filename" in output &&
		"mediaType" in output &&
		typeof output.documentId === "string" &&
		typeof output.imageId === "string" &&
		typeof output.pageNumber === "number" &&
		typeof output.filename === "string" &&
		output.mediaType === "image/png"
	);
}

async function attachRequestedPageImages(
	db: SelectableDatabase,
	messages: ModelMessage[],
	steps: Array<{ toolResults: Array<{ toolName: string; output: unknown }> }>,
	attachedPageImageKeys: Set<string>,
) {
	const requestedPages: PageImageToolOutput[] = [];

	for (const result of steps.flatMap((step) => step.toolResults)) {
		if (result.toolName === "getImage" && isPageImageToolOutput(result.output)) {
			requestedPages.push(result.output);
		}
	}

	if (requestedPages.length === 0) return;

	const seen = new Set<string>();
	const imageMessages: ModelMessage[] = [];

	for (const page of requestedPages) {
		const key = page.imageId;
		if (seen.has(key) || attachedPageImageKeys.has(key)) continue;

		const [pageImage] = await db
			.select({
				data: images.data,
				mimetype: images.mimetype,
			})
			.from(images)
			.where(eq(images.id, page.imageId))
			.limit(1);

		if (!pageImage) throw new Error(`Manual page image ${page.imageId} was not found in the database.`);
		if (pageImage.mimetype !== page.mediaType) {
			throw new Error(`Manual page image ${page.imageId} has unexpected type ${pageImage.mimetype}.`);
		}

		seen.add(key);
		attachedPageImageKeys.add(key);

		imageMessages.push({
			role: "user",
			content: [
				{
					type: "text",
					text: `Attached rendered Epson TP3 manual page ${page.pageNumber} requested by getImage from the database. Inspect this image visually before answering if the question depends on layout, diagrams, screenshots, button labels, or screen contents.`,
				},
				{ type: "image", image: pageImage.data, mediaType: page.mediaType },
			],
		});
	}

	return imageMessages.length > 0 ? [...messages, ...imageMessages] : undefined;
}

const systemPrompt = dedent(`
  You are a local multimodal assistant for guided Epson robot operation.

  You help an operator use the EPSON T6-B602S robot with the Epson TP3 teach pendant.

  Core rule:
  - If the operator asks and the answer is simple, answer it.
  - If the operator asks and the answer is a multi-step robot/TP3 procedure, start a backend-owned guided procedure.

  Retrieval:
  - For robot operation, TP3 usage, coordinate movement, setup, errors, safety, or procedures, call getInformation first.
  - If retrieved context is missing, weak, or unrelated, say that clearly or ask one focused clarification question.

  Guided procedure decision:
  - A guided procedure is required whenever the answer would contain two or more ordered operator actions.
  - This includes requests such as moving to a coordinate, teaching/recording a point, jogging the robot, setup, calibration, configuration, or "what should I do next" when no active guided procedure exists.
  - Simple definitions, button explanations, one-step answers do not need a guided procedure.

  Guided procedure flow:
  1. First gather needed manual context with getInformation.
  2. After receiving the retrieved manual context, decide whether the answer requires two or more ordered operator actions.
  3. If it is multi-step, do not output the procedure as text, bullets, numbered actions, or operator instructions.
  4. If it is multi-step, only call startGuidedProcedure with operatorActions grounded in the retrieved context.
  5. After startGuidedProcedure succeeds, only tell the operator that the guided procedure was started and state the current first action.

  Post-retrieval rule:
  - After getInformation returns, if the operator is asking how to do a robot/TP3 operation and the retrieved context contains multiple ordered actions, your next assistant action must be startGuidedProcedure.
  - In that case, do not produce natural-language procedure text before calling startGuidedProcedure.

  Active guided procedure:
  - If an active guided procedure exists, use it as the source of task state.
  - Do not advance, skip, reset, or complete actions in text. The backend/UI owns progression.

  Answer style:
  - Be concise, grounded, and operational.
  - Mention uncertainty when it affects safety or correctness.

  # IMPORTANT!!!
  - If your final answer would describe a multi-action procedure, do not write that procedure in text. Call startGuidedProcedure instead.`);

app.use(async (c, next) => {
	const path = new URL(c.req.url).pathname;
	const method = c.req.method;
	const timer = log.timer();

	if (path !== "/health") log.info("Request started", { method, path });

	try {
		await next();

		if (path !== "/health") {
			timer.done("Request completed", { method, path, status: c.res.status });
		}
	} catch (error) {
		if (path !== "/health") {
			timer.fail("Request failed", {
				method,
				path,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		throw error;
	}
});

app.get("/", serveStatic({ root: "./public", path: "index.html" }));

app.get("/health", (c) => {
	return c.json({ status: "ok" });
});

app.route("/api/transcriptions", transcriptionRoutes);

app.get("/api/sessions/:session/messages", async (c) => {
	const sessionId = c.req.param("session").trim();

	if (!sessionId) {
		sessionLog.warn("Session messages requested without session id");
		return c.json({ error: "Session is required." }, 400);
	}

	const ctx = createContext();

	if (ctx.error) {
		const { message, status } = ctx.error;
		sessionLog.error("Context creation failed", { status, message });
		return c.json({ error: message }, status);
	}

	try {
		const sessionMessages = await getSessionMessages(ctx.db, sessionId);
		sessionLog.info("Session messages loaded", { sessionId, messages: sessionMessages.length });

		return c.json({
			session: sessionId,
			messages: sessionMessages.map((message) => ({
				...message,
				createdAt: message.createdAt?.toISOString() ?? null,
			})),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sessionLog.error("Failed to load session messages", error instanceof Error ? error : new Error(String(error)));
		return c.json({ error: message }, 500);
	}
});

function checklistError(error: unknown): { message: string; status: ChecklistErrorStatus } {
	if (error instanceof ChecklistStateError) {
		return { message: error.message, status: error.status };
	}

	return {
		message: error instanceof Error ? error.message : String(error),
		status: 500,
	};
}

app.get("/api/sessions/:session/checklist", async (c) => {
	const sessionId = c.req.param("session").trim();

	if (!sessionId) {
		checklistLog.warn("Checklist requested without session id");
		return c.json({ error: "Session is required." }, 400);
	}

	const ctx = createContext();

	if (ctx.error) {
		const { message, status } = ctx.error;
		checklistLog.error("Context creation failed", { status, message });
		return c.json({ error: message }, status);
	}

	try {
		const checklist = await getSessionChecklist(ctx.db, sessionId);
		checklistLog.info("Checklist loaded", { sessionId, checklistId: checklist?.id });
		return c.json({ session: sessionId, checklist });
	} catch (error) {
		const { message, status } = checklistError(error);
		checklistLog.error("Checklist load failed", error instanceof Error ? error : new Error(String(error)));
		return c.json({ error: message }, status);
	}
});

app.post("/api/sessions/:session/checklist/tasks/:task/complete", async (c) => {
	const sessionId = c.req.param("session").trim();
	const taskId = c.req.param("task").trim();

	if (!sessionId || !taskId) {
		return c.json({ error: "Session and task are required." }, 400);
	}

	const ctx = createContext();

	if (ctx.error) {
		const { message, status } = ctx.error;
		checklistLog.error("Context creation failed", { status, message });
		return c.json({ error: message }, status);
	}

	try {
		const checklist = await completeChecklistTask(ctx.db, sessionId, taskId);
		checklistLog.success("Checklist task completed", { sessionId, taskId, checklistId: checklist?.id });
		return c.json({ session: sessionId, checklist });
	} catch (error) {
		const { message, status } = checklistError(error);
		checklistLog.error("Checklist complete failed", error instanceof Error ? error : new Error(String(error)));
		return c.json({ error: message }, status);
	}
});

app.post("/api/sessions/:session/checklist/tasks/:task/skip", async (c) => {
	const sessionId = c.req.param("session").trim();
	const taskId = c.req.param("task").trim();

	if (!sessionId || !taskId) {
		return c.json({ error: "Session and task are required." }, 400);
	}

	const ctx = createContext();

	if (ctx.error) {
		const { message, status } = ctx.error;
		checklistLog.error("Context creation failed", { status, message });
		return c.json({ error: message }, status);
	}

	try {
		const checklist = await skipChecklistTask(ctx.db, sessionId, taskId);
		checklistLog.success("Checklist task skipped", { sessionId, taskId, checklistId: checklist?.id });
		return c.json({ session: sessionId, checklist });
	} catch (error) {
		const { message, status } = checklistError(error);
		checklistLog.error("Checklist skip failed", error instanceof Error ? error : new Error(String(error)));
		return c.json({ error: message }, status);
	}
});

app.post("/api/sessions/:session/checklist/reset", async (c) => {
	const sessionId = c.req.param("session").trim();

	if (!sessionId) {
		return c.json({ error: "Session is required." }, 400);
	}

	const ctx = createContext();

	if (ctx.error) {
		const { message, status } = ctx.error;
		checklistLog.error("Context creation failed", { status, message });
		return c.json({ error: message }, status);
	}

	try {
		const checklist = await resetChecklist(ctx.db, sessionId);
		checklistLog.success("Checklist reset", { sessionId, checklistId: checklist?.id });
		return c.json({ session: sessionId, checklist });
	} catch (error) {
		const { message, status } = checklistError(error);
		checklistLog.error("Checklist reset failed", error instanceof Error ? error : new Error(String(error)));
		return c.json({ error: message }, status);
	}
});

app.post("/api/sessions/:session/checklist/abandon", async (c) => {
	const sessionId = c.req.param("session").trim();

	if (!sessionId) {
		return c.json({ error: "Session is required." }, 400);
	}

	const ctx = createContext();

	if (ctx.error) {
		const { message, status } = ctx.error;
		checklistLog.error("Context creation failed", { status, message });
		return c.json({ error: message }, status);
	}

	try {
		const checklist = await abandonChecklist(ctx.db, sessionId);
		checklistLog.success("Checklist abandoned", { sessionId });
		return c.json({ session: sessionId, checklist });
	} catch (error) {
		const { message, status } = checklistError(error);
		checklistLog.error("Checklist abandon failed", error instanceof Error ? error : new Error(String(error)));
		return c.json({ error: message }, status);
	}
});

app.post("/api/ai/chat", async ({ req }) => {
	let rawBody: unknown;

	try {
		rawBody = await req.json();
	} catch (e) {
		chatLog.warn("Invalid JSON body", e instanceof Error ? e : new Error(String(e)));
		return new Response(`Bad request: ${e}`, { status: 401 });
	}

	const { data, error } = validate(rawBody);

	if (error) {
		const { message, status } = error;
		chatLog.warn("Request validation failed", { status, message });
		return new Response(`Bad request: ${message}`, { status });
	}

	chatLog.info("Chat request accepted", { messageLength: data.message.length });

	const ctx = createContext();

	if (ctx.error) {
		const { message, status } = ctx.error;
		chatLog.error("Context creation failed", { status, message });
		return new Response(`Bad request: ${message}`, { status });
	}

	const preparedSession = await prepareSession(ctx, data);

	if (preparedSession.error) {
		const { message, status } = preparedSession.error;
		chatLog.error("Session preparation failed", { status, message });
		return new Response(`Bad request: ${message}`, { status });
	}

	chatLog.debug("Session prepared", {
		sessionId: preparedSession.data.sessionId,
		previousMessages: preparedSession.data.prevMessages.length,
	});

	const provider = createOpenAICompatible({
		name: ctx.data.providerName,
		baseURL: ctx.data.baseURL,
		apiKey: process.env.AI_API_KEY,
		includeUsage: true,
	});

	const userContent: Extract<UserContent, unknown[]> = [{ type: "text", text: data.message }];
	let imageMediaType: string | undefined;

	if (data.imageBase64) {
		const image = normalizeBase64Image(data.imageBase64);
		imageMediaType = data.imageMediaType ?? image.mediaType;

		userContent.push({
			type: "image",
			image: image.data,
			mediaType: imageMediaType,
		});
	}

	const currentUserMessage: ModelMessage = { role: "user", content: userContent };
	const attachedPageImageKeys = new Set<string>();
	const heartbeat = createStreamHeartbeat(preparedSession.data.sessionId);
	const sessionChecklist = await getSessionChecklist(ctx.db, preparedSession.data.sessionId);
	const sessionTools = createTools({ db: ctx.db, sessionId: preparedSession.data.sessionId });

	const result = streamText({
		model: provider(ctx.data.modelId),
		temperature: 0,
		system: `${systemPrompt}\n\n${formatChecklistForPrompt(sessionChecklist)}`,
		messages: [...preparedSession.data.prevMessages, currentUserMessage],
		stopWhen: stepCountIs(10),
		tools: sessionTools,
		prepareStep: async ({ messages, steps }) => {
			const messagesWithImages = await attachRequestedPageImages(ctx.db, messages, steps, attachedPageImageKeys);
			if (!messagesWithImages) return undefined;

			return {
				messages: messagesWithImages,
			};
		},
		experimental_onStart: ({ model, messages, tools }) => {
			heartbeat.mark("started");
			chatLog.info("AI stream started", {
				sessionId: preparedSession.data.sessionId,
				model: `${model.provider}/${model.modelId}`,
				messages: messages?.length,
				tools: tools ? Object.keys(tools).length : 0,
			});
		},
		experimental_onStepStart: ({ stepNumber, messages }) => {
			heartbeat.stepStarted(stepNumber);
			chatLog.info("AI step started", {
				sessionId: preparedSession.data.sessionId,
				stepNumber,
				messages: messages.length,
			});
		},
		onChunk: ({ chunk }) => {
			heartbeat.chunkReceived();

			switch (chunk.type) {
				case "text-delta": {
					heartbeat.textDelta(chunk.text.length);
					chatLog.debug("AI text delta", {
						sessionId: preparedSession.data.sessionId,
						deltaChars: chunk.text.length,
					});
					break;
				}
				case "reasoning-delta": {
					heartbeat.reasoningDelta(chunk.text.length);
					chatLog.debug("AI reasoning delta", {
						sessionId: preparedSession.data.sessionId,
						deltaChars: chunk.text.length,
					});
					break;
				}
				case "tool-input-start": {
					heartbeat.mark("tool-input-start");
					chatLog.info("AI tool input started", {
						sessionId: preparedSession.data.sessionId,
						toolName: chunk.toolName,
					});
					break;
				}
				case "tool-input-delta": {
					heartbeat.mark("tool-input-delta");
					chatLog.debug("AI tool input delta", {
						sessionId: preparedSession.data.sessionId,
						deltaChars: chunk.delta.length,
					});
					break;
				}
				case "tool-call": {
					heartbeat.toolCallEmitted();
					chatLog.info("AI tool call emitted", {
						sessionId: preparedSession.data.sessionId,
						toolName: chunk.toolName,
						input: jsonSafe(chunk.input),
					});
					break;
				}
				case "tool-result": {
					heartbeat.mark("tool-result");
					chatLog.info("AI tool result emitted", {
						sessionId: preparedSession.data.sessionId,
						toolName: chunk.toolName,
						output: summarizeToolOutput(chunk.output),
					});
					break;
				}
				case "source": {
					heartbeat.mark("source");
					chatLog.info("AI source emitted", {
						sessionId: preparedSession.data.sessionId,
						sourceType: chunk.sourceType,
					});
					break;
				}
				case "raw": {
					heartbeat.mark("raw");
					chatLog.debug("AI raw chunk emitted", {
						sessionId: preparedSession.data.sessionId,
					});
					break;
				}
			}
		},
		experimental_onToolCallStart: ({ stepNumber, toolCall }) => {
			heartbeat.toolExecutionStarted();
			chatLog.info("AI tool execution started", {
				sessionId: preparedSession.data.sessionId,
				stepNumber,
				toolName: toolCall.toolName,
				input: jsonSafe(toolCall.input),
			});
		},
		experimental_onToolCallFinish: (event) => {
			heartbeat.mark("tool-finish");

			const context = {
				sessionId: preparedSession.data.sessionId,
				stepNumber: event.stepNumber,
				toolName: event.toolCall.toolName,
				durationMs: Math.round(event.durationMs),
				success: event.success,
			};

			if (event.success) {
				chatLog.success("AI tool execution finished", {
					...context,
					output: summarizeToolOutput(event.output),
				});
				return;
			}

			chatLog.error(
				"AI tool execution failed",
				event.error instanceof Error ? event.error : new Error(String(event.error)),
			);
		},
		onError: ({ error }) => {
			heartbeat.mark("error");
			heartbeat.stop();
			chatLog.error("AI stream error", error instanceof Error ? error : new Error(String(error)));
		},
		onAbort: ({ steps }) => {
			heartbeat.mark("aborted");
			heartbeat.stop();
			chatLog.warn("AI stream aborted", {
				sessionId: preparedSession.data.sessionId,
				steps: steps.length,
				elapsedMs: heartbeat.elapsedMs(),
			});
		},
		onStepFinish: (event) => {
			const { model, finishReason, reasoningText, text, toolCalls, toolResults, usage } = event;
			heartbeat.mark("step-finish");
			log.success("Step finished", {
				sessionId: preparedSession.data.sessionId,
				model,
				finishReason,
				textChars: text.length,
				reasoningChars: reasoningText?.length ?? 0,
				toolCalls: toolCalls.length,
				toolResults: toolResults.length,
				usage,
			});
			log.debug("Step content", { content: event.content });
		},
		onFinish: async ({ content, sources, usage, totalUsage, toolCalls, steps, finishReason, text }) => {
			heartbeat.mark("finish");
			heartbeat.stop();
			log.info("Finish Reason:", { finishReason });
			log.success("Stream finished:", { content, sources, steps, usage });
			log.info("Tool calls:", { toolCalls });
			log.debug("Content:", { content });
			log.debug("Content:", { text });

			try {
				await persistChatTurn(ctx.db, {
					sessionId: preparedSession.data.sessionId,
					userMessage: data.message,
					assistantMessage: text,
					userMetadata: withoutUndefined({
						hasImage: Boolean(data.imageBase64),
						imageMediaType: imageMediaType ?? null,
					}),
					assistantMetadata: withoutUndefined({
						finishReason,
						usage: jsonSafe(usage),
						totalUsage: jsonSafe(totalUsage),
						sources: jsonSafe(sources),
						toolCalls: summarizeToolCalls(toolCalls),
						stepCount: steps.length,
					}),
				});

				chatLog.success("Chat turn persisted", {
					sessionId: preparedSession.data.sessionId,
					assistantMessageLength: text.length,
				});
			} catch (error) {
				chatLog.error("Chat turn persistence failed", error instanceof Error ? error : new Error(String(error)));
			}
		},
	});

	heartbeat.start();
	chatLog.success("Chat stream created", { model: ctx.data.modelId, provider: ctx.data.providerName });

	return result.toUIMessageStreamResponse({
		sendReasoning: true,
	});
});

const ragSearchSchema = z.object({
	query: z.string().trim().min(1),
});

app.post("/api/rag/search", async (c) => {
	const parsed = ragSearchSchema.safeParse(await c.req.json().catch(() => null));

	if (!parsed.success) {
		ragLog.warn("Invalid search request");
		return c.json(
			{
				error: "Invalid request body.",
				expected: { query: "string" },
			},
			400,
		);
	}

	try {
		ragLog.info("Search started", { queryLength: parsed.data.query.length });
		const chunks = await findRelevantContent(parsed.data.query);
		ragLog.success("Search completed", { chunks: chunks.length });
		return c.json({ query: parsed.data.query, chunks });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ragLog.error("Search failed", error instanceof Error ? error : new Error(String(error)));
		return c.json({ error: message }, 500);
	}
});

const config = {
	fetch(req, server) {
		const path = new URL(req.url).pathname;

		if (path === "/api/ai/chat") {
			server.timeout(req, 0);
		}

		return app.fetch(req);
	},
	port: Number(process.env.APP_PORT ?? 3000),
	idleTimeout: 255,
} satisfies Bun.Serve.Options<undefined, never>;

const serve = Bun.serve(config);

const { development, port, url } = serve;

log.success("Server started", { development, port, url });
