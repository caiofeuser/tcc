import { db } from "@db/index.js";
import { manualChunks } from "@db/schema.js";
import { createLogger } from "@log/index.js";
import { cosineDistance, desc, gt, sql } from "drizzle-orm";
import { generateEmbedding } from "../models/embed.js";

const log = createLogger("api:find-relevant-content");

export async function findRelevantContent(input: string) {
	const value = input.replace(/\s+/g, " ").trim();
	const userQueryEmbedded = await generateEmbedding(value); // abc djf -> [0.23,0.32,1,0.65]

	const distance = cosineDistance(manualChunks.embedding, userQueryEmbedded.embedding);
	const similarity = sql<number>`1 - (${distance})`;
	log.info("searching for:", { value });

	const chunks = await db
		.select({
			id: manualChunks.id,
			content: manualChunks.content,
			pageStart: manualChunks.pageStart,
			pageEnd: manualChunks.pageEnd,
			similarity,
		})
		.from(manualChunks)
		.where(gt(similarity, 0.5))
		.orderBy((t) => desc(t.similarity))
		.limit(5);

	log.success("RAG content selected:", { chunks });

	return chunks.map((chunk) => ({
		id: chunk.id,
		source: "Epson TP3 manual for RC700A controller",
		pageRange: chunk.pageStart === chunk.pageEnd ? `p. ${chunk.pageStart}` : `pp. ${chunk.pageStart}-${chunk.pageEnd}`,
		relevance: Number(chunk.similarity.toFixed(3)),
		excerpt: chunk.content,
	}));
}
