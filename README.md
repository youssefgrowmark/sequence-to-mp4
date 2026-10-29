# Sequence to MP4 — Web MP4 Optimization Studio

> Turn heavyweight 3D and image render sequences into ultra-lightweight, zero-stutter MP4s engineered specifically for high-performance websites and interactive scroll animations.

Dedicated offline desktop application for converting numbered image sequences (PNG, JPG, WebP, BMP, TIFF) into compressed `.mp4` videos built for smooth web playback, instant progressive streaming, and zero-latency browser scrubbing. No FFmpeg commands to learn, no web-hostile exports from an editing suite: the studio optimizes for web delivery from the start.

A free tool from [Growmark](https://growmark.site/resources.html#sequence-to-mp4).

## Download

**Windows:** get `Sequence-to-MP4-<version>-portable.exe` from the [latest release](https://github.com/youssefgrowmark/sequence-to-mp4/releases/latest). It is a single portable app with FFmpeg built in: no installer, no account, nothing uploaded. Windows SmartScreen may warn that the app is unsigned; choose **More info → Run anyway**.

**macOS / Linux / from source:** clone this repo and follow [Quick Start](#4-quick-start--commands) below. You can also run it as a local web app in your browser with `npm run dev:ui`.

## Why it exists

1. **Built for web and scroll scrubbing, not generic editing.** Zero B-frame latency (`-bf 0`), dense keyframes (GOP 4 or all-intra), closed GOPs for a seamless `<video loop>`, and `-tune fastdecode` for GSAP ScrollTrigger and canvas scrubbing.
2. **Scrub simulator and code generator.** Test the encoded file in Chromium's own `<video>` engine, then copy a ready `<video>` tag and `requestAnimationFrame` scroll-binding code.
3. **Four-pillar estimate before you encode.** Payload efficiency, visual fidelity, loading speed (4G / Wi-Fi) and playback smoothness, scored live as you change settings.
4. **Web-safe colour and file layout by default.** `+faststart`, `yuv420p` with explicit BT.709 tags (no Safari vs Chrome gamma drift), silent tracks stripped (`-an`), and luma micro-sharpening against 4:2:0 softening.
5. **Local, offline, private.** No cloud, no subscription, no upload caps.

---

## 1. Core Architecture & Three Configurable Areas

### Area 1: Web Optimization
- **Faststart Progressive Streaming (`-movflags +faststart`)**: Relocates the MP4 `moov` atom index to the head of the file so browsers begin playback immediately while downloading.
- **Universal Pixel Format & Web Color (`-vf format=yuv420p -colorspace bt709`)**: Enforces 4:2:0 planar chroma subsampling and explicit BT.709 color tags to guarantee hardware decoding on Safari, iOS, Chrome, and Firefox without gamma drift.
- **Seamless Web Looping (`-flags +cgop -sc_threshold 0`)**: Enforces closed GOP boundaries and optional duplicate boundary frame trimming (`N-1`) to eliminate `<video loop>` repeat stutter.
- **Strip Empty Audio Tracks (`-an`)**: Removes empty audio container headers to minimize payload overhead and satisfy browser muted autoplay policies.
- **H.264 Decoder Compatibility Profile (`-profile:v high|main|baseline`)**: Balances CABAC compression savings against low-power mobile decode compatibility.
- **HTML5 `<video>` & Scroll-Scrubbing Snippet Generator**: Generates ready-to-paste HTML5 and `requestAnimationFrame` scroll-binding code tailored to your active export settings.

### Area 2: Video Quality
- **MP4 Video Codecs**: Supports `H.264 / AVC (libx264)` for 99.9% universal browser compatibility, `H.265 / HEVC (libx265 + hvc1)` for Apple/Safari high-efficiency MP4s, and `AV1 (SVT-AV1 / AOM-AV1)` for next-generation MP4 compression.
- **Resolution & Resampling Filter (`Lanczos`, `Bicubic`, `Bilinear`)**: Presets (`100%`, `75%`, `50%`, `25%`, `1080p`, `720p`, `Custom`) with automatic even-integer clamping required by `yuv420p` encoders.
- **Frame Rate (FPS)**: Quick presets (`12`, `24`, `25`, `30`, `60`) and custom FPS with real-time duration calculation.
- **Rate Control & Bitrate / Compression Level**:
  - **Constrained CRF (`-crf` + `-maxrate` / `-bufsize`)**: Perceptual quality targeting with a peak network bandwidth cap.
  - **Pure CRF (`14–34`)**: Constant perceptual quality from Studio Master (`14–17`) to Ultra-Compact (`26–34`).
  - **Target Bitrate (`-b:v` + `-maxrate`)**: Strict data-rate targeting in Mbps.

### Area 3: Advanced Performance Tuning
- **Keyframe Interval / GOP Length (`-g` & `-keyint_min`)**: Configurable from `Every Frame (1 - All-Intra)` and `Ultra-Short (4 frames)` for instant scroll-scrubbing up to `1s`, `2s`, `4s`, or custom frame intervals for high compression density.
- **Bi-Directional Predicted Frames (`-bf 0..4`)**: Set to `0` to eliminate frame-reordering decode latency during backwards/forwards scroll scrubbing, or `2–3` to save 10–15% file size on linear videos.
- **Encoder Compression Efficiency Preset (`ultrafast` to `veryslow`)**: Controls motion-search effort to shrink file size without affecting browser decode speed.
- **Psychovisual & Decoder Tuning (`-tune`)**: `fastdecode` (accelerates mobile/scroll decoding), `animation` (flat colors & crisp vectors), `film` (3D renders & lighting gradients), and `zerolatency`.
- **Post-Scale Edge Micro-Sharpening (`unsharp=3:3:0.35:3:3:0.0`)**: Subtle luma-only sharpening to counteract 4:2:0 chroma subsampling softness.
- **Multi-Pass Bitrate Analysis (`2-Pass Encoding`)**: Two-pass complexity analysis for optimal bit distribution.

---

## 2. Performance-Oriented Web Use-Case Presets

1. **Website Hero Animation (`hero-animation`)**: Crisp above-the-fold centerpiece (`CRF 20`, `6 Mbps` cap, `1s` GOP, `slow` preset, `Faststart`, `BT.709`).
2. **Scroll-Driven Sequence (`scroll-driven`)**: Engineered for GSAP ScrollTrigger & JS `video.currentTime` scrubbing (`Every 4 Frames` GOP, `0 B-Frames`, `-tune fastdecode`, `CRF 21`).
3. **Background Ambient Video (`background-video`)**: Ultra-lightweight ambient loop (`75%` scale, `CRF 26`, `2.5 Mbps` cap, `2s` GOP, `3 B-Frames`, luma edge sharpening).
4. **High-Quality Presentation (`visual-presentation`)**: Studio-grade showcase (`CRF 17` near-lossless, `12 Mbps` ceiling, `slower` preset, `2-Pass`, `-tune film`).

---

## 3. Real-Time Previews & MP4 File Size Estimator

- **Real-Time MP4 File Size & 4-Pillar Trade-Off Telemetry**: Instant estimation of output `.mp4` byte size, effective Mbps bitrate, compression ratio vs raw frames, 4G/Wi-Fi load time, and 0–100% scores for **Payload Efficiency**, **Visual Fidelity**, **Loading Speed**, and **Playback Smoothness**.
- **Viewport Preview Modes**:
  - **Source Frame**: Uncompressed 1:1 native sequence inspection.
  - **Simulated MP4**: Real-time preview of target resolution scaling, CRF compression softening, luma sharpening, and BT.709 color.
  - **A/B Split Wipe**: Interactive draggable split-screen comparing Original Source vs Simulated MP4.
  - **Rendered MP4 Player + Scroll-Scrubbing Simulator**: Inspects the actual encoded `.mp4` inside Chromium's `<video>` engine with a dedicated `video.currentTime` scrub slider to test keyframe seeking responsiveness.

---

## 4. Quick Start & Commands

```bash
# Install dependencies
npm install

# Build Electron backend and Vite React UI
npm run build

# Run automated MP4 pipeline verification
node test/test_render.js

# Package the portable Windows app (release/)
npm run dist:win

# Launch desktop application
npm run start
```
