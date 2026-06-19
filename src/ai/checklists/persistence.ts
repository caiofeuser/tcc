import type { db as database } from "@db/index.js";
import { checklists, tasks as taskRows } from "@db/schema.js";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { upsertSession } from "../session/persistence.js";

type Database = typeof database;
type QueryDatabase = Pick<Database, "select">;

type ChecklistRow = typeof checklists.$inferSelect;
type TaskRow = typeof taskRows.$inferSelect;
type TaskStatus = TaskRow["status"];
export type ChecklistErrorStatus = 400 | 404 | 409 | 500;

export type ChecklistTaskInput = {
	title: string;
	description: string;
};

export type StartGuidedProcedureInput = {
	sessionId: string;
	title: string;
	sourceQuestion: string;
	operatorActions: ChecklistTaskInput[];
	metadata?: Record<string, unknown>;
};

export type ChecklistTaskView = {
	id: string;
	position: number;
	title: string;
	description: string;
	status: TaskStatus;
	completedAt: string | null;
	metadata: Record<string, unknown>;
};

export type ChecklistView = {
	id: string;
	sessionId: string;
	title: string;
	sourceQuestion: string;
	status: ChecklistRow["status"];
	currentTaskIndex: number;
	currentTask: ChecklistTaskView | null;
	tasks: ChecklistTaskView[];
	progress: {
		total: number;
		completed: number;
		skipped: number;
		pending: number;
	};
	metadata: Record<string, unknown>;
	createdAt: string | null;
	updatedAt: string | null;
};

export class ChecklistStateError extends Error {
	constructor(
		message: string,
		readonly status: ChecklistErrorStatus = 400,
	) {
		super(message);
		this.name = "ChecklistStateError";
	}
}

function asMetadata(value: Record<string, unknown> | null | undefined) {
	return value ?? {};
}

function toIso(value: Date | null) {
	return value?.toISOString() ?? null;
}

function serializeTask(task: TaskRow): ChecklistTaskView {
	return {
		id: task.id,
		position: task.position,
		title: task.title,
		description: task.description,
		status: task.status,
		completedAt: toIso(task.completedAt),
		metadata: asMetadata(task.metadata),
	};
}

function serializeChecklist(checklist: ChecklistRow, tasks: TaskRow[]): ChecklistView {
	const serializedTasks = tasks.map(serializeTask);
	const currentTask =
		serializedTasks.find((task) => task.position === checklist.currentTaskIndex) ??
		serializedTasks.find((task) => task.status === "pending") ??
		null;

	return {
		id: checklist.id,
		sessionId: checklist.sessionId,
		title: checklist.title,
		sourceQuestion: checklist.sourceQuestion,
		status: checklist.status,
		currentTaskIndex: checklist.currentTaskIndex,
		currentTask,
		tasks: serializedTasks,
		progress: {
			total: serializedTasks.length,
			completed: serializedTasks.filter((task) => task.status === "completed").length,
			skipped: serializedTasks.filter((task) => task.status === "skipped").length,
			pending: serializedTasks.filter((task) => task.status === "pending").length,
		},
		metadata: asMetadata(checklist.metadata),
		createdAt: toIso(checklist.createdAt),
		updatedAt: toIso(checklist.updatedAt),
	};
}

async function selectChecklistTasks(db: QueryDatabase, checklistId: string) {
	return db
		.select()
		.from(taskRows)
		.where(eq(taskRows.checklistId, checklistId))
		.orderBy(asc(taskRows.position), asc(taskRows.id));
}

async function selectLatestSessionChecklist(db: QueryDatabase, sessionId: string) {
	const [checklist] = await db
		.select()
		.from(checklists)
		.where(and(eq(checklists.sessionId, sessionId), ne(checklists.status, "abandoned")))
		.orderBy(desc(checklists.createdAt), desc(checklists.id))
		.limit(1);

	return checklist ?? null;
}

async function selectActiveSessionChecklist(db: QueryDatabase, sessionId: string) {
	const [checklist] = await db
		.select()
		.from(checklists)
		.where(and(eq(checklists.sessionId, sessionId), eq(checklists.status, "active")))
		.orderBy(desc(checklists.createdAt), desc(checklists.id))
		.limit(1);

	return checklist ?? null;
}

export async function getSessionChecklist(db: QueryDatabase, sessionId: string) {
	const checklist = await selectLatestSessionChecklist(db, sessionId);
	if (!checklist) return null;

	const tasks = await selectChecklistTasks(db, checklist.id);
	return serializeChecklist(checklist, tasks);
}

