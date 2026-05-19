import { db } from "@db/index.js";
export function createContext() {
	const baseURL = process.env.AI_BASE_URL;
	const modelId = process.env.AI_MODEL;
	const providerName = process.env.AI_PROVIDER_NAME ?? "local";

	return { db, data: { baseURL: baseURL!, modelId: modelId!, providerName }, error: null };
}

export type ContextType = Extract<ReturnType<typeof createContext>, { error: null }>;
