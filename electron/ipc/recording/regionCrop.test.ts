import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
	computeRegionCropRect,
	cropRecordedVideoToRegion,
	parseFfmpegVideoDimensions,
	sanitizeCaptureRegion,
} from "./regionCrop";

const execFileAsync = promisify(execFile);

function findSystemFfmpeg(): string | null {
	// Scan PATH directly: `where` output is not UTF-8 on Windows and corrupts
	// non-ASCII install locations.
	const pathValue = process.env.PATH ?? process.env.Path ?? "";
	const separator = process.platform === "win32" ? ";" : ":";
	const names = process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"];

	for (const rawEntry of pathValue.split(separator)) {
		const entry = rawEntry.trim().replace(/^"(.*)"$/, "$1");
		if (!entry) {
			continue;
		}

		for (const name of names) {
			const candidate = path.join(entry, name);
			if (existsSync(candidate)) {
				return candidate;
			}
		}
	}

	return null;
}

describe("sanitizeCaptureRegion", () => {
	it("keeps a valid fractional region", () => {
		expect(sanitizeCaptureRegion({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 })).toEqual({
			x: 0.25,
			y: 0.5,
			width: 0.5,
			height: 0.25,
		});
	});

	it("rejects malformed payloads", () => {
		expect(sanitizeCaptureRegion(null)).toBeNull();
		expect(sanitizeCaptureRegion({ x: 0, y: 0, width: 0.5 })).toBeNull();
		expect(sanitizeCaptureRegion({ x: 0, y: 0, width: "0.5", height: 0.5 })).toBeNull();
		expect(sanitizeCaptureRegion({ x: 0, y: 0, width: Number.NaN, height: 0.5 })).toBeNull();
	});

	it("rejects stray clicks that are too small to be a region", () => {
		expect(sanitizeCaptureRegion({ x: 0.1, y: 0.1, width: 0.005, height: 0.4 })).toBeNull();
	});

	it("clamps a region that runs past the source edges", () => {
		const region = sanitizeCaptureRegion({ x: 0.8, y: 0.9, width: 0.5, height: 0.5 });

		expect(region?.x).toBeCloseTo(0.8, 10);
		expect(region?.y).toBeCloseTo(0.9, 10);
		expect(region?.width).toBeCloseTo(0.2, 10);
		expect(region?.height).toBeCloseTo(0.1, 10);
	});
});

describe("computeRegionCropRect", () => {
	it("maps a fractional region onto even pixel bounds", () => {
		expect(
			computeRegionCropRect({
				region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
				videoWidth: 1920,
				videoHeight: 1080,
			}),
		).toEqual({ x: 480, y: 270, width: 960, height: 540 });
	});

	it("returns null when the region covers the whole frame", () => {
		expect(
			computeRegionCropRect({
				region: { x: 0, y: 0, width: 1, height: 1 },
				videoWidth: 1280,
				videoHeight: 720,
			}),
		).toBeNull();
	});

	it("keeps odd dimensions and offsets even for chroma subsampling", () => {
		const rect = computeRegionCropRect({
			region: { x: 0.101, y: 0.203, width: 0.333, height: 0.417 },
			videoWidth: 1921,
			videoHeight: 1081,
		});

		expect(rect).not.toBeNull();
		expect((rect?.x ?? 0) % 2).toBe(0);
		expect((rect?.y ?? 0) % 2).toBe(0);
		expect((rect?.width ?? 0) % 2).toBe(0);
		expect((rect?.height ?? 0) % 2).toBe(0);
		expect((rect?.x ?? 0) + (rect?.width ?? 0)).toBeLessThanOrEqual(1921);
		expect((rect?.y ?? 0) + (rect?.height ?? 0)).toBeLessThanOrEqual(1081);
	});

	it("returns null for a degenerate resolution", () => {
		expect(
			computeRegionCropRect({
				region: { x: 0, y: 0, width: 0.5, height: 0.5 },
				videoWidth: 0,
				videoHeight: 0,
			}),
		).toBeNull();
	});
});

describe("parseFfmpegVideoDimensions", () => {
	it("reads the coded size from FFmpeg's stream banner", () => {
		const stderr = [
			"Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'recording.mp4':",
			"  Duration: 00:00:03.02, start: 0.000000, bitrate: 4211 kb/s",
			"  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080, 60 fps, 60 tbr, 15360 tbn",
		].join("\n");

		expect(parseFfmpegVideoDimensions(stderr)).toEqual({ width: 1920, height: 1080 });
	});

	it("returns null when no video stream is present", () => {
		expect(parseFfmpegVideoDimensions("Output #0, null, to 'pipe:':")).toBeNull();
		expect(parseFfmpegVideoDimensions("")).toBeNull();
	});
});

describe("cropRecordedVideoToRegion", () => {
	it("rewrites a recording so only the selected region remains", async () => {
		const ffmpegPath = findSystemFfmpeg();
		if (!ffmpegPath) {
			console.warn("Skipping region crop integration test: ffmpeg is not on PATH.");
			return;
		}

		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-region-"));
		const videoPath = path.join(tempDir, "sample.mp4");

		try {
			await execFileAsync(ffmpegPath, [
				"-y",
				"-hide_banner",
				"-nostdin",
				"-f",
				"lavfi",
				"-i",
				"testsrc=size=640x480:rate=15:duration=1",
				"-pix_fmt",
				"yuv420p",
				"-c:v",
				"libx264",
				videoPath,
			]);

			const cropped = await cropRecordedVideoToRegion(
				videoPath,
				{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
				{ ffmpegPath },
			);

			expect(cropped).toBe(true);

			const { stderr } = await execFileAsync(
				ffmpegPath,
				["-hide_banner", "-nostdin", "-i", videoPath],
				{ maxBuffer: 10 * 1024 * 1024 },
			).catch((error: { stderr?: string }) => ({ stdout: "", stderr: error.stderr ?? "" }));

			expect(parseFfmpegVideoDimensions(stderr ?? "")).toEqual({ width: 320, height: 240 });
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	}, 120000);

	it("leaves the recording untouched when the region covers everything", async () => {
		const ffmpegPath = findSystemFfmpeg();
		if (!ffmpegPath) {
			return;
		}

		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-region-full-"));
		const videoPath = path.join(tempDir, "sample.mp4");

		try {
			await execFileAsync(ffmpegPath, [
				"-y",
				"-hide_banner",
				"-nostdin",
				"-f",
				"lavfi",
				"-i",
				"testsrc=size=320x240:rate=15:duration=1",
				"-pix_fmt",
				"yuv420p",
				"-c:v",
				"libx264",
				videoPath,
			]);

			const cropped = await cropRecordedVideoToRegion(
				videoPath,
				{ x: 0, y: 0, width: 1, height: 1 },
				{ ffmpegPath },
			);

			expect(cropped).toBe(false);
		} finally {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	}, 120000);
});
