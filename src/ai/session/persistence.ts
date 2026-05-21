import type { db as database } from "@db/index.js";
import { messages, sessions } from "@db/schema.js";
import { asc, eq } from "drizzle-orm";
import type { ModelMessage } from "ai";

type Database = typeof database;
type InsertableDatabase = Pick<Database, "insert">;
type SelectableDatabase = Pick<Database, "select">;

export type SessionMessage = {
	id: string;
	role: "user" | "assistant" | null;
	content: string;
	metadata: Record<string, unknown>;
	createdAt: Date | null;
};

export type PersistChatTurnInput = {
	sessionId: string;
	userMessage: string;
	assistantMessage: string;
	userMetadata?: Record<string, unknown>;
	assistantMetadata?: Record<string, unknown>;
};

export async function upsertSession(db: InsertableDatabase, sessionId: string) {
	const now = new Date();

	await db
		.insert(sessions)
		.values({ id: sessionId, updatedAt: now })
		.onConflictDoUpdate({
			target: sessions.id,
			set: { updatedAt: now },
		});
}

export async function getSessionMessages(db: SelectableDatabase, sessionId: string): Promise<SessionMessage[]> {
	const rows = await db
		.select({
			id: messages.id,
			role: messages.role,
			content: messages.content,
			metadata: messages.metadata,
			createdAt: messages.createdAt,
		})
		.from(messages)
		.where(eq(messages.sessionId, sessionId))
		.orderBy(asc(messages.createdAt), asc(messages.id));

	return rows.map((message) => ({
		...message,
		metadata: message.metadata ?? {},
	}));
}

export function toModelMessages(rows: Pick<SessionMessage, "role" | "content">[]): ModelMessage[] {
	return rows.flatMap((message): ModelMessage[] => {
		if (message.role !== "user" && message.role !== "assistant") return [];

		return [{ role: message.role, content: message.content }];
	});
}

export async function persistChatTurn(db: Database, input: PersistChatTurnInput) {
	await db.transaction(async (tx) => {
		await upsertSession(tx, input.sessionId);

		await tx.insert(messages).values([
			{
				sessionId: input.sessionId,
				role: "user",
				content: input.userMessage,
				metadata: input.userMetadata ?? {},
			},
			{
				sessionId: input.sessionId,
				role: "assistant",
				content: input.assistantMessage,
				metadata: input.assistantMetadata ?? {},
			},
		]);
	});
}
