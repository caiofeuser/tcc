import { customType } from "drizzle-orm/pg-core";

export const binary = customType<{
	data: Buffer;
	default: false;
}>({
	dataType() {
		return "bytea";
	},
});
