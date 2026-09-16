import { resetCustomRegionSelection } from "../register/sources";
import { pendingRegionCrop, setPendingRegionCrop } from "../state";
import type { SelectedSource } from "../types";
import { cropRecordedVideoToRegion, sanitizeCaptureRegion } from "./regionCrop";

/**
 * Remembers the region that belongs to the take about to start. The region is
 * stored once so a later source change cannot reshape a running recording.
 */
export function beginRegionCapture(source: SelectedSource | null | undefined) {
	const region =
		source?.sourceType === "custom-region" ? sanitizeCaptureRegion(source.captureRegion) : null;

	setPendingRegionCrop(region);
}

/**
 * Crops a finished recording down to the region selected before it started.
 * Cropping is best effort: a failure keeps the full-frame take rather than
 * losing the recording.
 */
export async function applyPendingRegionCrop(videoPath: string): Promise<boolean> {
	if (!pendingRegionCrop) {
		return false;
	}

	try {
		return await cropRecordedVideoToRegion(videoPath, pendingRegionCrop);
	} catch (error) {
		console.warn("[region-crop] Failed to crop the recording to the selected region:", error);
		return false;
	}
}

/**
 * Region selections apply to exactly one take. Clearing the selection keeps the
 * underlying screen/window selected so the next recording can start normally.
 */
export function endRegionCapture() {
	setPendingRegionCrop(null);
	resetCustomRegionSelection();
}
