import { ExportSettings, UseCasePresetId } from '../../electron/types';

export interface UseCasePresetDefinition {
  id: Exclude<UseCasePresetId, 'custom'>;
  name: string;
  shortLabel: string;
  badge: string;
  description: string;
  keyHighlights: string[];
  recommendedFor: string;
  apply: (prev: ExportSettings) => ExportSettings;
}

export interface SettingGuidance {
  id: string;
  title: string;
  cliFlag: string;
  whatItDoes: string;
  impact: string;
  whenToUse: string;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  useCasePreset: 'hero-animation',
  format: 'mp4',
  codec: 'libx264',
  scale: '100',
  customWidth: 1920,
  customHeight: 1080,
  aspectRatioLocked: true,
  scalingAlgorithm: 'lanczos',
  targetFramerate: 24,
  rateControlMode: 'crf-constrained',
  crf: 20,
  targetBitrateMbps: 4.5,
  maxBitrateMbps: 6.0,
  webOptimizations: {
    faststart: true,
    seamlessLooping: true,
    dropDuplicateEndFrame: false,
    forceYuv420p: true,
    stripAudio: true,
    h264Profile: 'high',
  },
  preset: 'slow',
  keyframeMode: '1s',
  customKeyintFrames: 24,
  bFrames: 2,
  tune: 'none',
  twoPass: false,
  sharpenOutput: false,
  inPoint: 0,
  outPoint: 0,
  outputDirectory: '',
  filenameTemplate: '{name}_{preset}_{fps}fps_{resolution}_{quality}',
};

export const USE_CASE_PRESETS: UseCasePresetDefinition[] = [
  {
    id: 'hero-animation',
    name: 'Website Hero Animation',
    shortLabel: 'Hero Animation',
    badge: 'Balanced Web Centerpiece',
    description:
      'High visual clarity with instant progressive streaming and capped peak bandwidth for above-the-fold landing page animations.',
    keyHighlights: ['CRF 20 + 6 Mbps Cap', '1s Keyframes', 'Faststart + BT.709'],
    recommendedFor: 'Above-the-fold product reveals, landing page headers, and interactive brand loops.',
    apply: (prev) => ({
      ...prev,
      useCasePreset: 'hero-animation',
      format: 'mp4',
      codec: 'libx264',
      scale: '100',
      scalingAlgorithm: 'lanczos',
      rateControlMode: 'crf-constrained',
      crf: 20,
      targetBitrateMbps: 4.5,
      maxBitrateMbps: 6.0,
      preset: 'slow',
      keyframeMode: '1s',
      bFrames: 2,
      tune: 'none',
      twoPass: false,
      sharpenOutput: false,
      webOptimizations: {
        ...prev.webOptimizations,
        faststart: true,
        seamlessLooping: true,
        forceYuv420p: true,
        stripAudio: true,
        h264Profile: 'high',
      },
    }),
  },
  {
    id: 'scroll-driven',
    name: 'Scroll-Driven Sequence',
    shortLabel: 'Scroll Scrubbing',
    badge: 'Zero-Latency Seeking',
    description:
      'Engineered for GSAP ScrollTrigger and JS video.currentTime scrubbing with dense keyframes, zero B-frames, and fast hardware decode.',
    keyHighlights: ['Every 4 Frames GOP', '0 B-Frames', 'Fastdecode Tune'],
    recommendedFor: 'Apple-style scroll-bound 3D sequences, interactive timelines, and pointer-scrubbed videos.',
    apply: (prev) => ({
      ...prev,
      useCasePreset: 'scroll-driven',
      format: 'mp4',
      codec: 'libx264',
      scale: '100',
      scalingAlgorithm: 'lanczos',
      rateControlMode: 'crf-constrained',
      crf: 21,
      targetBitrateMbps: 5.5,
      maxBitrateMbps: 8.0,
      preset: 'fast',
      keyframeMode: 'ultra-short',
      customKeyintFrames: 4,
      bFrames: 0,
      tune: 'fastdecode',
      twoPass: false,
      sharpenOutput: false,
      webOptimizations: {
        ...prev.webOptimizations,
        faststart: true,
        seamlessLooping: true,
        forceYuv420p: true,
        stripAudio: true,
        h264Profile: 'high',
      },
    }),
  },
  {
    id: 'background-video',
    name: 'Background Ambient Video',
    shortLabel: 'Background Loop',
    badge: 'Ultra-Lightweight',
    description:
      'Prioritizes minimal payload size and low mobile battery/CPU usage for full-bleed ambient loops behind text or UI overlays.',
    keyHighlights: ['CRF 26 + 2.5 Mbps Cap', '75% Scale + Luma Sharpen', '2s Long GOP'],
    recommendedFor: 'Ambient section backgrounds, atmospheric textures, and mobile-first web pages.',
    apply: (prev) => ({
      ...prev,
      useCasePreset: 'background-video',
      format: 'mp4',
      codec: 'libx264',
      scale: '75',
      scalingAlgorithm: 'lanczos',
      rateControlMode: 'crf-constrained',
      crf: 26,
      targetBitrateMbps: 1.8,
      maxBitrateMbps: 2.5,
      preset: 'slow',
      keyframeMode: '2s',
      bFrames: 3,
      tune: 'none',
      twoPass: false,
      sharpenOutput: true,
      webOptimizations: {
        ...prev.webOptimizations,
        faststart: true,
        seamlessLooping: true,
        forceYuv420p: true,
        stripAudio: true,
        h264Profile: 'high',
      },
    }),
  },
  {
    id: 'visual-presentation',
    name: 'High-Quality Presentation',
    shortLabel: 'Studio Master',
    badge: 'Maximum Fidelity',
    description:
      'Near-lossless encoding with 2-pass bit allocation and high bitrate ceiling to preserve fine 3D lighting gradients and micro-textures.',
    keyHighlights: ['CRF 17 Near-Lossless', '12 Mbps Ceiling', '2-Pass + Slower Preset'],
    recommendedFor: 'Design portfolios, 3D cinema renders, dark gradients, and high-DPI showcase reels.',
    apply: (prev) => ({
      ...prev,
      useCasePreset: 'visual-presentation',
      format: 'mp4',
      codec: 'libx264',
      scale: '100',
      scalingAlgorithm: 'lanczos',
      rateControlMode: 'crf-constrained',
      crf: 17,
      targetBitrateMbps: 8.5,
      maxBitrateMbps: 12.0,
      preset: 'slower',
      keyframeMode: '1s',
      bFrames: 2,
      tune: 'film',
      twoPass: true,
      sharpenOutput: false,
      webOptimizations: {
        ...prev.webOptimizations,
        faststart: true,
        seamlessLooping: true,
        forceYuv420p: true,
        stripAudio: true,
        h264Profile: 'high',
      },
    }),
  },
];

