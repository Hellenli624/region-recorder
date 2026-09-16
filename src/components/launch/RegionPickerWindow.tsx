import { useCallback, useEffect, useRef, useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";

type Rect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/** Selections smaller than this (in CSS px) are treated as stray clicks. */
const MIN_SELECTION_PX = 12;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function rectFromPoints(
	start: { x: number; y: number },
	end: { x: number; y: number },
): Rect {
	return {
		x: Math.min(start.x, end.x),
		y: Math.min(start.y, end.y),
		width: Math.abs(end.x - start.x),
		height: Math.abs(end.y - start.y),
	};
}

/**
 * Full-screen overlay used to drag out the recording region. The window is
 * sized to the source being recorded, so the drawn rectangle maps directly onto
 * the captured screen or window.
 */
export default function RegionPickerWindow() {
	const t = useScopedT("launch");
	const [selection, setSelection] = useState<Rect | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const startRef = useRef<{ x: number; y: number } | null>(null);
	const selectionRef = useRef<Rect | null>(null);

	useEffect(() => {
		selectionRef.current = selection;
	}, [selection]);

	const toLocalPoint = useCallback((clientX: number, clientY: number) => {
		return {
			x: clamp(clientX, 0, window.innerWidth),
			y: clamp(clientY, 0, window.innerHeight),
		};
	}, []);

	const confirmSelection = useCallback(() => {
		const current = selectionRef.current;
		if (!current || current.width < MIN_SELECTION_PX || current.height < MIN_SELECTION_PX) {
			return;
		}

		window.electronAPI.confirmCustomRegion(current);
	}, []);

	const cancelSelection = useCallback(() => {
		window.electronAPI.cancelCustomRegion();
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				cancelSelection();
			} else if (event.key === "Enter") {
				event.preventDefault();
				confirmSelection();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [cancelSelection, confirmSelection]);

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) {
			return;
		}

		const point = toLocalPoint(event.clientX, event.clientY);
		startRef.current = point;
		setIsDragging(true);
		setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!startRef.current) {
			return;
		}

		setSelection(rectFromPoints(startRef.current, toLocalPoint(event.clientX, event.clientY)));
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!startRef.current) {
			return;
		}

		const rect = rectFromPoints(startRef.current, toLocalPoint(event.clientX, event.clientY));
		startRef.current = null;
		setIsDragging(false);

		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {
			// Pointer capture may already be released by the browser.
		}

		if (rect.width < MIN_SELECTION_PX || rect.height < MIN_SELECTION_PX) {
			// Treat a stray click as "start over" instead of confirming a sliver.
			setSelection(null);
			return;
		}

		setSelection(rect);
	};

	const hasUsableSelection =
		!!selection &&
		selection.width >= MIN_SELECTION_PX &&
		selection.height >= MIN_SELECTION_PX;

	return (
		<div
			className="fixed inset-0 select-none overflow-hidden"
			style={{ cursor: "crosshair", background: "transparent", touchAction: "none" }}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
		>
			{!hasUsableSelection && (
				<div className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} />
			)}

			{hasUsableSelection && selection && (
				<div
					className="pointer-events-none absolute"
					style={{
						left: selection.x,
						top: selection.y,
						width: selection.width,
						height: selection.height,
						border: "2px solid #2563EB",
						borderRadius: 4,
						background: "rgba(37,99,235,0.10)",
						boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
					}}
				/>
			)}

			{hasUsableSelection && selection && (
				<div
					className="pointer-events-none absolute rounded-md bg-black/75 px-2 py-1 text-xs font-medium text-white"
					style={{
						left: selection.x,
						top: Math.max(8, selection.y - 28),
					}}
				>
					{Math.round(selection.width)} × {Math.round(selection.height)}
				</div>
			)}

			<div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-lg bg-black/75 px-4 py-2 text-center text-sm text-white shadow-lg">
				{t("sourceSelector.regionPickerHint", "Drag to select the recording area")}
			</div>

			<div
				className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-black/75 px-3 py-2 shadow-xl"
				onPointerDown={(event) => event.stopPropagation()}
				onPointerMove={(event) => event.stopPropagation()}
				onPointerUp={(event) => event.stopPropagation()}
			>
				<button
					type="button"
					onClick={cancelSelection}
					className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
				>
					{t("sourceSelector.cancel", "Cancel")}
				</button>
				<button
					type="button"
					disabled={!hasUsableSelection || isDragging}
					onClick={confirmSelection}
					className="rounded-lg bg-[#2563EB] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/45"
				>
					{t("sourceSelector.regionConfirm", "Confirm")}
				</button>
			</div>
		</div>
	);
}
