import { inspect } from "node:util";

export type LogLevel = "debug" | "info" | "success" | "warn" | "error" | "silent";
type EmittedLogLevel = Exclude<LogLevel, "silent">;
export type LogContext = Record<string, unknown> | Error;

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	success: 20,
	warn: 30,
	error: 40,
	silent: Number.POSITIVE_INFINITY,
};

const LEVEL_LABELS: Record<EmittedLogLevel, string> = {
	debug: "debug",
	info: "info ",
	success: "done ",
	warn: "warn ",
	error: "error",
};

const LEVEL_COLORS: Record<EmittedLogLevel, string> = {
	debug: "\u001b[36m",
	info: "\u001b[34m",
	success: "\u001b[32m",
	warn: "\u001b[33m",
	error: "\u001b[31m",
};

const RESET = "\u001b[0m";
const DIM = "\u001b[2m";

function resolveLevel() {
	const rawLevel = process.env.LOG_LEVEL?.toLowerCase();
	if (rawLevel && rawLevel in LOG_LEVELS) return rawLevel as LogLevel;
	return "info";
}

function shouldUseColor() {
	if (process.env.NO_COLOR) return false;
	if (process.env.FORCE_COLOR === "0") return false;
	if (process.env.FORCE_COLOR && process.env.FORCE_COLOR.toLowerCase() !== "false") return true;
	return Boolean(process.stdout.isTTY);
}

function colorize(value: string, color: string) {
	if (!shouldUseColor()) return value;
	return `${color}${value}${RESET}`;
}

function formatDuration(durationMs: number) {
	if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
	return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatValue(value: unknown) {
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	if (typeof value === "string") return /\s/.test(value) ? JSON.stringify(value) : value;
	if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
	if (value === undefined) return undefined;

	return inspect(value, {
		breakLength: Number.POSITIVE_INFINITY,
		colors: shouldUseColor(),
		compact: true,
		depth: 4,
	});
}

function contextEntries(context: LogContext | undefined) {
	if (!context) return [];
	if (context instanceof Error) return [["error", context] as const];

	return Object.entries(context).filter(([, value]) => value !== undefined);
}

function formatContext(context: LogContext | undefined) {
	return contextEntries(context)
		.map(([key, value]) => {
			const formattedValue = formatValue(value);
			return formattedValue ? `${key}=${formattedValue}` : undefined;
		})
		.filter(Boolean)
		.join(" ");
}

function addDuration(context: LogContext | undefined, durationMs: number) {
	const duration = formatDuration(durationMs);
	if (!context) return { duration };
	if (context instanceof Error) return { error: context, duration };

	return { ...context, duration };
}

function logMethod(level: EmittedLogLevel) {
	if (level === "error") return console.error;
	if (level === "warn") return console.warn;
	return console.log;
}

export function createLogger(namespace: string) {
	const minLevel = resolveLevel();

	function shouldLog(level: EmittedLogLevel) {
		return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
	}

	function emit(level: EmittedLogLevel, message: string, context?: LogContext) {
		if (!shouldLog(level)) return;

		const time = colorize(new Date().toLocaleTimeString("en-GB", { hour12: false }), DIM);
		const label = colorize(LEVEL_LABELS[level], LEVEL_COLORS[level]);
		const scope = colorize(namespace, DIM);
		const formattedContext = formatContext(context);
		const suffix = formattedContext ? `  ${formattedContext}` : "";

		logMethod(level)(`${time} ${label} ${scope}  ${message}${suffix}`);
	}

	return {
		debug: (message: string, context?: LogContext) => emit("debug", message, context),
		info: (message: string, context?: LogContext) => emit("info", message, context),
		success: (message: string, context?: LogContext) => emit("success", message, context),
		warn: (message: string, context?: LogContext) => emit("warn", message, context),
		error: (message: string, context?: LogContext) => emit("error", message, context),
		timer: () => {
			const startedAt = performance.now();

			return {
				done: (message: string, context?: LogContext) => {
					emit("success", message, addDuration(context, performance.now() - startedAt));
				},
				fail: (message: string, context?: LogContext) => {
					emit("error", message, addDuration(context, performance.now() - startedAt));
				},
			};
		},
	};
}