export const SETTING_GUIDANCE: Record<string, SettingGuidance> = {
  // === AREA 1: WEB OPTIMIZATION ===
  faststart: {
    id: 'faststart',
    title: 'Faststart Progressive Streaming (moov Atom)',
    cliFlag: '-movflags +faststart',
    whatItDoes:
      'Moves the MP4 metadata index (moov atom) from the end of the file to the very beginning after encoding finishes.',
    impact:
      'Zero impact on visual quality or file size, but dramatically improves loading speed: browsers can start playing on frame 1 immediately while the rest of the video downloads.',
    whenToUse:
      'Always keep enabled for all web MP4 videos so users never wait for the entire file to download before playback starts.',
  },
  seamlessLooping: {
    id: 'seamlessLooping',
    title: 'Seamless Web Looping (Closed GOP)',
    cliFlag: '-flags +cgop -sc_threshold 0',
    whatItDoes:
      'Enforces closed Group of Pictures (GOP) boundaries and predictable keyframe cadence so the end of the video never references frames across the loop point.',
    impact:
      'Eliminates the micro-freeze or decoder stutter that often happens when HTML5 <video loop> restarts from the last frame back to frame 0.',
    whenToUse:
      'Enable for any repeating hero animation, background video, or cyclical product turnaround.',
  },
  dropDuplicateEndFrame: {
    id: 'dropDuplicateEndFrame',
    title: 'Trim Duplicate Loop Boundary Frame',
    cliFlag: 'slice(inPoint, outPoint - 1)',
    whatItDoes:
      'Automatically excludes the final frame of the sequence when rendering a loop.',
    impact:
      'Prevents a 2-frame pause at the loop seam when your 3D/motion software exported both frame 0 and an identical closing frame N.',
    whenToUse:
      'Enable when your first and last exported frames are visually identical.',
  },
  forceYuv420p: {
    id: 'forceYuv420p',
    title: 'Universal Pixel Format & BT.709 Web Color',
    cliFlag: '-vf format=yuv420p -colorspace bt709',
    whatItDoes:
      'Converts RGB image frames into 4:2:0 planar chroma subsampling and embeds explicit sRGB/BT.709 color primaries and transfer tags.',
    impact:
      'Guarantees hardware decoding on iOS Safari, macOS, Android, and Windows, and prevents washed-out gamma shifts between Chrome and Safari.',
    whenToUse:
      'Always keep enabled for web delivery. Without yuv420p, PNG sequences default to yuv444p which fails to play on Safari and mobile devices.',
  },
  stripAudio: {
    id: 'stripAudio',
    title: 'Strip Empty Audio Container Track',
    cliFlag: '-an',
    whatItDoes:
      'Omits audio track headers and muxing tables from the MP4 container.',
    impact:
      'Saves container overhead and helps satisfy browser autoplay policies (which block unmuted videos with audio tracks).',
    whenToUse:
      'Always keep enabled for image sequence conversions since image sequences contain no audio.',
  },
  h264Profile: {
    id: 'h264Profile',
    title: 'H.264 Decoder Compatibility Profile',
    cliFlag: '-profile:v [baseline|main|high]',
    whatItDoes:
      'Selects which mathematical compression features the H.264 encoder is allowed to use.',
    impact:
      '"High" reduces file size by ~15% using 8x8 transform blocks and CABAC entropy coding. "Baseline" disables B-frames and CABAC for lowest decode CPU cost on legacy devices.',
    whenToUse:
      'Use "High" for 99% of modern desktop and mobile web browsers. Use "Baseline" only for ultra-low-power embedded devices or instant software decoding.',
  },

  // === AREA 2: VIDEO QUALITY ===
  codec: {
    id: 'codec',
    title: 'MP4 Video Codec',
    cliFlag: '-c:v [libx264|libx265|libsvtav1]',
    whatItDoes:
      'Determines the video compression standard packaged inside the .mp4 container.',
    impact:
      'H.264 (libx264) offers 99.9% browser support and the fastest hardware decoding. H.265/HEVC (hvc1) is ~35% smaller at equal quality (supported on Safari & modern GPUs). AV1 achieves ~45% smaller files for modern browsers.',
    whenToUse:
      'Use H.264 for primary universal web MP4 delivery and scroll sequences. Use H.265 or AV1 when targeting modern browsers where minimum bandwidth is critical.',
  },
  resolution: {
    id: 'resolution',
    title: 'Output Resolution & Scaling Filter',
    cliFlag: '-vf scale=W:H:flags=[lanczos|bicubic|bilinear]',
    whatItDoes:
      'Resizes source frames to target dimensions (clamped to even integers required by MP4 encoders) using the selected resampling kernel.',
    impact:
      'Resolution has the largest impact on both file size and decode smoothness. Scaling from 4K to 1080p cuts file size by ~65% and prevents mobile frame drops. Lanczos keeps edges sharpest.',
    whenToUse:
      'Match the actual CSS display size on your webpage (e.g., 1080p for full-screen heroes, 720p or 50% for cards and background loops).',
  },
  framerate: {
    id: 'framerate',
    title: 'Frame Rate (FPS)',
    cliFlag: '-r [fps]',
    whatItDoes:
      'Sets how many sequence images are displayed per second of video playback.',
    impact:
      'Higher FPS (60fps) creates fluid motion for UI and fast camera pans but requires ~40–60% more bitrate and decoder work than 24/30fps.',
    whenToUse:
      'Use 24 or 30 FPS for cinematic 3D renders and hero loops. Use 60 FPS for UI motion captures or high-velocity animations.',
  },
  rateControlMode: {
    id: 'rateControlMode',
    title: 'Bitrate & Rate Control Strategy',
    cliFlag: '-crf / -maxrate / -b:v',
    whatItDoes:
      'Controls whether the encoder targets a perceptual visual quality level (CRF), quality with a network bandwidth ceiling (Constrained CRF), or a fixed data rate (Target Bitrate).',
    impact:
      'Constrained CRF gives the best of both worlds: it saves bits on simple frames while preventing complex motion frames from spiking and stalling mobile networks.',
    whenToUse:
      'Use "Constrained CRF" (Recommended) for nearly all web videos. Use "Target Bitrate" only when enforcing a strict CDN file size budget.',
  },
  crf: {
    id: 'crf',
    title: 'Compression Level (CRF — Constant Rate Factor)',
    cliFlag: '-crf [14..34]',
    whatItDoes:
      'Sets perceptual quantization on a logarithmic scale where lower numbers preserve more detail and higher numbers compress more aggressively.',
    impact:
      'Every -6 CRF roughly doubles the file size; every +6 CRF cuts file size in half. CRF 17–19 is visually near-lossless; CRF 20–23 is the sweet spot for web; CRF 26+ introduces softness on fine textures.',
    whenToUse:
      'Use 17–19 for showcase visuals, 20–22 for hero animations, and 24–28 for background videos where small file size matters most.',
  },
  bitrate: {
    id: 'bitrate',
    title: 'Bitrate & Peak Bandwidth Cap (Mbps)',
    cliFlag: '-b:v / -maxrate / -bufsize',
    whatItDoes:
      'Limits the data rate (Megabits per second) transferred to the viewer’s browser during playback.',
    impact:
      'Directly governs download time and buffering. A 4 Mbps video uses ~0.5 MB per second of footage. Capping peak bitrate prevents playback stutter on 4G/mobile connections.',
    whenToUse:
      'Keep Max Bitrate around 4–8 Mbps for 1080p hero videos, 1.5–3 Mbps for background videos, and 8–12 Mbps for high-detail presentations.',
  },

  // === AREA 3: ADVANCED PERFORMANCE TUNING ===
  keyframeInterval: {
    id: 'keyframeInterval',
    title: 'Keyframe Interval (GOP Length)',
    cliFlag: '-g [frames] -keyint_min [frames]',
    whatItDoes:
      'Sets the maximum number of predicted frames between full self-contained Intra keyframes (I-frames).',
    impact:
      'Crucial trade-off between file size and seeking/scrubbing speed! Short intervals (1–6 frames) let browsers seek/scrub backward and forward instantaneously, at the cost of larger files. Long intervals (1s–4s) shrink file size by 30–50% because P/B frames only store differences.',
    whenToUse:
      'Use "Ultra-Short (4 frames)" or "Every Frame (1)" for scroll-driven sequences. Use "1 Second" for looping hero videos, and "2–4 Seconds" for passive background loops.',
  },
  preset: {
    id: 'preset',
    title: 'Encoder Compression Efficiency Preset',
    cliFlag: '-preset [ultrafast..veryslow]',
    whatItDoes:
      'Controls how much CPU time the encoder spends searching for motion vectors and optimal block predictions during export.',
    impact:
      'Slower presets ("slow", "slower") produce smaller files with sharper detail at the exact same CRF and do NOT slow down browser playback—they only take longer to export.',
    whenToUse:
      'Use "Fast" or "Medium" while iterating, and switch to "Slow" or "Slower" for your final production web export.',
  },
  bFrames: {
    id: 'bFrames',
    title: 'Bi-Directional Predicted Frames (B-Frames)',
    cliFlag: '-bf [0..4]',
    whatItDoes:
      'Allows frames to compress data by referencing both past and future frames simultaneously.',
    impact:
      '2–3 B-frames shrink MP4 file size by ~10–15% for normal linear playback. However, B-frames require out-of-order decoding which adds latency when scrubbing backwards on scroll.',
    whenToUse:
      'Set to 0 B-Frames for scroll-driven sequences and interactive scrubbing. Set to 2 or 3 for standard autoplay/looping videos.',
  },
  tune: {
    id: 'tune',
    title: 'Psychovisual & Decoder Tuning',
    cliFlag: '-tune [fastdecode|animation|film]',
    whatItDoes:
      'Optimizes internal encoder quantization matrices and loop filters for specific visual content or hardware decoding constraints.',
    impact:
      '"Fastdecode" disables heavy deblocking/CABAC steps so mobile CPUs decode frames up to 2x faster during scroll scrubbing. "Animation" preserves flat color blocks and sharp vector lines. "Film" preserves subtle 3D lighting grain and gradients.',
    whenToUse:
      'Use "Fastdecode" for scroll sequences, "Animation" for UI/2D/vector motion graphics, and "Film" for photorealistic 3D renders.',
  },
  twoPass: {
    id: 'twoPass',
    title: 'Multi-Pass Bitrate Analysis (2-Pass Encoding)',
    cliFlag: '-pass 1 & -pass 2',
    whatItDoes:
      'Runs an initial analysis pass over all frames to measure motion complexity before encoding the final MP4 in pass 2.',
    impact:
      'Prevents quality drops during sudden high-motion bursts by redistributing bits from static frames to complex frames. Doubles export render time.',
    whenToUse:
      'Enable for final production exports when using Target Bitrate or tight Max Bitrate caps on sequences with varying motion.',
  },
  sharpenOutput: {
    id: 'sharpenOutput',
    title: 'Post-Scale Edge Micro-Sharpening',
    cliFlag: '-vf unsharp=3:3:0.35:3:3:0.0',
    whatItDoes:
      'Applies a subtle 3x3 luma-only unsharp mask filter after resolution scaling and before 4:2:0 chroma subsampling.',
    impact:
      'Counteracts the slight perceptual softness caused by YUV420p color compression and downscaling, keeping UI text and 3D edges crisp with negligible bitrate increase.',
    whenToUse:
      'Enable when downscaling sequences (e.g., 75% or 50%) or when encoding UI/product animations at higher CRF compression.',
  },
};
