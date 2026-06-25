import { z } from "zod";

const chatRequestSchema = z.object({
	session: z.string(),
	message: z.string().trim().min(1),
	imageBase64: z.string().trim().min(1).optional(),
	imageMediaType: z.string().trim().min(1).optional(),
});

export type ChatRequestData = z.infer<typeof chatRequestSchema>;

export function validate(req: unknown) {
	const parsed = chatRequestSchema.safeParse(req);

	if (!parsed.success) {
		return {
			data: null,
			error: {
				message: new Error("Parsing failed"),
				status: 401,
			},
		};
	}

	return {
		data: parsed.data,
		error: null,
	};
}
