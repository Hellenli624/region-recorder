import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** A region expressed as fractions (0..1) of the captured source. */
export type CaptureRegion = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type PixelRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/**
 * A selection smaller than this share of the source is treated as an
 * accidental click instead of a deliberate region.
 */
const MIN_REGION_FRACTION = 0.02;

/** H.264 needs even crop offsets and even dimensions for 4:2:0 chroma. */
const CROP_ALIGNMENT = 2;

/** Containers the region crop knows how to re-encode into. */
const CROPPABLE_VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mov", ".mkv"]);

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * Normalizes an untrusted region payload into a region that stays inside the
 * source. Returns null when the payload is malformed or too small to be a
 * deliberate selection.
 */
export function sanitizeCaptureRegion(region: unknown): CaptureRegion | null {
	if (!region || typeof region !== "object") {
		return null;
	}

	const candidate = region as Partial<CaptureRegion>;
	if (
		!isFiniteNumber(candidate.x) ||
		!isFiniteNumber(candidate.y) ||
		!isFiniteNumber(candidate.width) ||
		!isFiniteNumber(candidate.height)
	) {
		return null;
	}

	const x = clamp(candidate.x, 0, 1);
	const y = clamp(candidate.y, 0, 1);
	const width = Math.min(clamp(candidate.width, 0, 1), 1 - x);
	const height = Math.min(clamp(candidate.height, 0, 1), 1 - y);

	if (width < MIN_REGION_FRACTION || height < MIN_REGION_FRACTION) {
		return null;
	}

	return { x, y, width, height };
}

/**
 * Converts a fractional region into an even-aligned pixel rectangle for
 * FFmpeg's crop filter. Returns null when the region covers the whole frame or
 * collapses to nothing at the recorded resolution.
 */
export function computeRegionCropRect({
	region,
	videoWidth,
	videoHeight,
}: {
	region: CaptureRegion;
	videoWidth: number;
	videoHeight: number;
}): PixelRect | null {
	if (
		!isFiniteNumber(videoWidth) ||
		!isFiniteNumber(videoHeight) ||
		videoWidth <= 0 ||
		videoHeight <= 0
	) {
		return null;
	}

	const alignDown = (value: number) =>
		Math.floor(value / CROP_ALIGNMENT) * CROP_ALIGNMENT;

	const x = clamp(
		alignDown(region.x * videoWidth),
		0,
		Math.max(0, alignDown(videoWidth) - CROP_ALIGNMENT),
	);
	const y = clamp(
		alignDown(region.y * videoHeight),
		0,
		Math.max(0, alignDown(videoHeight) - CROP_ALIGNMENT),
	);

	const maxWidth = alignDown(videoWidth - x);
	const maxHeight = alignDown(videoHeight - y);

	const rect: PixelRect = {
		x,
		y,
		width: clamp(alignDown(region.width * videoWidth), 0, maxWidth),
		height: clamp(alignDown(region.height * videoHeight), 0, maxHeight),
	};

	if (rect.width < CROP_ALIGNMENT || rect.height < CROP_ALIGNMENT) {
		return null;
	}

	if (rect.x === 0 && rect.y === 0 && rect.width === videoWidth && rect.height === videoHeight) {
		return null;
	}

	return rect;
}

/**
 * Reads the coded frame size out of FFmpeg's stream banner, e.g.
 * `Stream #0:0: Video: h264 ..., 1920x1080, 30 fps`.
 */
export function parseFfmpegVideoDimensions(stderr: string): { width: number; height: number } | null {
	if (!stderr) {
		return null;
	}

	const videoLine = stderr
		.split(/\r?\n/)
		.find((line) => /Stream #\d+:\d+.*Video:/.test(line));
	if (!videoLine) {
		return null;
	}

	const match = videoLine.match(/(\d{2,5})x(\d{2,5})/);
	if (!match) {
		return null;
	}

	const width = Number.parseInt(match[1], 10);
	const height = Number.parseInt(match[2], 10);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		return null;
	}

	return { width, height };
}

export function isCroppableVideoPath(videoPath: string): boolean {
	const extension = videoPath.slice(videoPath.lastIndexOf(".")).toLowerCase();
	return CROPPABLE_VIDEO_EXTENSIONS.has(extension);
}

async function probeVideoDimensions(ffmpegPath: string, videoPath: string) {
	const result = await execFileAsync(
		ffmpegPath,
		["-hide_banner", "-nostdin", "-i", videoPath, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"],
		{ timeout: 60000, maxBuffer: 20 * 1024 * 1024 },
	).catch((error: { stderr?: string }) => ({ stdout: "", stderr: error.stderr ?? "" }));

	const dimensions = parseFfmpegVideoDimensions(result.stderr ?? "");
	if (!dimensions) {
		throw new Error(`Could not determine video dimensions for ${videoPath}`);
	}

	return dimensions;
}

/**
 * Re-encodes `videoPath` so only `region` remains, then replaces the original
 * file. Audio (when present) is stream-copied so sidecar/sync behaviour is
 * preserved. Returns true when the file was actually rewritten.
 */
export async function cropRecordedVideoToRegion(
	videoPath: string,
	region: CaptureRegion,
	options?: { ffmpegPath?: string },
): Promise<boolean> {
	const safeRegion = sanitizeCaptureRegion(region);
	if (!safeRegion) {
		return false;
	}

	if (!isCroppableVideoPath(videoPath)) {
		console.warn(
			`[region-crop] Skipping region crop for unsupported container: ${videoPath}`,
		);
		return false;
	}

	const ffmpegPath =
		options?.ffmpegPath ??
		(await import("../ffmpeg/binary")).getFfmpegBinaryPath();
	const { width, height } = await probeVideoDimensions(ffmpegPath, videoPath);
	const cropRect = computeRegionCropRect({
		region: safeRegion,
		videoWidth: width,
		videoHeight: height,
	});

	if (!cropRect) {
		return false;
	}

	const lastDot = videoPath.lastIndexOf(".");
	const tempPath = `${videoPath.slice(0, lastDot)}.region-tmp${videoPath.slice(lastDot)}`;

	try {
		await execFileAsync(
			ffmpegPath,
			[
				"-y",
				"-hide_banner",
				"-nostdin",
				"-nostats",
				"-i",
				videoPath,
				"-map",
				"0:v:0",
				"-map",
				"0:a?",
				"-vf",
				`crop=${cropRect.width}:${cropRect.height}:${cropRect.x}:${cropRect.y}`,
				"-c:v",
				"libx264",
				"-preset",
				"veryfast",
				"-crf",
				"18",
				"-pix_fmt",
				"yuv420p",
				"-c:a",
				"copy",
				"-movflags",
				"+faststart",
				tempPath,
			],
			{ timeout: 1000 * 60 * 30, maxBuffer: 20 * 1024 * 1024 },
		);

		await fs.rename(tempPath, videoPath).catch(async () => {
			await fs.copyFile(tempPath, videoPath);
			await fs.rm(tempPath, { force: true });
		});
	} catch (error) {
		await fs.rm(tempPath, { force: true }).catch(() => undefined);
		throw error;
	}

	console.log(
		`[region-crop] Cropped ${videoPath} to ${cropRect.width}x${cropRect.height} at (${cropRect.x}, ${cropRect.y})`,
	);

	return true;
}
