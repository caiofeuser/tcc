import { mkdir, readFile, writeFile } from "node:fs/promises";
import { manualChunks, manualDocuments } from "@db/schema.js";
import { createLogger } from "@log/index.js";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextContent } from "pdfjs-dist/types/src/display/api.js";
import { createContext } from "@/ai/context/create-context.js";
import { generateEmbedding } from "@/ai/models/embed.js";
import { imageCaptionGenerator } from "@/ai/models/image-caption-generator.js";

const OUTPUT = "assets/images";
const DEFAULT_MANUAL_PATH = "assets/epson_teach_pendant_tp3_manual-rc700a(r13).pdf";
const log = createLogger("rag:chunk-factory");

type PdfCanvasFactory = {
	create: (
		width: number,
		height: number,
	) => {
		canvas: { toBuffer: (type: "image/png") => Buffer };
		context: CanvasRenderingContext2D;
	};
};

async function extractPDFPages(filePath: string) {
	const data = await readFile(filePath); // buffer

	const loadingTask = getDocument({
		data: new Uint8Array(data),
	});

	return loadingTask.promise;
}

function extractPageText(pageContent: TextContent) {
	return pageContent.items
		.map((item) => {
			if ("str" in item) return item.str;
			return "";
		})
		.join(" ")
		.replace(/\s*\.{3,}\s*/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

async function getPageContent(pageNumber: number, pdf: PDFDocumentProxy) {
	const pageData = await pdf.getPage(pageNumber);
	pageData.render;
	return pageData.getTextContent();
}

async function getAuxiliaryContent(pageNumber: number, pdf: PDFDocumentProxy) {
	const isFirstPage = pageNumber === 1;
	const isLastPage = pageNumber === pdf.numPages;

	const [prevContent, nextContent] = await Promise.all([
		!isFirstPage ? pdf.getPage(pageNumber - 1) : null,
		!isLastPage ? pdf.getPage(pageNumber + 1) : null,
	]);

	const [prevText, nextText] = await Promise.all([prevContent?.getTextContent(), nextContent?.getTextContent()]);

	const prev = prevText ? extractPageText(prevText).slice(0, 30) : "";
	const next = nextText ? extractPageText(nextText).slice(0, 30) : "";

	return {
		next,
		prev,
	};
}

async function extractImage(pdf: PDFDocumentProxy, pageNumber: number) {
	const page = await pdf.getPage(pageNumber);
	const viewport = page.getViewport({ scale: 2 });
	const canvasFactory = pdf.canvasFactory as PdfCanvasFactory;

	const entry = canvasFactory.create(viewport.width, viewport.height);

	await page.render({
		viewport,
		canvas: null,
		canvasContext: entry.context,
	}).promise;

	await mkdir(OUTPUT, { recursive: true });

	const pageName = `page-${String(page.pageNumber).padStart(3, "0")}.png`;
	const path = `${OUTPUT}/${pageName}`;

	const png = entry.canvas.toBuffer("image/png");
	await writeFile(path, png);

	return { image: png, title: pageName };
}

export async function ingestPDF(filePath: string, dryRun: boolean) {
	const ingestionTimer = log.timer();
	log.info("Starting manual ingestion", { file: filePath });

	try {
		const pdf = await extractPDFPages(filePath);
		const pages = [];
		const ctx = createContext();
		const title = filePath.split("/").at(-1) || filePath;

		log.success("PDF loaded", { pages: pdf.numPages });

		const doc = await ctx.db
			.insert(manualDocuments)
			.values({
				title,
				sourcePath: filePath,
				sourceType: "pdf",
			})
			.returning();

		const document = doc[0];
		if (!document) throw new Error("Could not create manual document record.");

		log.success("Document registered", { documentId: document.id, title });

		for (let pageNumber = 18; pageNumber <= pdf.numPages; pageNumber++) {
			let index = 0;
			const pageTimer = log.timer();
			log.info("Processing page", { page: pageNumber, totalPages: pdf.numPages });

			const pageContent = await getPageContent(pageNumber, pdf);
			const text = extractPageText(pageContent);
			log.debug("Page text extracted", { page: pageNumber, chars: text.length });

			const { next, prev } = await getAuxiliaryContent(pageNumber, pdf);
			const { image, title } = await extractImage(pdf, pageNumber);
			const wholeText = [prev, text, next].join("\n");
			log.debug("Page image rendered", { page: pageNumber, file: title, bytes: image.byteLength });

			const caption = await imageCaptionGenerator({
				pageNumber,
				type: "image",
				image,
				previousText: prev,
				nextText: next,
				pageText: text,
			});

			const imageSummary = caption?.text;
			if (!imageSummary) log.warn("Image caption missing", { page: pageNumber });
			log.debug("Image caption generated", { page: pageNumber, chars: imageSummary?.length ?? 0 });

			const textContent = buildEmbeddingContent(wholeText, imageSummary);

			const embedding = await generateEmbedding(textContent);
			log.debug("Embedding generated", { page: pageNumber, tokens: embedding.usage.tokens });

			if (!dryRun) {
				await ctx.db.insert(manualChunks).values({
					documentId: document.id,
					chunkIndex: index,
					pageStart: pageNumber,
					pageEnd: pageNumber,
					content: textContent,
					metadata: { title },
					embedding: embedding.embedding,
					tokenCount: embedding.usage.tokens,
				});
				log.info("Writing chunks to database", { chunks: pages.length });
			}

			pageTimer.done("Page processed", { page: pageNumber, tokens: embedding.usage.tokens });
			index++;
		}

		ingestionTimer.done("Manual ingestion finished", { documentId: document.id, pages: pages.length });
	} catch (error) {
		ingestionTimer.fail("Manual ingestion failed", error instanceof Error ? error : new Error(String(error)));
		throw error;
	}
}

const buildEmbeddingContent = (text: string, imageCaption: string | undefined) => {
	const mainSection = `<page-text>${text}</page-text>`;
	const imageSection = `<image-desc>${imageCaption}</image-desc>`;

	return imageCaption ? `${mainSection}\n\n${imageSection}` : mainSection;
};

await ingestPDF(process.argv[2] ?? DEFAULT_MANUAL_PATH, false);
