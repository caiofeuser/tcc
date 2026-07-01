export type ChecklistTaskState = {
	position: number;
	status: "pending" | "completed" | "skipped";
};

export type ChecklistStatus = "active" | "completed" | "abandoned";
export type EndGuidedProcedureOutcome = "finish" | "abandon";
export const MAX_CHECKLIST_ACTIONS = 12;

export type AdvanceDecision =
	| { kind: "complete"; taskPosition: number }
	| { kind: "move"; currentTaskIndex: number }
	| { kind: "noop" };

export function decideAdvance(currentTaskIndex: number, tasks: readonly ChecklistTaskState[]): AdvanceDecision {
	const displayedTask = tasks.find((task) => task.position === currentTaskIndex);

	if (!displayedTask) return { kind: "noop" };
	if (displayedTask.status === "pending") {
		return { kind: "complete", taskPosition: displayedTask.position };
	}

	const nextTask = tasks.find((task) => task.position > displayedTask.position);
	return nextTask ? { kind: "move", currentTaskIndex: nextTask.position } : { kind: "noop" };
}

export function previousTaskIndex(currentTaskIndex: number, tasks: readonly ChecklistTaskState[]) {
	return (
		tasks
			.filter((task) => task.position < currentTaskIndex)
			.at(-1)?.position ?? currentTaskIndex
	);
}

export function nextPendingTask(tasks: readonly ChecklistTaskState[]) {
	return tasks.find((task) => task.status === "pending") ?? null;
}

export function statusAfterResolving(tasks: readonly ChecklistTaskState[]): ChecklistStatus {
	return nextPendingTask(tasks) ? "active" : "completed";
}

export function validateEndOutcome(status: ChecklistStatus, outcome: EndGuidedProcedureOutcome) {
	if (outcome === "finish" && status !== "completed") {
		return "Only a completed guided procedure can be finished." as const;
	}

	if (outcome === "abandon" && status !== "active") {
		return "Only an active guided procedure can be abandoned." as const;
	}

	return null;
}

export type PendingRevisionDecision =
	| { ok: true; startPosition: number; resolvedCount: number }
	| { ok: false; reason: string };

export function validatePendingRevision(
	currentTaskIndex: number,
	tasks: readonly ChecklistTaskState[],
	replacementCount: number,
): PendingRevisionDecision {
	if (replacementCount < 1) {
		return { ok: false, reason: "A revision must contain at least one replacement action." };
	}

	const displayedTask = tasks.find((task) => task.position === currentTaskIndex);
	if (!displayedTask) {
		return { ok: false, reason: "The displayed checklist action was not found." };
	}
	if (displayedTask.status !== "pending") {
		return { ok: false, reason: "Only a displayed pending action can be revised." };
	}

	const firstPendingIndex = tasks.findIndex((task) => task.status === "pending");
	if (firstPendingIndex < 0) {
		return { ok: false, reason: "The checklist has no pending actions to revise." };
	}

	const firstPendingTask = tasks[firstPendingIndex];
	if (!firstPendingTask || firstPendingTask.position !== currentTaskIndex) {
		return { ok: false, reason: "The displayed action must be the first pending action." };
	}

	const hasResolvedTaskAfterPending = tasks
		.slice(firstPendingIndex)
		.some((task) => task.status !== "pending");
	const hasNonContiguousPositions = tasks.some((task, index) => task.position !== index);
	if (hasResolvedTaskAfterPending || hasNonContiguousPositions) {
		return { ok: false, reason: "The checklist does not have a linear resolved-prefix/pending-suffix state." };
	}

	if (firstPendingIndex + replacementCount > MAX_CHECKLIST_ACTIONS) {
		return {
			ok: false,
			reason: `A checklist cannot contain more than ${MAX_CHECKLIST_ACTIONS} actions.`,
		};
	}

	return {
		ok: true,
		startPosition: firstPendingTask.position,
		resolvedCount: firstPendingIndex,
	};
}

export type ChecklistRevisionRecord = {
	revisedAt: string;
	clarification: string;
	reason: string;
	previousActions: Array<{ position: number; title: string; description: string }>;
	replacementActions: Array<{ position: number; title: string; description: string }>;
};

export function appendChecklistRevision<T extends Record<string, unknown>>(
	metadata: T,
	revision: ChecklistRevisionRecord,
): T & { revisions: unknown[] } {
	const revisions: unknown[] = Array.isArray(metadata.revisions) ? metadata.revisions : [];
	return {
		...metadata,
		revisions: [...revisions, revision],
	};
}
