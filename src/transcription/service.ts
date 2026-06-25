import { createLogger } from "@log/index.js";
import { WhisperTranscriptionError, WhisperTranscriptionService } from "./whisper.js";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const log = createLogger("transcription");
const transcriptionService = new WhisperTranscriptionService(process.env.WHISPER_BASE_URL);

type SupportedAudioContainer = "wav" | "mp4";

export class TranscriptionInputError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 413 | 415,
	) {
		super(message);
		this.name = "TranscriptionInputError";
	}
}

async function detectAudioContainer(audio: File): Promise<SupportedAudioContainer | undefined> {
	if (audio.size < 12) return undefined;

	const header = new Uint8Array(await audio.slice(0, 12).arrayBuffer());
	const marker = (start: number, length: number) =>
		String.fromCharCode(...header.slice(start, start + length));

	if (marker(0, 4) === "RIFF" && marker(8, 4) === "WAVE") return "wav";
	if (marker(4, 4) === "ftyp") return "mp4";

	return undefined;
}

export async function transcribeAudio(audio: unknown): Promise<string> {
	if (!(audio instanceof File)) {
		throw new TranscriptionInputError("Audio is required in the 'audio' field", 400);
	}

	if (audio.size === 0) {
		throw new TranscriptionInputError("Audio file is empty", 400);
	}

	if (audio.size > MAX_AUDIO_BYTES) {
		throw new TranscriptionInputError("Audio file exceeds the 10 MB limit", 413);
	}

	const container = await detectAudioContainer(audio);

	if (!container) {
		throw new TranscriptionInputError("Audio must be WAV, MP4, or M4A", 415);
	}

	const timer = log.timer();

	try {
		const transcript = await transcriptionService.transcribe(audio);

		if (!transcript) {
			throw new TranscriptionInputError("Audio did not contain a usable question", 400);
		}

		timer.done("Audio transcribed", {
			audioBytes: audio.size,
			container,
			transcriptChars: transcript.length,
		});

		return transcript;
	} catch (error) {
		timer.fail("Transcription failed", error instanceof Error ? error : new Error(String(error)));

		if (error instanceof TranscriptionInputError || error instanceof WhisperTranscriptionError) {
			throw error;
		}

		throw new WhisperTranscriptionError("Transcription failed", 502, { cause: error });
	}
}