export async function startGuidedProcedureForSession(db: Database, input: StartGuidedProcedureInput) {
	const now = new Date();
	const normalizedTasks = input.operatorActions.map((task, index) => ({
		position: index,
		title: task.title.replace(/\s+/g, " ").trim(),
		description: task.description.replace(/\s+/g, " ").trim(),
	}));

	if (normalizedTasks.length === 0) {
		throw new ChecklistStateError("Checklist must contain at least one task.");
	}

	const checklistId = await db.transaction(async (tx) => {
		await upsertSession(tx, input.sessionId);

		await tx
			.update(checklists)
			.set({ status: "abandoned", updatedAt: now })
			.where(and(eq(checklists.sessionId, input.sessionId), eq(checklists.status, "active")));

		const [checklist] = await tx
			.insert(checklists)
			.values({
				sessionId: input.sessionId,
				title: input.title.replace(/\s+/g, " ").trim(),
				sourceQuestion: input.sourceQuestion.replace(/\s+/g, " ").trim(),
				status: "active",
				currentTaskIndex: 0,
				metadata: input.metadata ?? {},
				createdAt: now,
				updatedAt: now,
			})
			.returning({ id: checklists.id });

		if (!checklist) {
			throw new ChecklistStateError("Could not create checklist.", 500);
		}

		await tx.insert(taskRows).values(
			normalizedTasks.map((task) => ({
				sessionId: input.sessionId,
				checklistId: checklist.id,
				position: task.position,
				title: task.title,
				description: task.description,
				status: "pending" as const,
				metadata: {},
				createdAt: now,
				updatedAt: now,
			})),
		);

		return checklist.id;
	});

	const checklist = await getSessionChecklist(db, input.sessionId);
	if (!checklist || checklist.id !== checklistId) {
		throw new ChecklistStateError("Created checklist could not be loaded.", 500);
	}

	return checklist;
}

function resolveTargetTask(checklist: ChecklistRow, tasks: TaskRow[], taskId: string) {
	if (taskId === "current") {
		return (
			tasks.find((task) => task.position === checklist.currentTaskIndex && task.status === "pending") ??
			tasks.find((task) => task.status === "pending") ??
			null
		);
	}

	return tasks.find((task) => task.id === taskId) ?? null;
}

async function setTaskStatus(
	db: Database,
	sessionId: string,
	taskId: string,
	status: Extract<TaskStatus, "completed" | "skipped">,
) {
	const now = new Date();

	await db.transaction(async (tx) => {
		const checklist = await selectActiveSessionChecklist(tx, sessionId);
		if (!checklist) {
			throw new ChecklistStateError("No active checklist found for this session.", 404);
		}

		const tasks = await selectChecklistTasks(tx, checklist.id);
		const task = resolveTargetTask(checklist, tasks, taskId);

		if (!task) {
			throw new ChecklistStateError("Task was not found in the active checklist.", 404);
		}

		if (task.status !== "pending") {
			throw new ChecklistStateError("Task is already finished.", 409);
		}

		await tx
			.update(taskRows)
			.set({
				status,
				completedAt: status === "completed" ? now : null,
				updatedAt: now,
			})
			.where(eq(taskRows.id, task.id));

		const updatedTasks = await selectChecklistTasks(tx, checklist.id);
		const nextPendingTask = updatedTasks.find((candidate) => candidate.status === "pending");

		await tx
			.update(checklists)
			.set({
				status: nextPendingTask ? "active" : "completed",
				currentTaskIndex: nextPendingTask?.position ?? Math.max(updatedTasks.length - 1, 0),
				updatedAt: now,
			})
			.where(eq(checklists.id, checklist.id));
	});

	return getSessionChecklist(db, sessionId);
}

export function completeChecklistTask(db: Database, sessionId: string, taskId: string) {
	return setTaskStatus(db, sessionId, taskId, "completed");
}

export function skipChecklistTask(db: Database, sessionId: string, taskId: string) {
	return setTaskStatus(db, sessionId, taskId, "skipped");
}

export async function resetChecklist(db: Database, sessionId: string) {
	const now = new Date();

	await db.transaction(async (tx) => {
		const checklist = await selectLatestSessionChecklist(tx, sessionId);
		if (!checklist) {
			throw new ChecklistStateError("No checklist found for this session.", 404);
		}

		await tx
			.update(taskRows)
			.set({ status: "pending", completedAt: null, updatedAt: now })
			.where(eq(taskRows.checklistId, checklist.id));

		await tx
			.update(checklists)
			.set({ status: "active", currentTaskIndex: 0, updatedAt: now })
			.where(eq(checklists.id, checklist.id));
	});

	return getSessionChecklist(db, sessionId);
}

export async function abandonChecklist(db: Database, sessionId: string) {
	const now = new Date();

	await db.transaction(async (tx) => {
		const checklist = await selectLatestSessionChecklist(tx, sessionId);
		if (!checklist) return;

		await tx.update(checklists).set({ status: "abandoned", updatedAt: now }).where(eq(checklists.id, checklist.id));
	});

	return getSessionChecklist(db, sessionId);
}

export function formatChecklistForPrompt(checklist: ChecklistView | null) {
	if (!checklist) {
		return "Active guided procedure context: none.";
	}

	const actionLines = checklist.tasks.map((task) => {
		const marker = task.status === "completed" ? "x" : task.status === "skipped" ? "-" : " ";
		const current = checklist.currentTask?.id === task.id ? " current" : "";
		return `- [${marker}] ${task.position + 1}. ${task.title}${current}\n  ${task.description}`;
	});

	return [
		"Active guided procedure context:",
		`Guided procedure: ${checklist.title}`,
		`Status: ${checklist.status}`,
		`Progress: ${checklist.progress.completed} completed, ${checklist.progress.skipped} skipped, ${checklist.progress.pending} pending, ${checklist.progress.total} total`,
		"Operator actions:",
		...actionLines,
	].join("\n");
}
