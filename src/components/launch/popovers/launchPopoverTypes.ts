export interface DesktopSource {
	id: string;
	name: string;
	thumbnail: string | null;
	display_id: string;
	appIcon: string | null;
	sourceType?: "screen" | "window" | "custom-region";
	captureRegion?: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	appName?: string;
	windowTitle?: string;
}

/**
 * Check if a source is a screen/display
 */
export function isScreenSource(s: DesktopSource): boolean {
	return s.sourceType === "screen" || s.id.startsWith("screen:");
}

/**
 * Check if a source is an application window
 */
export function isWindowSource(s: DesktopSource): boolean {
	return s.sourceType === "window" || s.id.startsWith("window:");
}

export function mapRawSource(s: DesktopSource): DesktopSource {
	// A custom region keeps its base window id, but its name is what identifies
	// the selection in the HUD, so it must not be replaced by the window title.
	const isCustomRegion = s.sourceType === "custom-region";
	const isWindow = !isCustomRegion && isWindowSource(s);
	const type = s.sourceType ?? (isWindow ? "window" : "screen");
	let displayName = s.name;
	let appName = s.appName;
	if (isWindow && s.windowTitle) {
		displayName = s.windowTitle;
	} else if (isWindow && !appName && s.name.includes(" — ")) {
		const parts = s.name.split(" — ");
		appName = parts[0]?.trim();
		displayName = parts.slice(1).join(" — ").trim() || s.name;
	}
	return {
		id: s.id,
		name: displayName,
		thumbnail: s.thumbnail,
		display_id: s.display_id,
		appIcon: s.appIcon,
		sourceType: type,
		appName,
		windowTitle: s.windowTitle ?? displayName,
		captureRegion: s.captureRegion,
	};
}

export interface DeviceOption {
	deviceId: string;
	label: string;
}
