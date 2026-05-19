import * as p from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { binary } from "./bytea.js";

const temporals = {
	createdAt: p.timestamp("created_at").$defaultFn(() => new Date()),
	updatedAt: p.timestamp("updated_at").$defaultFn(() => new Date()),
};

const id = {
	id: p
		.varchar("id", { length: 191 })
		.primaryKey()
		.$defaultFn(() => nanoid()),
};
export const statuses = ["active", "completed", "abandoned"] as const;
export const STATUS_ENUM = p.pgEnum("status", statuses);

export const roles = ["user", "assistant"] as const;
export const ROLES_ENUM = p.pgEnum("roles", roles);

// base schemas
export const sessions = p.pgTable("agent_session", {
	...id,
	...temporals,
});

export const tasks = p.pgTable("tasks", {
	...id,
	sessionId: p
		.varchar("session_id")
		.notNull()
		.references(() => sessions.id),
	title: p.text().notNull(),
	status: STATUS_ENUM(),
	...temporals,
});

export const messages = p.pgTable("messages", {
	...id,
	sessionId: p
		.varchar("session_id")
		.notNull()
		.references(() => sessions.id),
	taskId: p.varchar("task_id").references(() => tasks.id),
	role: ROLES_ENUM(),
	content: p.text().notNull(),
	metadata: p.jsonb().$type<Record<string, unknown>>().default({}),
	...temporals,
});

// not sure if this will work tho
export const images = p.pgTable("images", {
	...id,
	filename: p.text().notNull(),
	mimetype: p.text().notNull(),
	data: binary().notNull(),
	...temporals,
});

/* -------------- rag's schemas -------------- */
export const manualDocuments = p.pgTable("manual_documents", {
	...id,
	title: p.text().notNull(),
	sourcePath: p.text("source_path"),
	sourceType: p.text("source_type"),
	...temporals,
});

export const manualChunks = p.pgTable(
	"manual_chunks",
	{
		...id,
		documentId: p.varchar("document_id").references(() => manualDocuments.id, { onDelete: "cascade" }),
		pageStart: p.integer("page_start").notNull(),
		pageEnd: p.integer("page_end").notNull(),
		chunkIndex: p.integer("chunk_index").notNull(),
		content: p.text().notNull(),
		tokenCount: p.integer("token_count").notNull(),
		embedding: p.vector("embedding", { dimensions: 768 }).notNull(),
		metadata: p.jsonb().$type<Record<string, unknown>>().default({}),
		...temporals,
	},
	(table) => [p.index("manual_chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops"))],
);
// remember to create the relations later
