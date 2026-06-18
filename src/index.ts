import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { images } from "@db/schema.js";
import { createLogger } from "@log/index.js";
import { type ModelMessage, stepCountIs, streamText, type UserContent } from "ai";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import { createContext } from "./ai/context/create-context.js";
import { getSessionMessages, persistChatTurn } from "./ai/session/persistence.js";
import { prepareSession } from "./ai/session/prepare-session.js";
import { findRelevantContent } from "./ai/tools/find-relevant-content.js";
import type { PageImageToolOutput } from "./ai/tools/get-image.js";
import { tools } from "./ai/tools/index.js";
import { validate } from "./ai/validation/validate.js";

const app = new Hono({});
const log = createLogger("api");
const chatLog = createLogger("api:chat");
const ragLog = createLogger("api:rag");
const sessionLog = createLogger("api:session");

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

const systemPrompt = `You are a local multimodal assistant for guided Epson robot operation.

Your role is to help an operator use the EPSON T6-B602S robot with the Epson TP3 teach pendant, with short, grounded, task-focused answers.

Use available session context before answering when it is provided.

Retrieval rules:
- Skip retrieval only for simple questions that do not depend on the robot manual, safety, setup, errors, coordinates, TP3 controls, or the current robot task.
- For any robot operation, TP3 usage, coordinate movement, setup, error, procedure, safety, or "what should I do next" question, call getInformation before answering.
- If retrieved context is missing, weak, or unrelated, say that clearly instead of inventing instructions.

Procedure rules:
- Do not invent procedural or safety-critical robot instructions.
- If the operator asks for a task that requires multiple ordered actions, give only a concise grounded plan or the next safe step.
- If required information is missing, ask one focused clarification question.

Answer style:
- Be concise and operational.
- Prefer direct steps over explanation.
- Mention uncertainty when it affects safety or correctness.`;

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

	const result = streamText({
		model: provider(ctx.data.modelId),
		temperature: 0,
		system: systemPrompt,
		messages: [...preparedSession.data.prevMessages, currentUserMessage],
		stopWhen: stepCountIs(4),
		tools,
		prepareStep: async ({ messages, steps }) => {
			const messagesWithImages = await attachRequestedPageImages(ctx.db, messages, steps, attachedPageImageKeys);

			if (!messagesWithImages) return undefined;

			return {
				messages: messagesWithImages,
				activeTools: [],
			};
		},
		onStepFinish: (event) => {
			const { model, content, toolCalls } = event;
			log.success("Step finished", { model, content, toolCalls });
		},
		onFinish: async ({ content, sources, usage, totalUsage, toolCalls, steps, finishReason, text }) => {
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

	chatLog.success("Chat stream created", { model: ctx.data.modelId, provider: ctx.data.providerName });

	return result.toTextStreamResponse();
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
