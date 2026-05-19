import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { type DataContent, generateText } from "ai";

interface ImageCaptionPrompt {
	pageNumber: number;
	previousText?: string;
	pageText?: string;
	nextText?: string;
}

export function buildPdfImageCaptionPrompt(input: ImageCaptionPrompt) {
	return `
You are generating searchable technical descriptions for images extracted from an Epson TP3 teach pendant manual.

The goal is not to make a creative caption. The goal is to create text that improves retrieval in a RAG system for robot operation questions.

Page number: ${input.pageNumber}

Previous page/context text:
${input.previousText ?? "No previous context available."}

Current page text:
${input.pageText ?? "No page text available."}

Next page/context text:
${input.nextText ?? "No next context available."}

Analyze the attached image and return a concise technical description.

Focus on:
- what the image shows;
- visible teach pendant screens, buttons, labels, menus, icons, warnings, diagrams, or robot-operation steps;
- any procedure-relevant information;
- any safety-relevant information;
- text visible inside the image;
- how this image relates to the surrounding manual text.

Rules:
- Do not invent details that are not visible or supported by the surrounding text.
- If something is unclear, say it is unclear.
- Prefer concrete terms an operator might search for.
- Mention Epson TP3, teach pendant, robot operation, menu names, button names, coordinates, motion, mode, or safety only when visible or context-supported.
- Keep the answer compact enough to embed as retrieval text.`;
}

const provider = createOpenAICompatible({
	name: process.env.AI_PROVIDER_NAME ?? "ollama",
	baseURL: process.env.AI_BASE_URL!,
	apiKey: process.env.AI_API_KEY,
});

interface ImageCaptionGen extends ImageCaptionPrompt {
	type: "image";
	image: DataContent;
}

export function imageCaptionGenerator(input: ImageCaptionGen) {
	try {
		return generateText({
			model: provider.chatModel(process.env.AI_MODEL!),
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "Describe that image" },
						{ type: "image", image: input.image },
					],
				},
			],
			system: buildPdfImageCaptionPrompt(input),
		});
	} catch (e) {
		console.error(e);
	}
}
