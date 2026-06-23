import { createLogger } from "@log/index.js";
import { Hono } from "hono";
import { WhisperTranscriptionError, WhisperTranscriptionService } from "./whisper.js";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const log = createLogger("api:transcription");
const transcriptionService = new WhisperTranscriptionService(process.env.WHISPER_BASE_URL);

async function hasWavHeader(audio: File) {
	if (audio.size < 12) return false;

	const header = new Uint8Array(await audio.slice(0, 12).arrayBuffer());
	const marker = (start: number, length: number) =>
		String.fromCharCode(...header.slice(start, start + length));

	return marker(0, 4) === "RIFF" && marker(8, 4) === "WAVE";
}

export const transcriptionRoutes = new Hono().post("/", async (c) => {
	let body: Awaited<ReturnType<typeof c.req.parseBody>>;

	try {
		body = await c.req.parseBody();
	} catch (error) {
		log.warn("Invalid multipart body", error instanceof Error ? error : new Error(String(error)));
		return c.json({ error: "Expected multipart/form-data" }, 400);
	}

	const audio = body.audio;

	if (!(audio instanceof File)) {
		return c.json({ error: "WAV audio is required in the 'audio' field" }, 400);
	}

	if (audio.size === 0) {
		return c.json({ error: "Audio file is empty" }, 400);
	}

	if (audio.size > MAX_AUDIO_BYTES) {
		return c.json({ error: "Audio file exceeds the 10 MB limit" }, 413);
	}

	if (!(await hasWavHeader(audio))) {
		return c.json({ error: "Audio must be a WAV file" }, 415);
	}

	const timer = log.timer();

	try {
		const transcript = await transcriptionService.transcribe(audio);
		timer.done("Audio transcribed", { audioBytes: audio.size, transcriptChars: transcript.length });

		return c.json({ transcript });
	} catch (error) {
		timer.fail("Transcription failed", error instanceof Error ? error : new Error(String(error)));

		if (error instanceof WhisperTranscriptionError) {
			return c.json({ error: error.message }, error.status);
		}

		return c.json({ error: "Transcription failed" }, 500);
	}
});
