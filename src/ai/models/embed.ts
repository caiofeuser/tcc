import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embed } from "ai";

const provider = createOpenAICompatible({
	name: process.env.AI_PROVIDER_NAME ?? "ollama",
	baseURL: process.env.AI_BASE_URL!,
	apiKey: process.env.AI_API_KEY,
});

export function generateEmbedding(value: string, abortSignal?: AbortSignal) {
	return embed({
		model: provider.embeddingModel(process.env.EMBEDDING_MODEL ?? "nomic-embed-text"),
		value,
		abortSignal,
		maxRetries: 3,
	});
}
