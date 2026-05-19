import { sessions } from "@db/schema.js";
import type { ContextType } from "../context/create-context.js";

export async function prepareSession(ctx: ContextType, { session: sessionId }: { message: string; session: string }) {
	try {
		await ctx.db.insert(sessions).values({ id: sessionId }).onConflictDoNothing({ target: sessions.id });

		return {
			data: {
				prevMessages: [],
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
