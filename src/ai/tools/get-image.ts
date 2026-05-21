import { access } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@log/index.js";
import { tool } from "ai";
import { z } from "zod";

const log = createLogger("tool:get-page-image");

export type PageImageToolOutput = {
	pageNumber: number;
	mediaType: "image/png";
	imagePath: string;
};

export const getPageImageTool = tool({
	description:
		"Request a rendered Epson TP3 manual page image. Use only when the answer depends on visual layout, diagrams, screenshots, button labels, or screen contents. As answer describe the image based on the user question",
	inputSchema: z.object({
		pageNumber: z.number().int().min(1).max(94),
	}),

	execute: async ({ pageNumber }) => {
		const pageId = String(pageNumber).padStart(3, "0");
		const path = join(process.cwd(), "assets", "images", `page-${pageId}.png`);
		await access(path);

		log.info("Image path:", { path });

		return {
			pageNumber,
			mediaType: "image/png",
			imagePath: path,
		} satisfies PageImageToolOutput;
	},

	toModelOutput: ({ output }) => {
		const pageImage = output as PageImageToolOutput;

		return {
			type: "text",
			value: `Rendered Epson TP3 manual page ${pageImage.pageNumber} was selected. The next model step will receive it as an image attachment.`,
		};
	},
});
