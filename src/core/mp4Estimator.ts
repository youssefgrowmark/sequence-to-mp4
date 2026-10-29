import { ExportSettings, SequenceItem } from '../../electron/types';
import { calculateOutputDimensions, resolveKeyframeInterval } from './ffmpegGenerator';
import { formatBytes } from './timecode';

export interface TradeOffScores {
  /** 0-100: Higher means smaller file / more efficient payload */
  fileSizeScore: number;
  fileSizeLabel: string;
  /** 0-100: Higher means sharper image & fewer compression artifacts */
  visualFidelityScore: number;
  visualFidelityLabel: string;
  /** 0-100: Higher means faster time-to-first-frame & network download */
  loadingSpeedScore: number;
  loadingSpeedLabel: string;
  /** 0-100: Higher means lower CPU decode cost, smoother loop & instant scroll seeking */
  playbackSmoothnessScore: number;
  playbackSmoothnessLabel: string;
}

export interface MP4EstimateResult {
  outputWidth: number;
  outputHeight: number;
  totalOutputFrames: number;
  durationSeconds: number;
  resolvedGopFrames: number;
  estimatedBitrateMbps: number;
  estimatedBytes: number;
  estimatedFormatted: string;
  estimatedRangeFormatted: string;
  rawSequenceBytes: number;
  rawSequenceFormatted: string;
  savingsPercent: number;
  fast4gLoadSeconds: number;
  wifiLoadSeconds: number;
  timeToFirstFrameMs: number;
  tradeOffs: TradeOffScores;
  warnings: string[];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function getScoreLabel(score: number): string {
  if (score >= 85) return 'Optimal';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Moderate';
  return 'Heavy';
}

/**
 * Estimates the output MP4 file size, effective bitrate, network loading times,
 * and 4-pillar trade-off scores in real time as the user adjusts encoding settings.
 */
export function estimateMP4Output(
  sequence: SequenceItem | null,
  settings: ExportSettings
): MP4EstimateResult {
  const srcW = sequence?.width || 1920;
  const srcH = sequence?.height || 1080;
  const { width: outW, height: outH } = calculateOutputDimensions(
    srcW,
    srcH,
    settings.scale,
    settings.customWidth,
    settings.customHeight,
    settings.aspectRatioLocked
  );

  const fps = Math.max(1, Number(settings.targetFramerate) || 24);
  const totalAvailable = sequence ? sequence.filePaths.length : 60;
  const inPoint = sequence ? clamp(settings.inPoint, 0, Math.max(0, totalAvailable - 1)) : 0;
  let outPoint = sequence
    ? clamp(settings.outPoint, inPoint, Math.max(0, totalAvailable - 1))
    : 59;

  if (
    settings.webOptimizations.seamlessLooping &&
    settings.webOptimizations.dropDuplicateEndFrame &&
    outPoint > inPoint
  ) {
    outPoint -= 1;
  }

  const totalOutputFrames = Math.max(1, outPoint - inPoint + 1);
  const durationSeconds = totalOutputFrames / fps;
  const gopSize = resolveKeyframeInterval(fps, settings.keyframeMode, settings.customKeyintFrames);

  // Estimate source image complexity factor (0.7 to 1.4) based on average source frame byte density
  let complexityFactor = 1.0;
  const rawTotalBytes = sequence?.totalSizeApproxBytes || 0;
  const rawSubsetRatio = totalAvailable > 0 ? totalOutputFrames / totalAvailable : 1;
  const rawSequenceBytes = Math.round(rawTotalBytes * rawSubsetRatio);

  if (sequence && rawTotalBytes > 0 && sequence.totalFrames > 0) {
    const avgFrameBytes = rawTotalBytes / sequence.totalFrames;
    const rawUncompressedRgb = srcW * srcH * 3;
    const compressionRatio = avgFrameBytes / Math.max(1, rawUncompressedRgb);
    // Higher PNG/JPG size relative to resolution indicates higher visual entropy/detail
    complexityFactor = clamp(0.65 + compressionRatio * 1.6, 0.7, 1.45);
  }

  // Calculate base bitrate in Mbps
  const pixelsPerSecond = outW * outH * fps;
  let estimatedMbps: number;

  if (settings.rateControlMode === 'cbr') {
    estimatedMbps = Math.max(0.1, settings.targetBitrateMbps || 4.0);
  } else {
    // Base bits-per-pixel at CRF 23 for H.264 medium preset with 1s GOP (~0.075 bpp)
    const baseBppAtCrf23 = 0.075 * complexityFactor;

    // Exponential CRF scaling: every -6 CRF doubles bitrate; every +6 CRF halves bitrate
    const crfMultiplier = Math.pow(2, (23 - settings.crf) / 6);

    // Codec compression efficiency multiplier
    const codecMultiplier =
      settings.codec === 'libx264'
        ? 1.0
        : settings.codec === 'libx265'
        ? 0.68
        : 0.56; // AV1

    // Keyframe interval (GOP) multiplier:
    // Short GOPs (e.g. g=1 or g=4 for scroll sequences) have many more Intra (I) frames
    const gopMultiplier =
      gopSize === 1
        ? 3.1
        : gopSize <= 4
        ? 1.75
        : gopSize <= 12
        ? 1.28
        : gopSize <= fps
        ? 1.0
        : gopSize <= fps * 2
        ? 0.88
        : 0.8;

    // B-frames efficiency multiplier
    const effectiveBFrames =
      settings.codec === 'libx264' && settings.webOptimizations.h264Profile === 'baseline'
        ? 0
        : settings.bFrames;
    const bFrameMultiplier =
      effectiveBFrames === 0 ? 1.14 : effectiveBFrames === 1 ? 1.04 : effectiveBFrames === 2 ? 1.0 : 0.96;

    // Encoder preset density efficiency
    const presetMultipliers: Record<string, number> = {
      ultrafast: 1.38,
      superfast: 1.24,
      veryfast: 1.12,
      faster: 1.06,
      fast: 1.03,
      medium: 1.0,
      slow: 0.93,
      slower: 0.88,
      veryslow: 0.84,
    };
    const presetMultiplier = presetMultipliers[settings.preset] || 1.0;

    // H.264 profile efficiency (Baseline lacks CABAC, adding ~14% size)
    const profileMultiplier =
      settings.codec === 'libx264' && settings.webOptimizations.h264Profile === 'baseline'
        ? 1.14
        : settings.codec === 'libx264' && settings.webOptimizations.h264Profile === 'main'
        ? 1.04
        : 1.0;

    // Tune multiplier
    const tuneMultiplier =
      settings.tune === 'fastdecode'
        ? 1.08
        : settings.tune === 'animation'
        ? 0.92
        : settings.tune === 'film'
        ? 1.05
        : 1.0;

    // Sharpen filter adds slight high-frequency energy
    const sharpenMultiplier = settings.sharpenOutput ? 1.05 : 1.0;

    const rawEstimatedBitsPerSec =
      pixelsPerSecond *
      baseBppAtCrf23 *
      crfMultiplier *
      codecMultiplier *
      gopMultiplier *
      bFrameMultiplier *
      presetMultiplier *
      profileMultiplier *
      tuneMultiplier *
      sharpenMultiplier;

    estimatedMbps = rawEstimatedBitsPerSec / 1_000_000;

    // Apply Max Bitrate Cap if in Constrained CRF mode
    if (settings.rateControlMode === 'crf-constrained' && settings.maxBitrateMbps > 0) {
      // Soft knee near maxBitrateMbps since VBV caps peaks and lowers average
      if (estimatedMbps > settings.maxBitrateMbps) {
        estimatedMbps = settings.maxBitrateMbps * 0.92;
      } else if (estimatedMbps > settings.maxBitrateMbps * 0.8) {
        estimatedMbps = estimatedMbps * 0.95;
      }
    }
  }

  estimatedMbps = Math.max(0.08, Number(estimatedMbps.toFixed(2)));

  // Convert Mbps * duration to bytes + MP4 moov/container header overhead (~6 KB + 48B/frame)
  const containerOverheadBytes = 6144 + totalOutputFrames * 48;
  const videoPayloadBytes = (estimatedMbps * 1_000_000 * durationSeconds) / 8;
  const estimatedBytes = Math.round(videoPayloadBytes + containerOverheadBytes);

  const minBytes = Math.round(estimatedBytes * 0.85);
  const maxBytes = Math.round(estimatedBytes * 1.15);

  const savingsPercent =
    rawSequenceBytes > 0
      ? clamp(Math.round(((rawSequenceBytes - estimatedBytes) / rawSequenceBytes) * 100), -100, 99)
      : 90;

  // Network load time calculations (15 Mbps Fast 4G, 50 Mbps Broadband Wi-Fi)
  const totalMegabits = (estimatedBytes * 8) / 1_000_000;
  const fast4gLoadSeconds = Number(Math.max(0.05, totalMegabits / 15).toFixed(2));
  const wifiLoadSeconds = Number(Math.max(0.02, totalMegabits / 50).toFixed(2));

  // Time to first frame (ms): with faststart, browser only needs first ~15% or 250KB + RTT
  const timeToFirstFrameMs = settings.webOptimizations.faststart
    ? Math.round(clamp(80 + estimatedMbps * 28, 90, 650))
    : Math.round(clamp(fast4gLoadSeconds * 1000 + 180, 400, 9000));

  // --- Calculate 4-Pillar Trade-Off Scores (0 - 100) ---

  // 1. File Size / Payload Efficiency Score (0-100)
  // Benchmark: < 1 MB is ~95, 2 MB is ~82, 5 MB is ~62, 15 MB is ~30
  const sizeMB = estimatedBytes / (1024 * 1024);
  const fileSizeScore = Math.round(clamp(100 - Math.pow(sizeMB, 0.65) * 16, 12, 99));

  // 2. Visual Fidelity Score (0-100)
  let fidelity = 90;
  if (settings.rateControlMode === 'cbr') {
    const bpp = (settings.targetBitrateMbps * 1_000_000) / Math.max(1, pixelsPerSecond);
    fidelity = clamp(Math.round(45 + bpp * 520), 30, 98);
  } else {
    // CRF 14 -> 99, CRF 18 -> 94, CRF 20 -> 89, CRF 23 -> 80, CRF 28 -> 62, CRF 34 -> 40
    fidelity = Math.round(100 - (settings.crf - 14) * 2.9);
    // If Constrained CRF cap is too low for the resolution, penalize fidelity
    const idealUncappedMbps = (pixelsPerSecond * 0.065) / 1_000_000;
    if (
      settings.rateControlMode === 'crf-constrained' &&
      settings.maxBitrateMbps < idealUncappedMbps * 0.5
    ) {
      fidelity -= 14;
    }
  }
  const scaleRatio = (outW * outH) / Math.max(1, srcW * srcH);
  if (scaleRatio < 0.35) fidelity -= 15;
  else if (scaleRatio < 0.65) fidelity -= 6;
  if (settings.preset === 'ultrafast' || settings.preset === 'superfast') fidelity -= 8;
  if (settings.preset === 'slow' || settings.preset === 'slower' || settings.preset === 'veryslow')
    fidelity += 4;
  if (settings.twoPass) fidelity += 3;
  if (settings.sharpenOutput && scaleRatio < 1) fidelity += 2;
  const visualFidelityScore = clamp(fidelity, 20, 99);

  // 3. Loading Speed Score (0-100)
  let loadingScore = Math.round(clamp(98 - estimatedMbps * 5.2 - sizeMB * 2.5, 15, 98));
  if (!settings.webOptimizations.faststart) {
    loadingScore = Math.max(15, loadingScore - 30);
  }
  if (settings.webOptimizations.stripAudio) {
    loadingScore = Math.min(99, loadingScore + 2);
  }

  // 4. Playback & Scrubbing Smoothness Score (0-100)
  let smoothness = 88;
  // Resolution & FPS decode load
  if (outW * outH > 2560 * 1440) smoothness -= 18;
  else if (outW * outH > 1920 * 1080) smoothness -= 8;
  if (fps > 60) smoothness -= 15;
  else if (fps === 60) smoothness += 2;

  // Browser compatibility & hardware acceleration
  if (!settings.webOptimizations.forceYuv420p) smoothness -= 25;
  if (!settings.webOptimizations.seamlessLooping) smoothness -= 10;
  if (settings.codec === 'libaom-av1' || settings.codec === 'libsvtav1') smoothness -= 6;

  // Scroll-driven sequence sensitivity to GOP and B-frames
  if (settings.useCasePreset === 'scroll-driven') {
    if (gopSize <= 4 && settings.bFrames === 0) smoothness += 10;
    else if (gopSize > 12 || settings.bFrames > 0) smoothness -= 22;
  } else {
    if (gopSize <= 12) smoothness += 4;
    if (settings.tune === 'fastdecode') smoothness += 5;
  }
  const playbackSmoothnessScore = clamp(smoothness, 20, 99);

  // Actionable warnings for non-experts
  const warnings: string[] = [];
  if (!settings.webOptimizations.faststart) {
    warnings.push(
      'Faststart is disabled: browsers will have to download the entire MP4 before playback can begin.'
    );
  }
  if (!settings.webOptimizations.forceYuv420p) {
    warnings.push(
      'YUV420p is disabled: PNG inputs may encode as YUV444p, which fails to play on Safari and iOS.'
    );
  }
  if (settings.useCasePreset === 'scroll-driven' && (gopSize > 8 || settings.bFrames > 0)) {
    warnings.push(
      'For scroll-driven sequences, keep Keyframe Interval ≤ 6 frames and B-Frames at 0 to prevent scrubbing lag.'
    );
  }
  if (outW > 1920 && estimatedMbps > 10) {
    warnings.push(
      'High resolution + bitrate (>10 Mbps) may buffer on mobile 4G networks. Consider 1080p scale or a 6–8 Mbps cap.'
    );
  }

  return {
    outputWidth: outW,
    outputHeight: outH,
    totalOutputFrames,
    durationSeconds,
    resolvedGopFrames: gopSize,
    estimatedBitrateMbps: estimatedMbps,
    estimatedBytes,
    estimatedFormatted: `~${formatBytes(estimatedBytes)}`,
    estimatedRangeFormatted: `${formatBytes(minBytes)} – ${formatBytes(maxBytes)}`,
    rawSequenceBytes,
    rawSequenceFormatted: formatBytes(rawSequenceBytes),
    savingsPercent,
    fast4gLoadSeconds,
    wifiLoadSeconds,
    timeToFirstFrameMs,
    tradeOffs: {
      fileSizeScore,
      fileSizeLabel: getScoreLabel(fileSizeScore),
      visualFidelityScore,
      visualFidelityLabel: getScoreLabel(visualFidelityScore),
      loadingSpeedScore: loadingScore,
      loadingSpeedLabel: getScoreLabel(loadingScore),
      playbackSmoothnessScore,
      playbackSmoothnessLabel: getScoreLabel(playbackSmoothnessScore),
    },
    warnings,
  };
}

/**
 * Generates a production-ready HTML5 snippet tailored to the selected use case & MP4 settings
 */
export function generateWebEmbedSnippet(
  settings: ExportSettings,
  filename: string,
  width: number,
  height: number
): string {
  if (settings.useCasePreset === 'scroll-driven') {
    return `<!-- Scroll-Driven MP4 Sequence (${width}x${height}, GOP=${settings.keyframeMode}, 0 B-Frames) -->
<video
  id="scroll-sequence-video"
  src="/videos/${filename}"
  width="${width}"
  height="${height}"
  muted
  playsinline
  preload="auto"
  style="width: 100%; height: auto; display: block; object-fit: cover;"
></video>

<script>
  const video = document.getElementById('scroll-sequence-video');
  window.addEventListener('scroll', () => {
    if (!video.duration) return;
    const progress = Math.min(1, Math.max(0, window.scrollY / (document.body.scrollHeight - window.innerHeight)));
    requestAnimationFrame(() => {
      video.currentTime = progress * video.duration;
    });
  }, { passive: true });
</script>`;
  }

  const loopAttr = settings.webOptimizations.seamlessLooping ? '\n  loop' : '';
  return `<!-- Web-Optimized MP4 (${width}x${height} @ ${settings.targetFramerate}fps) -->
<video
  src="/videos/${filename}"
  width="${width}"
  height="${height}"
  autoplay${loopAttr}
  muted
  playsinline
  preload="metadata"
  style="width: 100%; height: auto; display: block; object-fit: cover;"
></video>`;
}
