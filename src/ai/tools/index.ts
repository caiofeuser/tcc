import type { Database } from "@db/index.js";
import {
	advanceGuidedProcedureTool,
	endGuidedProcedureTool,
	revisePendingStepsTool,
	showPreviousStepTool,
	skipCurrentStepTool,
} from "./checklist-controls.js";
import { startGuidedProcedureTool } from "./create-checklist.js";
import { getInformationTool } from "./find-relevant-content.js";
import { getPageImageTool } from "./get-image.js";

export function createTools({ db, sessionId }: { db: Database; sessionId: string }) {
	return {
		getInformation: getInformationTool,
		getImage: getPageImageTool,
		startGuidedProcedure: startGuidedProcedureTool({ db, sessionId }),
		advanceGuidedProcedure: advanceGuidedProcedureTool({ db, sessionId }),
		showPreviousStep: showPreviousStepTool({ db, sessionId }),
		skipCurrentStep: skipCurrentStepTool({ db, sessionId }),
		revisePendingSteps: revisePendingStepsTool({ db, sessionId }),
		endGuidedProcedure: endGuidedProcedureTool({ db, sessionId }),
	};
}
