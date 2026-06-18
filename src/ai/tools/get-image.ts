import { db } from "@db/index.js";
import { images } from "@db/schema.js";
import { createLogger } from "@log/index.js";
import { tool } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

const log = createLogger("tool:get-page-image");

export type PageImageToolOutput = {
	documentId: string;
	imageId: string;
	pageNumber: number;
	filename: string;
	mediaType: "image/png";
};

export const getPageImageTool = tool({
	description:
		"Request a rendered Epson TP3 manual page image from the database. Use only when the answer depends on visual layout, diagrams, screenshots, button labels, or screen contents. Prefer the imageId or documentId returned by getInformation when available. As answer describe the image based on the user question",
	inputSchema: z.object({
		documentId: z.string().trim().min(1).optional(),
		imageId: z.string().trim().min(1).optional(),
		pageNumber: z.number().int().min(1).max(94),
	}),

	execute: async ({ documentId, imageId, pageNumber }) => {
		const selectImage = {
			id: images.id,
			documentId: images.documentId,
			pageNumber: images.pageNumber,
			filename: images.filename,
			mimetype: images.mimetype,
		};

		const [pageImage] = imageId
			? await db.select(selectImage).from(images).where(eq(images.id, imageId)).limit(1)
			: await db
					.select(selectImage)
					.from(images)
					.where(
						documentId
							? and(eq(images.documentId, documentId), eq(images.pageNumber, pageNumber))
							: eq(images.pageNumber, pageNumber),
					)
					.orderBy(desc(images.createdAt))
					.limit(1);

		if (!pageImage) {
			throw new Error(`No rendered manual page image found in the database for page ${pageNumber}.`);
		}

		if (pageImage.mimetype !== "image/png") {
			throw new Error(`Unsupported manual page image type: ${pageImage.mimetype}.`);
		}

		log.info("Image selected", {
			documentId: pageImage.documentId,
			filename: pageImage.filename,
			imageId: pageImage.id,
			pageNumber: pageImage.pageNumber,
		});

		return {
			documentId: pageImage.documentId,
			filename: pageImage.filename,
			imageId: pageImage.id,
			pageNumber: pageImage.pageNumber,
			mediaType: "image/png",
		} satisfies PageImageToolOutput;
	},

	toModelOutput: ({ output }) => {
		const pageImage = output as PageImageToolOutput;

		return {
			type: "text",
			value: `Rendered Epson TP3 manual page ${pageImage.pageNumber} was selected from the database. The next model step will receive it as an image attachment.`,
		};
	},
});
