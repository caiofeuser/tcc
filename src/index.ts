import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createLogger } from "@log/index.js";
import { stepCountIs, streamText, tool } from "ai";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import { createContext } from "./ai/context/create-context.js";
import { prepareSession } from "./ai/session/prepare-session.js";
import { findRelevantContent } from "./ai/tools/find-relevant-content.js";
import { validate } from "./ai/validation/validate.js";

const app = new Hono({});
const log = createLogger("api");
const chatLog = createLogger("api:chat");
const ragLog = createLogger("api:rag");

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

	try {
		await prepareSession(ctx, data);
		chatLog.debug("Session prepared");
	} catch (err) {
		const message = err instanceof Error ? err : new Error(String(err));
		chatLog.error("Session preparation failed", message);
		return new Response(`Bad request: ${message}`, { status: 500 });
	}

	const provider = createOpenAICompatible({
		name: ctx.data.providerName,
		baseURL: ctx.data.baseURL,
		apiKey: process.env.AI_API_KEY,
		includeUsage: true,
	});

	const result = streamText({
		model: provider(ctx.data.modelId),
		temperature: 0,
		system: systemPrompt,
		prompt: data.message,
		stopWhen: stepCountIs(3),
		tools: {
			getInformation: tool({
				description: `
        Search the Epson TP3 teach pendant manual for grounded technical information.
        
        Use this tool for questions about Epson robot operation, TP3 controls, coordinate movement, setup, modes, warnings, errors, safety, or multi-step procedures.
        
        Do not use it for greetings, app meta questions, or questions that can be answered entirely from the current session/task context.
        The result contains manual excerpts with page ranges and relevance scores. Use the excerpts as the source of truth and cite page numbers when answering.`,
				inputSchema: z.object({
					question: z
						.string()
						.describe(
							"A focused search query for the Epson TP3 manual. Include the relevant robot operation, TP3 screen/control, error, mode, coordinate movement, or safety topic.",
						),
				}),
				execute: async ({ question }) => {
					chatLog.info("RAG tool called", { questionLength: question.length });
					const answer = await findRelevantContent(question);
					chatLog.success("RAG tool called", { answer });
					return answer;
				},
			}),
		},
		onStepFinish: (event) => {
			const { model, content, toolCalls } = event;
			log.success("Step finished", { model, content, toolCalls });
		},
		onFinish: ({ content, sources, usage, toolCalls, steps, finishReason, text }) => {
			log.info("Finish Reason:", { finishReason });
			log.success("Stream finished:", { content, sources, steps, usage });
			log.info("Tool calls:", { toolCalls });
			log.debug("Content:", { content });
			log.debug("Content:", { text });
			// const result = await ctx.db.insert()
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
	fetch: app.fetch,
	port: Number(process.env.APP_PORT ?? 3000),
	idleTimeout: 200,
} satisfies Bun.Serve.Options<undefined, never>;

const serve = Bun.serve(config);

const { development, port, url } = serve;

log.success("Server started", { development, port, url });
