import type { Database } from "@db/index.js";
import { createLogger } from "@log/index.js";
import { tool } from "ai";
import dedent from "dedent";
import { z } from "zod";
import {
	advanceGuidedProcedure,
	endGuidedProcedure,
	revisePendingChecklistSteps,
	showPreviousChecklistStep,
	skipChecklistTask,
} from "../checklists/persistence.js";

const log = createLogger("tool:checklist-controls");

type ToolContext = {
	db: Database;
	sessionId: string;
};

export function advanceGuidedProcedureTool({ db, sessionId }: ToolContext) {
	return tool({
		description: dedent(`
			Advance the visible guided procedure when the operator explicitly confirms the displayed action with phrases such as "complete", "done", or "next step".
			If the displayed action is pending, mark it completed and display the next pending action.
			If the operator is reviewing an already resolved action, move the display forward without changing checklist results.
			Do not call this tool when the operator only asks for an explanation of the displayed action.`),
		inputSchema: z.object({}),
		execute: async () => {
			log.info("Guided procedure advance requested", { sessionId });
			const checklist = await advanceGuidedProcedure(db, sessionId);
			log.success("Guided procedure advanced", {
				sessionId,
				checklistId: checklist?.id,
				displayedAction: checklist?.currentTaskIndex,
				status: checklist?.status,
			});
			return checklist;
		},
	});
}

export function showPreviousStepTool({ db, sessionId }: ToolContext) {
	return tool({
		description: dedent(`
			Show the previous guided-procedure action when the operator says "go back", "previous step", or equivalent.
			This is review-only: never change whether any action is completed, skipped, or pending.
			At the first action, leave the checklist unchanged.`),
		inputSchema: z.object({}),
		execute: async () => {
			log.info("Previous guided procedure step requested", { sessionId });
			const checklist = await showPreviousChecklistStep(db, sessionId);
			log.success("Previous guided procedure step shown", {
				sessionId,
				checklistId: checklist?.id,
				displayedAction: checklist?.currentTaskIndex,
			});
			return checklist;
		},
	});
}

export function skipCurrentStepTool({ db, sessionId }: ToolContext) {
	return tool({
		description: dedent(`
			Skip the currently displayed pending action when the operator explicitly says to skip it.
			Record the action as skipped and display the next pending action.
			Do not call this while reviewing a completed or previously skipped action.`),
		inputSchema: z.object({}),
		execute: async () => {
			log.info("Guided procedure skip requested", { sessionId });
			const checklist = await skipChecklistTask(db, sessionId, "current");
			log.success("Guided procedure step skipped", {
				sessionId,
				checklistId: checklist?.id,
				displayedAction: checklist?.currentTaskIndex,
				status: checklist?.status,
			});
			return checklist;
		},
	});
}

export function revisePendingStepsTool({ db, sessionId }: ToolContext) {
	return tool({
		description: dedent(`
			Replace the displayed pending action and all future pending actions when operator clarification, current-image evidence, or retrieved manual evidence proves the existing instructions are wrong or incompatible with the actual interface.
			Use getInformation first when the correction depends on Epson robot or TP3 documentation.
			Do not use this tool merely because the operator cannot locate a valid button or asks for a clearer explanation.
			Never rewrite completed or skipped actions. Provide the complete coherent replacement for the pending suffix.`),
		inputSchema: z.object({
			clarification: z
				.string()
				.trim()
				.min(1)
				.describe("The operator's clarification or reported incompatibility."),
			reason: z
				.string()
				.trim()
				.min(1)
				.describe("Evidence-based reason the existing pending instructions must change."),
			operatorActions: z
				.array(
					z.object({
						title: z.string().trim().min(1).describe("Short replacement action title."),
						description: z.string().trim().min(1).describe("Specific replacement instruction."),
					}),
				)
				.min(1)
				.max(12)
				.describe("Complete replacement for the current and future pending actions."),
		}),
		execute: async ({ clarification, reason, operatorActions }) => {
			log.info("Guided procedure revision requested", {
				sessionId,
				replacementActions: operatorActions.length,
			});
			const checklist = await revisePendingChecklistSteps(db, {
				sessionId,
				clarification,
				reason,
				operatorActions,
			});
			log.success("Guided procedure revised", {
				sessionId,
				checklistId: checklist?.id,
				displayedAction: checklist?.currentTaskIndex,
				replacementActions: operatorActions.length,
			});
			return checklist;
		},
	});
}

export function endGuidedProcedureTool({ db, sessionId }: ToolContext) {
	return tool({
		description: dedent(`
			End and hide the visible guided procedure only when the operator explicitly asks.
			Use outcome "finish" only after every action is completed or skipped; it preserves the completed result.
			Use outcome "abandon" only for an active procedure the operator wants to cancel or stop before completion.`),
		inputSchema: z.object({
			outcome: z
				.enum(["finish", "abandon"])
				.describe("Whether to finish an already completed procedure or abandon an active procedure."),
		}),
		execute: async ({ outcome }) => {
			log.info("Guided procedure end requested", { sessionId, outcome });
			const checklist = await endGuidedProcedure(db, sessionId, outcome);
			log.success("Guided procedure ended", { sessionId, outcome });
			return { outcome, checklist };
		},
	});
}
