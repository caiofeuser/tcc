import { describe, expect, test } from "bun:test";
import {
	appendChecklistRevision,
	decideAdvance,
	MAX_CHECKLIST_ACTIONS,
	nextPendingTask,
	previousTaskIndex,
	statusAfterResolving,
	validateEndOutcome,
	validatePendingRevision,
} from "./transitions.js";

describe("guided procedure transitions", () => {
	const tasks = [
		{ position: 0, status: "completed" as const },
		{ position: 1, status: "pending" as const },
		{ position: 2, status: "pending" as const },
	];

	test("advancing a pending step completes it", () => {
		expect(decideAdvance(1, tasks)).toEqual({ kind: "complete", taskPosition: 1 });
	});

	test("advancing while reviewing moves forward without changing status", () => {
		expect(decideAdvance(0, tasks)).toEqual({ kind: "move", currentTaskIndex: 1 });
		expect(tasks[0]?.status).toBe("completed");
	});

	test("advancing from the final resolved step is a no-op", () => {
		expect(decideAdvance(0, [{ position: 0, status: "completed" }])).toEqual({ kind: "noop" });
	});

	test("going back moves the cursor without changing status and respects the first-step boundary", () => {
		expect(previousTaskIndex(1, tasks)).toBe(0);
		expect(previousTaskIndex(0, tasks)).toBe(0);
		expect(tasks[0]?.status).toBe("completed");
	});

	test("finds the next unresolved step and completes the checklist when none remain", () => {
		expect(nextPendingTask(tasks)?.position).toBe(1);
		expect(statusAfterResolving([{ position: 0, status: "skipped" }])).toBe("completed");
	});

	test("finishing and abandonment enforce different lifecycle states", () => {
		expect(validateEndOutcome("completed", "finish")).toBeNull();
		expect(validateEndOutcome("active", "abandon")).toBeNull();
		expect(validateEndOutcome("active", "finish")).toBe("Only a completed guided procedure can be finished.");
		expect(validateEndOutcome("completed", "abandon")).toBe("Only an active guided procedure can be abandoned.");
	});

	test("allows replacing the displayed pending suffix without mutating resolved actions", () => {
		const revisionTasks = [
			{ position: 0, status: "completed" as const },
			{ position: 1, status: "skipped" as const },
			{ position: 2, status: "pending" as const },
			{ position: 3, status: "pending" as const },
		];
		const originalTasks = structuredClone(revisionTasks);

		expect(validatePendingRevision(2, revisionTasks, 3)).toEqual({
			ok: true,
			startPosition: 2,
			resolvedCount: 2,
		});
		expect(revisionTasks).toEqual(originalTasks);
	});

	test("rejects invalid pending revisions", () => {
		expect(validatePendingRevision(0, [{ position: 0, status: "pending" }], 0)).toEqual({
			ok: false,
			reason: "A revision must contain at least one replacement action.",
		});
		expect(validatePendingRevision(0, [{ position: 0, status: "completed" }], 1)).toEqual({
			ok: false,
			reason: "Only a displayed pending action can be revised.",
		});
		expect(
			validatePendingRevision(
				1,
				[
					{ position: 0, status: "pending" },
					{ position: 1, status: "pending" },
				],
				1,
			),
		).toEqual({
			ok: false,
			reason: "The displayed action must be the first pending action.",
		});
		expect(
			validatePendingRevision(
				1,
				[
					{ position: 0, status: "completed" },
					{ position: 1, status: "pending" },
					{ position: 2, status: "completed" },
				],
				1,
			),
		).toEqual({
			ok: false,
			reason: "The checklist does not have a linear resolved-prefix/pending-suffix state.",
		});
		expect(
			validatePendingRevision(
				1,
				[
					{ position: 0, status: "completed" },
					{ position: 1, status: "pending" },
				],
				MAX_CHECKLIST_ACTIONS,
			),
		).toEqual({
			ok: false,
			reason: `A checklist cannot contain more than ${MAX_CHECKLIST_ACTIONS} actions.`,
		});
	});

	test("appends revision audit metadata without removing existing metadata", () => {
		const revision = {
			revisedAt: "2026-07-01T12:00:00.000Z",
			clarification: "The button is not available.",
			reason: "The displayed interface uses a different workflow.",
			previousActions: [{ position: 1, title: "Old", description: "Old instruction" }],
			replacementActions: [{ position: 1, title: "New", description: "New instruction" }],
		};

		expect(appendChecklistRevision({ createdBy: "test" }, revision)).toEqual({
			createdBy: "test",
			revisions: [revision],
		});
	});
});
