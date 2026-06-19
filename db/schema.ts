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

export const taskStatuses = ["pending", "completed", "skipped"] as const;
export const TASK_STATUS_ENUM = p.pgEnum("task_status", taskStatuses);

export const roles = ["user", "assistant"] as const;
export const ROLES_ENUM = p.pgEnum("roles", roles);

// base schemas
export const sessions = p.pgTable("agent_session", {
	...id,
	...temporals,
});

export const checklists = p.pgTable(
	"checklists",
	{
		...id,
		sessionId: p
			.varchar("session_id")
			.notNull()
			.references(() => sessions.id),
		title: p.text().notNull(),
		sourceQuestion: p.text("source_question").notNull(),
		status: STATUS_ENUM().notNull().default("active"),
		currentTaskIndex: p.integer("current_task_index").notNull().default(0),
		metadata: p.jsonb().$type<Record<string, unknown>>().default({}),
		...temporals,
	},
	(table) => [p.index("checklists_session_status_idx").on(table.sessionId, table.status)],
);

export const tasks = p.pgTable("tasks", {
	...id,
	sessionId: p
		.varchar("session_id")
		.notNull()
		.references(() => sessions.id),
	checklistId: p.varchar("checklist_id").references(() => checklists.id, { onDelete: "cascade" }),
	position: p.integer().notNull().default(0),
	title: p.text().notNull(),
	description: p.text().notNull().default(""),
	status: TASK_STATUS_ENUM().notNull().default("pending"),
	completedAt: p.timestamp("completed_at"),
	metadata: p.jsonb().$type<Record<string, unknown>>().default({}),
	...temporals,
}, (table) => [p.index("tasks_checklist_position_idx").on(table.checklistId, table.position)]);

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

/* -------------- rag's schemas -------------- */
export const manualDocuments = p.pgTable("manual_documents", {
	...id,
	title: p.text().notNull(),
	sourcePath: p.text("source_path"),
	sourceType: p.text("source_type"),
	...temporals,
});

export const images = p.pgTable(
	"images",
	{
		...id,
		documentId: p
			.varchar("document_id")
			.notNull()
			.references(() => manualDocuments.id, { onDelete: "cascade" }),
		pageNumber: p.integer("page_number").notNull(),
		filename: p.text().notNull(),
		mimetype: p.text().notNull(),
		data: binary().notNull(),
		metadata: p.jsonb().$type<Record<string, unknown>>().default({}),
		...temporals,
	},
	(table) => [p.uniqueIndex("images_document_page_idx").on(table.documentId, table.pageNumber)],
);

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
