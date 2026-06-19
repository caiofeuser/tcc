import { db } from "@db/index.js";
import { manualChunks } from "@db/schema.js";
import { createLogger } from "@log/index.js";
import { tool } from "ai";
import { cosineDistance, desc, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { generateEmbedding } from "../models/embed.js";

const apiLog = createLogger("api:find-relevant-content");
const toolLog = createLogger("tool:find-relevant-content");

export async function findRelevantContent(input: string) {
	const value = input.replace(/\s+/g, " ").trim();
	const userQueryEmbedded = await generateEmbedding(value);

	const distance = cosineDistance(manualChunks.embedding, userQueryEmbedded.embedding);
	const similarity = sql<number>`1 - (${distance})`;
	apiLog.info("searching for:", { value });

	const chunks = await db
		.select({
			id: manualChunks.id,
			documentId: manualChunks.documentId,
			content: manualChunks.content,
			pageStart: manualChunks.pageStart,
			pageEnd: manualChunks.pageEnd,
			metadata: manualChunks.metadata,
			similarity,
		})
		.from(manualChunks)
		.where(gt(similarity, 0.5))
		.orderBy((t) => desc(t.similarity))
		.limit(5);

	apiLog.success("RAG content selected:", { chunks });

	return chunks.map((chunk) => ({
		id: chunk.id,
		documentId: chunk.documentId,
		source: "Epson TP3 manual for RC700A controller",
		pageRange: chunk.pageStart === chunk.pageEnd ? `p. ${chunk.pageStart}` : `pp. ${chunk.pageStart}-${chunk.pageEnd}`,
		imageId:
			chunk.metadata && "imageId" in chunk.metadata && typeof chunk.metadata.imageId === "string"
				? chunk.metadata.imageId
				: null,
		relevance: Number(chunk.similarity.toFixed(3)),
		excerpt: chunk.content,
	}));
}

export const getInformationTool = tool({
	description: `
    Search the Epson TP3 teach pendant manual for grounded technical information.
    
    Use this tool for questions about Epson robot operation, TP3 controls, coordinate movement, setup, modes, warnings, errors, safety, or multi-step procedures.

    After this tool returns manual context, use that context to decide the response path:
    - For simple one-step or factual questions, answer concisely with grounded citations.
    - For robot/TP3 operations that require two or more ordered operator actions, call startGuidedProcedure next and populate its operatorActions from the retrieved context. Do not write the procedure in text first.
    
    Do not use it for greetings, app meta questions, or questions that can be answered entirely from the current session/task context.
    The result contains manual excerpts with page ranges, relevance scores, and database IDs for related document/page images. Use the excerpts as the source of truth for either answering simple questions or starting a guided procedure.`,
	inputSchema: z.object({
		question: z
			.string()
			.describe(
				"A focused search query for the Epson TP3 manual. Include the relevant robot operation, TP3 screen/control, error, mode, coordinate movement, or safety topic.",
			),
	}),
	execute: async ({ question }) => {
		toolLog.info("RAG tool called", { questionLength: question.length });
		const answer = await findRelevantContent(question);
		toolLog.success("RAG tool called", { answer });

		return {
			manualContext: answer,
			nextActionReminder:
				"If this manual context contains two or more ordered operator actions for a robot/TP3 operation, do not answer with procedure text. Call startGuidedProcedure next and populate operatorActions from the retrieved context.",
		};
	},
});
