import type { db as database } from "@db/index.js";
import { createLogger } from "@log/index.js";
import { tool } from "ai";
import dedent from "dedent";
import { z } from "zod";
import { startGuidedProcedureForSession } from "../checklists/persistence.js";

const log = createLogger("tool:start-guided-procedure");

type Database = typeof database;

export function startGuidedProcedureTool({ db, sessionId }: { db: Database; sessionId: string }) {
	return tool({
		description: dedent(`
	Start a backend-owned guided procedure in the operator UI.
	Use this tool whenever the operator needs two or more ordered actions for an Epson robot or TP3 teach pendant workflow.
	This is not a writing or formatting tool. It creates application state for guided execution.
	Use it instead of writing procedural instructions in text.
	Use it for moving to a coordinate, teaching or recording a point, jogging the robot, setup, configuration, calibration, mode changes, safety checks, and guided execution.
	Do not use this tool for pure definitions, button explanations, or answers that are truly one step.

	After this tool starts the guided procedure, the backend owns progression.`),
		inputSchema: z.object({
			title: z.string().trim().min(1).describe("Short guided procedure title."),
			sourceQuestion: z.string().trim().min(1).describe("The operator question that triggered this guided procedure."),
			operatorActions: z
				.array(
					z.object({
						title: z.string().trim().min(1).describe("Short action title."),
						description: z.string().trim().min(1).describe("Specific instruction for this operator action."),
					}),
				)
				.min(1)
				.max(12),
		}),
		execute: async ({ title, sourceQuestion, operatorActions }) => {
			log.info("Guided procedure start requested", { sessionId, title, operatorActions: operatorActions.length });

			const checklist = await startGuidedProcedureForSession(db, {
				sessionId,
				title,
				sourceQuestion,
				operatorActions,
				metadata: {
					createdBy: "ai-tool:start-guided-procedure",
				},
			});

			log.success("Guided procedure started", {
				sessionId,
				checklistId: checklist.id,
				operatorActions: checklist.tasks.length,
			});

			return checklist;
		},
	});
}
