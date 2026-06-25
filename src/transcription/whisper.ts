import { z } from "zod";

const whisperResponseSchema = z.object({
	text: z.string(),
});

export class WhisperTranscriptionError extends Error {
	constructor(
		message: string,
		readonly status: 502 | 503 | 504,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "WhisperTranscriptionError";
	}
}

export class WhisperTranscriptionService {
	constructor(
		private readonly baseUrl: string | undefined,
		private readonly timeoutMs = 60_000,
	) {}

	async transcribe(audio: File): Promise<string> {
		if (!this.baseUrl) {
			throw new WhisperTranscriptionError("Whisper is not configured", 503);
		}

		const form = new FormData();
		form.append("file", audio, audio.name);
		form.append("response_format", "json");
		form.append("language", "en");

		let response: Response;

		try {
			response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/inference`, {
				method: "POST",
				body: form,
				signal: AbortSignal.timeout(this.timeoutMs),
			});
		} catch (error) {
			const timedOut = error instanceof DOMException && error.name === "TimeoutError";

			throw new WhisperTranscriptionError(
				timedOut ? "Whisper transcription timed out" : "Whisper is unavailable",
				timedOut ? 504 : 502,
				{ cause: error },
			);
		}

		if (!response.ok) {
			throw new WhisperTranscriptionError(`Whisper returned HTTP ${response.status}`, 502);
		}

		let payload: unknown;

		try {
			payload = await response.json();
		} catch (error) {
			throw new WhisperTranscriptionError("Whisper returned invalid JSON", 502, { cause: error });
		}

		const parsed = whisperResponseSchema.safeParse(payload);

		if (!parsed.success) {
			throw new WhisperTranscriptionError("Whisper returned an invalid response", 502, {
				cause: parsed.error,
			});
		}

		return parsed.data.text.trim();
	}
}
