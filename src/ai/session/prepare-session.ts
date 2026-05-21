import type { ContextType } from "../context/create-context.js";
import { getSessionMessages, toModelMessages } from "./persistence.js";

export async function prepareSession(ctx: ContextType, { session: sessionId }: { message: string; session: string }) {
	try {
		const messages = await getSessionMessages(ctx.db, sessionId);

		return {
			data: {
				messages,
				prevMessages: toModelMessages(messages),
				sessionId,
			},
			error: null,
		};
	} catch (error) {
		console.error("Failed to prepare session", error);

		return {
			data: null,
			error: {
				message: error instanceof Error ? error.message : String(error),
				status: 500,
			},
		};
	}
}
