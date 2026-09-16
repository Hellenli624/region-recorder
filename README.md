Language: EN | [简中](README.zh-CN.md)

# region-recorder

> **Fork notice:** This repository is a modified copy of
> [Recordly](https://github.com/webadderallorg/Recordly) by webadderallorg, published under the same
> AGPLv3 license (see [LICENSE.md](LICENSE.md)). The changes below are **not** part of the upstream
> project. All credit for the original project goes to the Recordly authors; the Recordly name and
> branding are not used as the name of this fork.

A desktop screen recorder and editor (Windows / macOS / Linux) with three additions on top of
upstream Recordly:

| Added in this fork | What it does |
| --- | --- |
| **Custom recording region** | Drag a rectangle over the selected screen or window and record only that area |
| **Removed-range markers** | Sections that were cut out are shown as red `Trim` blocks on the timeline |
| **Tuned webcam shadow** | Deep-rose (`#881337`) shadow with a much tighter spread around the webcam bubble |

---

## 1. Custom recording region

**How to use**

1. Open the source selector in the recording bar.
2. Pick **Custom region** (its own section at the bottom of the list).
3. Drag a rectangle over the screen or window you selected, then press **Enter** (or click
   **Confirm**). `Esc` cancels.
4. Record as usual. The region applies to that single take and is cleared afterwards.

**How it works** — the selected screen or window is captured with the normal native capture path, and
when you stop, the finished take is cropped down to your rectangle with FFmpeg. Capture quality,
system audio, microphone and cursor telemetry keep working unchanged. Because the crop happens after
the stop, expect a short processing step before the editor opens.

**Limitations**

- The crop relies on the native capture path (the default on Windows and macOS). If a machine falls
  back to browser capture, the region is not applied.
- The app itself is still branded with the upstream Recordly name; this fork does not rebrand it.

## 2. Removed-range markers on the timeline

Split a clip (`C`), then delete the middle part (`Delete` or `Ctrl+D`). The removed range is now shown
as an inert red `Trim` block in the clip lane instead of an empty gap. It cannot be dragged, resized
or selected, and playback plus export skip the removed range automatically.

## 3. Webcam bubble shadow

The webcam bubble uses a deep-rose shadow (`rgb(136, 19, 55)`, `#881337`) with a much tighter spread
than upstream. It is generated in a single place, so the editor preview and the exported video always
match. The canvas/video shadow keeps its default black.

---

## Requirements

| Platform | Minimum | Notes |
| --- | --- | --- |
| **Windows** | Windows 10 build 19041+ | Native Windows Graphics Capture (WGC) helper |
| **macOS** | 14.0 (Sonoma) | ScreenCaptureKit audio and microphone capture |
| **Linux** | Any modern distro | Electron capture; system audio usually needs PipeWire |

## Development

```bash
git clone https://github.com/Hellenli624/region-recorder.git
cd region-recorder
npm install
npm run dev
```

Type-check and tests (verified in this fork: `tsc` clean, 1098 tests passing):

```bash
npx tsc --noEmit
npm test
```

Packaged builds:

```bash
npm run build        # also builds the native helpers
npm run build:win
npm run build:mac
npm run build:linux
```

Prebuilt native helpers are already committed under `electron/native/bin/`, so you only need the
native toolchain (Visual Studio 2022 + CMake on Windows) if you want to rebuild them yourself.
`pnpm` works as an alternative to `npm`.

## Syncing with upstream

This fork was published from a snapshot, so its history has no common ancestor with upstream. The
first sync is a one-off:

```bash
git remote add upstream https://github.com/webadderallorg/Recordly.git   # only if missing
git fetch upstream
git merge upstream/main --allow-unrelated-histories
```

After that first merge the histories are connected and later syncs behave normally.

## License

AGPLv3 — see [LICENSE.md](LICENSE.md). The upstream terms also require keeping the attribution above
and **not** using the "Recordly" name or branding as the name of this project.

## Credits

Original project: [Recordly](https://github.com/webadderallorg/Recordly) by webadderallorg.
