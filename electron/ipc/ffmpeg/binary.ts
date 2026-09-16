import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { app } from "electron";

const nodeRequire = createRequire(import.meta.url);

export function loadFfmpegStatic(): string | null {
	try {
		const moduleExports = nodeRequire("ffmpeg-static");
		if (typeof moduleExports === "string") {
			return moduleExports;
		}

		if (typeof moduleExports?.default === "string") {
			return moduleExports.default as string;
		}
	} catch {
		// ffmpeg-static not available; fall through to system FFmpeg
	}

	return null;
}

export function loadFfprobeStatic(): string | null {
	try {
		const moduleExports = nodeRequire("ffprobe-static");
		if (typeof moduleExports === "string") {
			return moduleExports;
		}

		if (typeof moduleExports?.path === "string") {
			return moduleExports.path as string;
		}

		if (typeof moduleExports?.default === "string") {
			return moduleExports.default as string;
		}

		if (typeof moduleExports?.default?.path === "string") {
			return moduleExports.default.path as string;
		}
	} catch {
		// ffprobe-static not available; fall through to system FFprobe
	}

	return null;
}

/**
 * Resolves an executable from PATH using Node's own environment strings.
 * Parsing `where`/`which` output instead corrupts non-ASCII install paths on
 * Windows because the console codepage is not UTF-8.
 */
function findBinaryOnPath(binaryName: string): string | null {
	const pathValue = process.env.PATH ?? process.env.Path ?? "";
	const separator = process.platform === "win32" ? ";" : ":";
	const candidates = process.platform === "win32" ? [`${binaryName}.exe`, binaryName] : [binaryName];

	for (const rawEntry of pathValue.split(separator)) {
		const entry = rawEntry.trim().replace(/^"(.*)"$/, "$1");
		if (!entry) {
			continue;
		}

		for (const candidateName of candidates) {
			const candidate = path.join(entry, candidateName);
			if (existsSync(candidate)) {
				return candidate;
			}
		}
	}

	return null;
}

export function resolveSystemFfmpegBinaryPath(): string | null {
	const onPath = findBinaryOnPath("ffmpeg");
	if (onPath) {
		return onPath;
	}

	const locator = process.platform === "win32" ? "where" : "which";
	const result = spawnSync(locator, ["ffmpeg"], {
		encoding: "utf-8",
		windowsHide: true,
	});

	if (result.status === 0) {
		const candidate = result.stdout
			.split(/\r?\n/)
			.map((line: string) => line.trim())
			.find((line: string) => line.length > 0);

		if (candidate) {
			return candidate;
		}
	}

	// Fallback: check common install paths directly (Electron's shell may lack full PATH)
	if (process.platform !== "win32") {
		const commonPaths = [
			"/opt/homebrew/bin/ffmpeg",
			"/usr/local/bin/ffmpeg",
			"/usr/bin/ffmpeg",
		];
		for (const p of commonPaths) {
			if (existsSync(p)) {
				return p;
			}
		}
	}

	return null;
}

export function resolveSystemFfprobeBinaryPath(): string | null {
	const onPath = findBinaryOnPath("ffprobe");
	if (onPath) {
		return onPath;
	}

	const locator = process.platform === "win32" ? "where" : "which";
	const result = spawnSync(locator, ["ffprobe"], {
		encoding: "utf-8",
		windowsHide: true,
	});

	if (result.status === 0) {
		const candidate = result.stdout
			.split(/\r?\n/)
			.map((line: string) => line.trim())
			.find((line: string) => line.length > 0);

		if (candidate) {
			return candidate;
		}
	}

	if (process.platform !== "win32") {
		const commonPaths = [
			"/opt/homebrew/bin/ffprobe",
			"/usr/local/bin/ffprobe",
			"/usr/bin/ffprobe",
		];
		for (const p of commonPaths) {
			if (existsSync(p)) {
				return p;
			}
		}
	}

	return null;
}

export function getFfmpegBinaryPath(): string {
	const ffmpegStatic = loadFfmpegStatic();
	if (ffmpegStatic && typeof ffmpegStatic === "string") {
		const bundledPath = app.isPackaged
			? ffmpegStatic.replace(/\.asar([/\\])/, ".asar.unpacked$1")
			: ffmpegStatic;

		if (existsSync(bundledPath)) {
			return bundledPath;
		}
	}

	const systemFfmpeg = resolveSystemFfmpegBinaryPath();
	if (systemFfmpeg) {
		return systemFfmpeg;
	}

	throw new Error(
		"FFmpeg binary is unavailable. Install ffmpeg-static for this platform or make ffmpeg available on PATH.",
	);
}

export function getFfprobeBinaryPath(): string {
	const ffprobeStatic = loadFfprobeStatic();
	if (ffprobeStatic && typeof ffprobeStatic === "string") {
		const bundledPath = app.isPackaged
			? ffprobeStatic.replace(/\.asar([/\\])/, ".asar.unpacked$1")
			: ffprobeStatic;

		if (existsSync(bundledPath)) {
			return bundledPath;
		}
	}

	const systemFfprobe = resolveSystemFfprobeBinaryPath();
	if (systemFfprobe) {
		return systemFfprobe;
	}

	throw new Error(
		"FFprobe binary is unavailable. Install ffprobe-static for this platform or make ffprobe available on PATH.",
	);
}
