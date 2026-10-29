import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Columns,
  Eye,
  Film,
  MousePointerClick,
  ChevronsLeftRight,
} from 'lucide-react';
import { ExportSettings, SequenceItem } from '../../electron/types';
import { formatTimecode, formatBytes } from '../core/timecode';
import { MP4EstimateResult } from '../core/mp4Estimator';
import { resolveMediaUrl } from '../core/previewUrl';
import { loadPersistedUIState, savePersistedUIState } from '../core/cookieStore';
import { AppleDropdown, AppleDropdownOption } from './AppleDropdown';
import { Splitter } from './Splitter';

interface CentralViewportProps {
  sequence: SequenceItem | null;
  settings: ExportSettings;
  estimate: MP4EstimateResult;
  renderedVideoPath?: string;
  renderedVideoSizeBytes?: number;
  targetFramerate: number;
  inPoint: number;
  outPoint: number;
  currentFrame: number;
  onSeekFrame: (frameIndex: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  isLooping: boolean;
  onToggleLoop: () => void;
  onSetInPoint: (frame: number) => void;
  onSetOutPoint: (frame: number) => void;
  onBrowseDirectory?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  timelineSplitterProps?: {
    onDragStart: () => void;
    onDrag: (delta: number) => void;
    onReset?: () => void;
  };
}

type PreviewMode = 'original' | 'simulated' | 'split' | 'rendered-mp4';
type SourceGridFormat = '2-col' | '3-col' | '4-col' | '1-col' | 'single';

const GRID_FORMAT_OPTIONS: AppleDropdownOption<SourceGridFormat>[] = [
  {
    value: '2-col',
    label: 'Big Previews',
    badge: '2×',
    groupHeader: 'Grid Format',
    icon: (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" />
        <rect x="8" y="1.5" width="4.5" height="4.5" rx="1" />
        <rect x="1.5" y="8" width="4.5" height="4.5" rx="1" />
        <rect x="8" y="8" width="4.5" height="4.5" rx="1" />
      </svg>
    ),
  },
  {
    value: '3-col',
    label: '3 Columns',
    badge: '3×',
    icon: (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="1.2" y="2" width="3" height="4" rx="0.7" />
        <rect x="5.5" y="2" width="3" height="4" rx="0.7" />
        <rect x="9.8" y="2" width="3" height="4" rx="0.7" />
        <rect x="1.2" y="8" width="3" height="4" rx="0.7" />
        <rect x="5.5" y="8" width="3" height="4" rx="0.7" />
        <rect x="9.8" y="8" width="3" height="4" rx="0.7" />
      </svg>
    ),
  },
  {
    value: '4-col',
    label: 'Contact Sheet',
    badge: '4×',
    icon: (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1.2" y="1.5" width="2.2" height="2.2" rx="0.4" />
        <rect x="4.6" y="1.5" width="2.2" height="2.2" rx="0.4" />
        <rect x="8" y="1.5" width="2.2" height="2.2" rx="0.4" />
        <rect x="10.8" y="1.5" width="2" height="2.2" rx="0.4" />
        <rect x="1.2" y="5.8" width="2.2" height="2.2" rx="0.4" />
        <rect x="4.6" y="5.8" width="2.2" height="2.2" rx="0.4" />
        <rect x="8" y="5.8" width="2.2" height="2.2" rx="0.4" />
        <rect x="10.8" y="5.8" width="2" height="2.2" rx="0.4" />
        <rect x="1.2" y="10" width="2.2" height="2.2" rx="0.4" />
        <rect x="4.6" y="10" width="2.2" height="2.2" rx="0.4" />
        <rect x="8" y="10" width="2.2" height="2.2" rx="0.4" />
        <rect x="10.8" y="10" width="2" height="2.2" rx="0.4" />
      </svg>
    ),
  },
  {
    value: '1-col',
    label: 'Full Width',
    badge: '1×',
    icon: (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1.5" y="2" width="11" height="4" rx="1" />
        <rect x="1.5" y="8" width="11" height="4" rx="1" />
      </svg>
    ),
  },
  {
    value: 'single',
    label: 'Single Frame',
    badge: '1f',
    dividerBefore: true,
    groupHeader: 'Canvas View',
    icon: (
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1.5" y="2.5" width="11" height="9" rx="1.5" />
      </svg>
    ),
  },
];

const PLAYBACK_SPEED_OPTIONS: AppleDropdownOption<string>[] = [
  { value: '0.25', label: '0.25×', sublabel: 'Quarter Speed' },
  { value: '0.5', label: '0.5×', sublabel: 'Half Speed' },
  { value: '1', label: '1.0×', sublabel: 'Real-Time' },
  { value: '2', label: '2.0×', sublabel: 'Double Speed' },
];

export const CentralViewport: React.FC<CentralViewportProps> = ({
  sequence,
  settings,
  estimate,
  renderedVideoPath,
  renderedVideoSizeBytes,
  targetFramerate,
  inPoint,
  outPoint,
  currentFrame,
  onSeekFrame,
  isPlaying,
  onTogglePlay,
  isLooping,
  onToggleLoop,
  onSetInPoint,
  onSetOutPoint,
  onBrowseDirectory,
  onDragOver,
  onDragLeave,
  onDrop,
  timelineSplitterProps,
}) => {
  const initialUI = loadPersistedUIState();
  const [viewMode, setViewMode] = useState<'fit' | '100%'>(() => initialUI.viewMode || 'fit');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => initialUI.playbackSpeed || 1);
  const [previewMode, setPreviewMode] = useState<PreviewMode>(
    () => initialUI.previewMode || 'simulated'
  );
  const [sourceGridFormat, setSourceGridFormat] = useState<SourceGridFormat>(
    () => initialUI.sourceGridFormat || '2-col'
  );
  const [splitPosition, setSplitPosition] = useState<number>(50);
  const [scrollSimProgress, setScrollSimProgress] = useState<number>(0);

  useEffect(() => {
    savePersistedUIState({
      viewMode,
      playbackSpeed,
      previewMode,
      sourceGridFormat,
    });
  }, [viewMode, playbackSpeed, previewMode, sourceGridFormat]);

  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isScrubbingRef = useRef<boolean>(false);

  const [stageBounds, setStageBounds] = useState<{ width: number; height: number }>({
    width: 820,
    height: 540,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageBounds({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const totalFrames = sequence ? sequence.filePaths.length : 0;
  const hasSource = Boolean(sequence && totalFrames > 0);

  const timelineRectRef = useRef<DOMRect | null>(null);
  const pendingFrameRef = useRef<number | null>(null);
  const lastDispatchedFrameRef = useRef<number>(currentFrame);
  const rafIdRef = useRef<number | null>(null);
  const [scrubbingFrame, setScrubbingFrame] = useState<number | null>(null);

  // Sync ref when not actively scrubbing
  useEffect(() => {
    if (!isScrubbingRef.current) {
      lastDispatchedFrameRef.current = currentFrame;
    }
  }, [currentFrame]);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      document.body.classList.remove('is-scrubbing-timeline');
    };
  }, []);

  const activeFrame = scrubbingFrame !== null ? scrubbingFrame : currentFrame;
  const currentFilePath =
    sequence && sequence.filePaths[activeFrame] ? sequence.filePaths[activeFrame] : null;

  // Preload surrounding frames into browser memory cache for lag-free scrubbing and playback
  useEffect(() => {
    if (!sequence || sequence.filePaths.length === 0) return;
    const count = sequence.filePaths.length;
    const PRELOAD_BEHIND = 6;
    const PRELOAD_AHEAD = 18;
    const start = Math.max(0, activeFrame - PRELOAD_BEHIND);
    const end = Math.min(count - 1, activeFrame + PRELOAD_AHEAD);

    for (let i = start; i <= end; i++) {
      if (i === activeFrame) continue;
      const url = resolveMediaUrl(sequence.filePaths[i]);
      if (url) {
        const img = new Image();
        img.src = url;
      }
    }
  }, [sequence, activeFrame]);

  const getFrameFileName = useCallback(
    (index: number): string => {
      if (!sequence) return `Frame ${index + 1}`;
      if (sequence.fileNames && sequence.fileNames[index]) {
        return sequence.fileNames[index];
      }
      const fp = sequence.filePaths[index] || '';
      if (!fp.startsWith('blob:') && !fp.startsWith('data:')) {
        const base = fp.split(/[/\\]/).pop();
        if (base) return base;
      }
      return `Frame_${String(index + 1).padStart(sequence.padding || 4, '0')}${sequence.extension}`;
    },
    [sequence]
  );

  const folderDisplayName = sequence
    ? sequence.directory.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || sequence.directory
    : '';
  const currentFrameFileName = getFrameFileName(activeFrame);

  const [imageError, setImageError] = useState<boolean>(false);

  const imageSrc = resolveMediaUrl(currentFilePath);

  const renderedVideoSrc = resolveMediaUrl(renderedVideoPath, renderedVideoSizeBytes || 1);

  // Reset image error on frame change (only if previously errored)
  useEffect(() => {
    if (imageError) {
      setImageError(false);
    }
  }, [currentFilePath, imageError]);

  // If renderedVideoPath is cleared, exit rendered-mp4 tab
  useEffect(() => {
    if (!renderedVideoPath && previewMode === 'rendered-mp4') {
      setPreviewMode('simulated');
    }
  }, [renderedVideoPath, previewMode]);

  // Step 1 Frame Backward
  const handleStepBack = useCallback(() => {
    if (totalFrames === 0) return;
    const prev = Math.max(0, activeFrame - 1);
    onSeekFrame(prev);
  }, [activeFrame, totalFrames, onSeekFrame]);

  // Step 1 Frame Forward
  const handleStepForward = useCallback(() => {
    if (totalFrames === 0) return;
    const next = Math.min(totalFrames - 1, activeFrame + 1);
    onSeekFrame(next);
  }, [activeFrame, totalFrames, onSeekFrame]);

  // Jump to In-Point
  const handleJumpIn = useCallback(() => {
    onSeekFrame(inPoint);
  }, [inPoint, onSeekFrame]);

  // Jump to Out-Point
  const handleJumpOut = useCallback(() => {
    onSeekFrame(outPoint);
  }, [outPoint, onSeekFrame]);

  // High-performance timeline scrub calculations using cached rect and RAF
  const calcTargetFrame = useCallback(
    (clientX: number): number => {
      if (!timelineRectRef.current || totalFrames === 0) return 0;
      const rect = timelineRectRef.current;
      const normalizedPercent = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
      return Math.max(0, Math.min(totalFrames - 1, Math.round(normalizedPercent * (totalFrames - 1))));
    },
    [totalFrames]
  );

  const dispatchScrubFrame = useCallback(
    (targetIndex: number) => {
      setScrubbingFrame(targetIndex);

      if (targetIndex === lastDispatchedFrameRef.current) return;
      pendingFrameRef.current = targetIndex;

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (
            pendingFrameRef.current !== null &&
            pendingFrameRef.current !== lastDispatchedFrameRef.current
          ) {
            lastDispatchedFrameRef.current = pendingFrameRef.current;
            onSeekFrame(pendingFrameRef.current);
          }
        });
      }
    },
    [onSeekFrame]
  );

  const handlePointerDownTimeline = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasSource || e.button !== 0 || totalFrames === 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = e.currentTarget.getBoundingClientRect();
    timelineRectRef.current = rect;
    isScrubbingRef.current = true;
    document.body.classList.add('is-scrubbing-timeline');

    const target = calcTargetFrame(e.clientX);
    lastDispatchedFrameRef.current = target;
    setScrubbingFrame(target);
    onSeekFrame(target);
  };

  const handlePointerMoveTimeline = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbingRef.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const target = calcTargetFrame(e.clientX);
    dispatchScrubFrame(target);
  };

  const handlePointerUpTimeline = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
    isScrubbingRef.current = false;
    document.body.classList.remove('is-scrubbing-timeline');

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const finalTarget =
      pendingFrameRef.current !== null
        ? pendingFrameRef.current
        : calcTargetFrame(e.clientX);

    setScrubbingFrame(null);
    timelineRectRef.current = null;
    pendingFrameRef.current = null;

    if (finalTarget !== lastDispatchedFrameRef.current) {
      lastDispatchedFrameRef.current = finalTarget;
      onSeekFrame(finalTarget);
    }
  };

  const handleLostPointerCaptureTimeline = () => {
    isScrubbingRef.current = false;
    document.body.classList.remove('is-scrubbing-timeline');
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setScrubbingFrame(null);
    timelineRectRef.current = null;
    pendingFrameRef.current = null;
  };

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleStepBack();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStepForward();
      } else if (e.code === 'KeyI') {
        e.preventDefault();
        onSetInPoint(currentFrame);
      } else if (e.code === 'KeyO') {
        e.preventDefault();
        onSetOutPoint(currentFrame);
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        onToggleLoop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    onTogglePlay,
    handleStepBack,
    handleStepForward,
    onSetInPoint,
    onSetOutPoint,
    currentFrame,
    onToggleLoop,
  ]);

  // Calculate real-time visual simulation filter & responsive frame dimensions for the preview monitor
  const srcW = sequence?.width || 1920;
  const srcH = sequence?.height || 1080;
  const outW = Math.max(2, estimate.outputWidth || srcW);
  const outH = Math.max(2, estimate.outputHeight || srcH);

  const availW = Math.max(220, stageBounds.width - 56);
  const availH = Math.max(160, stageBounds.height - 56);
  const baseSourceFitScale = Math.min(availW / Math.max(1, srcW), availH / Math.max(1, srcH));

  let displayFrameWidth: number;
  let displayFrameHeight: number;
  if (viewMode === '100%') {
    displayFrameWidth = Math.max(40, Math.round(outW * zoomLevel));
    displayFrameHeight = Math.max(40, Math.round(outH * zoomLevel));
  } else {
    const rawW = outW * baseSourceFitScale;
    const rawH = outH * baseSourceFitScale;
    const fitClamp = Math.min(1, availW / Math.max(1, rawW), availH / Math.max(1, rawH));
    displayFrameWidth = Math.max(64, Math.round(rawW * fitClamp * zoomLevel));
    displayFrameHeight = Math.max(48, Math.round(rawH * fitClamp * zoomLevel));
  }

  // --- Simulated MP4 look: every encoder setting from the right panel feeds an "effective CRF" ---
  const scaleFactor = Math.min(1, outW / Math.max(1, srcW));
  const fpsForBpp = Math.max(1, settings.targetFramerate || 30);
  const bitsPerPixel = (mbps: number) => (mbps * 1e6) / (outW * outH * fpsForBpp);

  let effectiveCrf: number;
  if (settings.rateControlMode === 'cbr') {
    // Bitrate-driven quality: ~0.1 bits/pixel/frame is roughly CRF 23
    const bpp = Math.max(0.0005, bitsPerPixel(settings.targetBitrateMbps));
    effectiveCrf = 23 - 6 * Math.log2(bpp / 0.1);
  } else {
    effectiveCrf = settings.crf;
    if (
      settings.rateControlMode === 'crf-constrained' &&
      settings.maxBitrateMbps > 0 &&
      estimate.estimatedBitrateMbps > settings.maxBitrateMbps
    ) {
      // VBV cap starves the encoder, quality drops
      effectiveCrf += 6 * Math.log2(estimate.estimatedBitrateMbps / settings.maxBitrateMbps);
    }
  }
  const presetCrfOffset: Record<string, number> = {
    ultrafast: 3,
    superfast: 2.2,
    veryfast: 1.5,
    faster: 0.8,
    fast: 0.4,
    medium: 0,
    slow: -0.5,
    slower: -0.9,
    veryslow: -1.2,
  };
  effectiveCrf += presetCrfOffset[settings.preset] ?? 0;
  if (settings.tune === 'fastdecode') effectiveCrf += 0.8;
  if (settings.codec === 'libx264' && settings.webOptimizations.h264Profile === 'baseline')
    effectiveCrf += 1;
  if (settings.codec === 'libx264' && settings.bFrames === 0) effectiveCrf += 0.5;
  if (settings.codec !== 'libx264') effectiveCrf -= 2; // newer codecs are more efficient
  if (settings.twoPass) effectiveCrf -= 0.5;
  effectiveCrf = Math.min(51, Math.max(0, effectiveCrf));

  const crfSoftnessPx = effectiveCrf > 23 ? (effectiveCrf - 23) * 0.14 : 0;
  const algoFactor =
    settings.scalingAlgorithm === 'lanczos' ? 0.75 : settings.scalingAlgorithm === 'bilinear' ? 1.25 : 1;
  const scaleBlurPx = scaleFactor < 1 ? (1 - scaleFactor) * 0.9 * algoFactor : 0;
  const tuneSoftMul = settings.tune === 'animation' ? 0.75 : 1;
  const totalBlurPx = Math.max(
    0,
    Number(((crfSoftnessPx * tuneSoftMul + scaleBlurPx) - (settings.sharpenOutput ? 0.25 : 0)).toFixed(2))
  );
  const contrastBoost = (settings.sharpenOutput ? 1.04 : 1.0) * (effectiveCrf > 32 ? 0.98 : 1);
  const saturationShift =
    (settings.webOptimizations.forceYuv420p ? 0.98 : 1.0) *
    (effectiveCrf > 28 ? 1 - Math.min(0.12, (effectiveCrf - 28) * 0.012) : 1);

  const simulatedCssFilter = `blur(${totalBlurPx}px) contrast(${Number(contrastBoost.toFixed(3))}) saturate(${Number(saturationShift.toFixed(3))})`;
  const simulatedImageRendering: React.CSSProperties['imageRendering'] = 'auto';

  // Effective Out-Point accounting for Trim Duplicate Loop Boundary Frame
  const effectiveOutPoint =
    settings.webOptimizations.seamlessLooping &&
    settings.webOptimizations.dropDuplicateEndFrame &&
    outPoint > inPoint
      ? outPoint - 1
      : outPoint;

  const inPercent = totalFrames > 1 ? (inPoint / (totalFrames - 1)) * 100 : 0;
  const outPercent = totalFrames > 1 ? (effectiveOutPoint / (totalFrames - 1)) * 100 : 100;
  const playheadPercent = totalFrames > 1 ? (activeFrame / (totalFrames - 1)) * 100 : 0;

  // Memoize keyframe IDR cadence tick positions along the timeline
  const keyframeMarkers = useMemo(() => {
    if (!hasSource || totalFrames <= 1 || estimate.resolvedGopFrames < 1) return [];
    const gop = Math.max(1, estimate.resolvedGopFrames);
    const count = Math.min(60, Math.floor((effectiveOutPoint - inPoint) / gop) + 1);
    const markers: { frame: number; pct: number }[] = [];
    for (let idx = 0; idx < count; idx++) {
      const kfFrame = inPoint + idx * gop;
      if (kfFrame > effectiveOutPoint) break;
      const pct = (kfFrame / (totalFrames - 1)) * 100;
      markers.push({ frame: kfFrame, pct });
    }
    return markers;
  }, [hasSource, totalFrames, estimate.resolvedGopFrames, inPoint, effectiveOutPoint]);

  // Handle Scroll-Scrubbing Simulator on the rendered MP4 video
  const handleScrollSimChange = (val: number) => {
    setScrollSimProgress(val);
    if (videoRef.current && videoRef.current.duration) {
      videoRef.current.pause();
      videoRef.current.currentTime = (val / 100) * videoRef.current.duration;
    }
  };

  return (
    <main className="central-viewport">
      {/* 1. Viewport Top HUD / Preview Mode Switcher & Zoom Controls */}
      <div
        className={!hasSource ? 'section-unavailable' : ''}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          backgroundColor: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-subtle)',
          zIndex: 10,
          gap: '8px',
          flexWrap: 'wrap',
        }}
        aria-disabled={!hasSource}
      >
        {/* Left: Real-Time Preview Mode Selector (Apple Segmented Control) */}
        <div className="apple-segmented" style={{ width: 'auto' }}>
          <button
            className={`apple-segment-btn ${previewMode === 'original' ? 'active' : ''}`}
            style={{ padding: '4px 10px' }}
            onClick={() => setPreviewMode('original')}
            disabled={!hasSource}
            title="View uncompressed source sequence frames"
          >
            Source
          </button>
          <button
            className={`apple-segment-btn ${previewMode === 'simulated' ? 'active' : ''}`}
            style={{ padding: '4px 10px' }}
            onClick={() => setPreviewMode('simulated')}
            disabled={!hasSource}
            title="Real-time simulation of output resolution, scaling, sharpening, and CRF compression"
          >
            Simulated MP4
          </button>
          <button
            className={`apple-segment-btn ${previewMode === 'split' ? 'active' : ''}`}
            style={{ padding: '4px 10px' }}
            onClick={() => setPreviewMode('split')}
            disabled={!hasSource}
            title="Interactive A/B wipe comparing Source Frame vs Simulated MP4 Output"
          >
            A/B Split
          </button>
          {renderedVideoSrc && (
            <button
              className={`apple-segment-btn ${previewMode === 'rendered-mp4' ? 'active' : ''}`}
              style={{ padding: '4px 10px' }}
              onClick={() => setPreviewMode('rendered-mp4')}
              disabled={!hasSource}
              title="Inspect and scroll-scrub the actual encoded MP4 file in the browser video engine"
            >
              Rendered MP4
            </button>
          )}
        </div>

        {/* Center: Live Telemetry */}
        {sequence && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className="font-mono"
              style={{
                fontSize: '10.5px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
              }}
            >
              {srcW === estimate.outputWidth && srcH === estimate.outputHeight
                ? `${srcW}×${srcH}`
                : `${srcW}×${srcH} > ${estimate.outputWidth}×${estimate.outputHeight}`}
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: '10.5px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                background: 'transparent',
                border: 'none',
              }}
            >
              {estimate.estimatedFormatted} ({estimate.estimatedBitrateMbps} Mbps)
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: '10.5px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
              }}
            >
              GOP {estimate.resolvedGopFrames}f
            </span>
          </div>
        )}

        {/* Right: Source Grid Selector (Only on Source section) */}
        {previewMode === 'original' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AppleDropdown<SourceGridFormat>
              value={sourceGridFormat}
              options={GRID_FORMAT_OPTIONS}
              compact
              disabled={!hasSource}
              minWidth={154}
              menuWidth={216}
              align="right"
              direction="down"
              title="Select Source Frame Grid Format"
              onChange={(fmt) => {
                setSourceGridFormat(fmt);
              }}
            />
          </div>
        )}
      </div>

      {/* 2. Edge-to-Edge Image / Video Monitor Canvas Area */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div
          ref={containerRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems:
              previewMode === 'original' && sourceGridFormat !== 'single' && sequence
                ? 'stretch'
                : 'center',
            justifyContent:
              previewMode === 'original' && sourceGridFormat !== 'single' && sequence
                ? 'flex-start'
                : 'center',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'auto',
            backgroundColor: 'var(--bg-viewport)',
            backgroundImage: 'radial-gradient(circle, var(--viewport-grid-dot) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
        {previewMode === 'original' && sourceGridFormat !== 'single' && sequence ? (
          /* Source Tab: Big Frame Previews Grid with Folder Name & Original Frame Filenames */
          <div className="source-grid-wrapper">
            <div className="source-grid-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                  {folderDisplayName}
                </span>
                <span className="badge font-mono" style={{ fontSize: '11px' }}>
                  {sequence.pattern}
                </span>
                <span className="badge font-mono" style={{ fontSize: '11px' }}>
                  {totalFrames} frames · {srcW}×{srcH}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Active: {currentFrameFileName} (#{activeFrame + 1})
                </span>
              </div>
            </div>

            <div
              className="source-frames-grid"
              style={{
                gridTemplateColumns:
                  sourceGridFormat === '1-col'
                    ? '1fr'
                    : sourceGridFormat === '2-col'
                    ? 'repeat(2, minmax(260px, 1fr))'
                    : sourceGridFormat === '3-col'
                    ? 'repeat(3, minmax(190px, 1fr))'
                    : 'repeat(4, minmax(145px, 1fr))',
              }}
            >
              {sequence.filePaths.map((fp, idx) => {
                const thumbUrl = resolveMediaUrl(fp);
                const fileName = getFrameFileName(idx);
                const isCurrent = idx === activeFrame;
                const isIn = idx === inPoint;
                const isOut = idx === effectiveOutPoint;
                const isOutOfRange = idx < inPoint || idx > effectiveOutPoint;

                return (
                  <div
                    key={idx}
                    className={`source-frame-card ${isCurrent ? 'active' : ''}`}
                    style={{ opacity: isOutOfRange ? 0.45 : 1 }}
                    onClick={() => onSeekFrame(idx)}
                    onDoubleClick={() => {
                      onSeekFrame(idx);
                      setSourceGridFormat('single');
                    }}
                    title={`${fileName} — Click to select frame #${idx + 1}, double-click to inspect single frame`}
                  >
                    <div
                      className="source-frame-preview-box"
                      style={{ aspectRatio: `${outW} / ${outH}` }}
                    >
                      {thumbUrl && (
                        <img
                          src={thumbUrl}
                          alt={fileName}
                          loading="lazy"
                          decoding="async"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit:
                              settings.scale === 'custom' && !settings.aspectRatioLocked
                                ? 'fill'
                                : viewMode === 'fit'
                                ? 'contain'
                                : 'cover',
                            display: 'block',
                          }}
                        />
                      )}
                      {(isIn || isOut) && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            display: 'flex',
                            gap: '4px',
                          }}
                        >
                          {isIn && (
                            <span
                              className="badge font-mono"
                              style={{
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-focus)',
                                fontSize: '10px',
                                fontWeight: 600,
                              }}
                            >
                              IN
                            </span>
                          )}
                          {isOut && (
                            <span
                              className="badge font-mono"
                              style={{
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-focus)',
                                fontSize: '10px',
                                fontWeight: 600,
                              }}
                            >
                              OUT
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="source-frame-meta">
                      <div style={{ overflow: 'hidden' }}>
                        <div className="source-frame-filename" title={fileName}>
                          {fileName}
                        </div>
                        <div className="source-frame-folder" title={folderDisplayName}>
                          {folderDisplayName}
                        </div>
                      </div>
                      <span className="badge font-mono" style={{ fontSize: '10.5px', flexShrink: 0 }}>
                        #{idx + 1}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : previewMode === 'rendered-mp4' && renderedVideoSrc ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              padding: '16px',
              gap: '12px',
            }}
          >
            <video
              ref={videoRef}
              src={renderedVideoSrc}
              controls
              autoPlay
              loop={settings.webOptimizations.seamlessLooping}
              muted
              playsInline
              style={{
                maxWidth: viewMode === 'fit' ? '100%' : 'none',
                maxHeight: viewMode === 'fit' ? 'calc(100% - 68px)' : 'none',
                transform: `scale(${zoomLevel})`,
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: '#000',
              }}
            />

            {/* Interactive Scroll-Scrubbing Simulator Bar for Rendered MP4 */}
            <div
              style={{
                width: '100%',
                maxWidth: '680px',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ fontWeight: 600 }}>
                  Interactive Scroll-Scrubbing Simulator (video.currentTime)
                </span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {renderedVideoSizeBytes
                    ? `Actual MP4 Size: ${formatBytes(renderedVideoSizeBytes)}`
                    : `Est: ${estimate.estimatedFormatted}`}
                </span>
              </div>
              <input
                type="range"
                className="range-slider"
                style={{ margin: '2px 0' }}
                min={0}
                max={100}
                step={0.2}
                value={scrollSimProgress}
                onChange={(e) => handleScrollSimChange(parseFloat(e.target.value))}
              />
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Drag rapidly to test browser hardware decode responsiveness with your current Keyframe
                Interval ({estimate.resolvedGopFrames} frames) and B-Frames ({settings.bFrames}).
              </div>
            </div>
          </div>
        ) : imageSrc ? (
          imageError ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '13px',
                  color: 'var(--color-warning)',
                  marginBottom: '6px',
                }}
              >
                Frame Image Load Error
              </div>
              <div
                className="font-mono"
                style={{ fontSize: '11px', maxWidth: '450px', wordBreak: 'break-all', marginBottom: '16px' }}
              >
                {currentFilePath}
              </div>
              {onBrowseDirectory && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ height: '30px', padding: '0 14px', fontSize: '12px' }}
                  onClick={onBrowseDirectory}
                >
                  Reselect Sequence Folder
                </button>
              )}
            </div>
          ) : previewMode === 'split' ? (
            /* A/B Split Comparison View — Responsive to Output Resolution */
            <div
              style={{
                position: 'relative',
                width: `${displayFrameWidth}px`,
                height: `${displayFrameHeight}px`,
                flexShrink: 0,
                transition: 'width 120ms ease, height 120ms ease',
                userSelect: 'none',
              }}
              onPointerDown={(e) => {
                // Clicking anywhere on the split image area jumps the divider to that point and allows dragging
                const rect = e.currentTarget.getBoundingClientRect();
                const updatePos = (clientX: number) => {
                  const pct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
                  setSplitPosition(pct);
                };
                updatePos(e.clientX);
                const onPointerMove = (moveEvent: PointerEvent) => {
                  updatePos(moveEvent.clientX);
                };
                const onPointerUp = () => {
                  window.removeEventListener('pointermove', onPointerMove);
                  window.removeEventListener('pointerup', onPointerUp);
                  document.body.classList.remove('is-resizing-x');
                };
                document.body.classList.add('is-resizing-x');
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp);
              }}
            >
              {/* Underlying Simulated MP4 Image (Right side) */}
              <img
                src={imageSrc}
                alt={`Simulated Frame ${activeFrame}`}
                onError={() => setImageError(true)}
                decoding="async"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  filter: simulatedCssFilter,
                  imageRendering: simulatedImageRendering,
                  boxShadow: 'var(--shadow-md)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />
              {/* Clipped Original Source Image (Left side) */}
              <img
                src={imageSrc}
                alt={`Original Frame ${activeFrame}`}
                decoding="async"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  clipPath: `inset(0 ${100 - splitPosition}% 0 0)`,
                  borderRadius: 'var(--radius-sm)',
                  pointerEvents: 'none',
                }}
              />
              {/* Vertical Split Divider Line with Interactive Drag Handle */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${splitPosition}%`,
                  width: '24px',
                  marginLeft: '-12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'ew-resize',
                  zIndex: 10,
                  touchAction: 'none',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const parent = e.currentTarget.parentElement;
                  if (!parent) return;
                  const rect = parent.getBoundingClientRect();
                  const updatePos = (clientX: number) => {
                    const pct = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
                    setSplitPosition(pct);
                  };
                  const onPointerMove = (moveEvent: PointerEvent) => {
                    updatePos(moveEvent.clientX);
                  };
                  const onPointerUp = () => {
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                    document.body.classList.remove('is-resizing-x');
                  };
                  document.body.classList.add('is-resizing-x');
                  window.addEventListener('pointermove', onPointerMove);
                  window.addEventListener('pointerup', onPointerUp);
                }}
                title="Drag divider line to compare Original vs Simulated MP4"
              >
                {/* Visual Line */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: '50%',
                    width: '2px',
                    marginLeft: '-1px',
                    backgroundColor: 'var(--cta-blue)',
                    boxShadow: '0 0 6px rgba(0,0,0,0.45)',
                  }}
                />
                {/* Center Circular Grab Knob */}
                <div
                  style={{
                    position: 'relative',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--cta-blue)',
                    border: '2px solid #FFFFFF',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                >
                  <ChevronsLeftRight size={13} strokeWidth={2.5} style={{ color: '#FFFFFF' }} />
                </div>
              </div>
              {/* Labels */}
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '8px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(0,0,0,0.65)',
                  color: '#fff',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  pointerEvents: 'none',
                }}
              >
                ORIGINAL ({srcW}×{srcH})
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(37, 99, 235, 0.85)',
                  color: '#fff',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  pointerEvents: 'none',
                }}
              >
                SIMULATED MP4 ({outW}×{outH}, CRF {settings.crf})
              </div>
            </div>
          ) : (
            /* Single Image View: Original or Simulated MP4 — Responsive to Output Resolution */
            <div
              style={{
                position: 'relative',
                width: `${displayFrameWidth}px`,
                height: `${displayFrameHeight}px`,
                flexShrink: 0,
                transition: 'width 120ms ease, height 120ms ease',
              }}
            >
              <img
                src={imageSrc}
                alt={`Frame ${activeFrame}`}
                onError={() => setImageError(true)}
                decoding="async"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  filter: previewMode === 'simulated' ? simulatedCssFilter : 'none',
                  boxShadow: 'var(--shadow-md)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />
              {previewMode === 'simulated' ? (
                <div
                  className="font-mono"
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    right: '10px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(0, 0, 0, 0.78)',
                    border: '1px solid var(--border-subtle)',
                    color: '#fff',
                    fontSize: '10px',
                    pointerEvents: 'none',
                  }}
                >
                  {outW}×{outH} •{' '}
                  {settings.rateControlMode === 'cbr'
                    ? `${settings.targetBitrateMbps} Mbps`
                    : `CRF ${settings.crf}`}
                </div>
              ) : (
                <div
                  className="font-mono"
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                    pointerEvents: 'none',
                  }}
                >
                  {folderDisplayName} / <strong>{currentFrameFileName}</strong> ({outW}×{outH})
                </div>
              )}
            </div>
          )
        ) : (
          <div
            onClick={onBrowseDirectory}
            style={{
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '13px',
              letterSpacing: '0.02em',
              maxWidth: '400px',
              padding: '28px 24px',
              borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--border-subtle)',
              cursor: onBrowseDirectory ? 'pointer' : 'default',
              transition: 'border-color 150ms ease, background-color 150ms ease',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
              NO IMAGE SEQUENCE LOADED
            </div>
            <div style={{ fontSize: '11.5px', lineHeight: 1.5, marginBottom: '14px' }}>
              Click here or drag &amp; drop a numbered image sequence folder to preview frames,
              estimate MP4 file size, and configure web playback optimizations.
            </div>
            {onBrowseDirectory && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ height: '30px', padding: '0 14px', fontSize: '12px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onBrowseDirectory();
                }}
              >
                Select Sequence Folder
              </button>
            )}
          </div>
        )}
        </div>

        {/* Floating Top-Right Controls: Fit | 1:1 and Zoom In / Out (Only in Simulated MP4) */}
        {previewMode === 'simulated' && hasSource && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 6px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="apple-segmented" style={{ width: 'auto' }}>
              <button
                className={`apple-segment-btn ${viewMode === 'fit' ? 'active' : ''}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={() => {
                  setViewMode('fit');
                  setZoomLevel(1);
                }}
              >
                Fit
              </button>
              <button
                className={`apple-segment-btn ${viewMode === '100%' ? 'active' : ''}`}
                style={{ padding: '3px 8px', fontSize: '11px' }}
                onClick={() => {
                  setViewMode('100%');
                  setZoomLevel(1);
                }}
              >
                1:1
              </button>
            </div>

            <div
              style={{
                width: '1px',
                height: '14px',
                backgroundColor: 'var(--border-subtle)',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <button
                type="button"
                className="btn btn-icon btn-ghost"
                style={{
                  width: '20px',
                  height: '20px',
                  padding: 0,
                  backgroundColor: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                onClick={() => setZoomLevel((z) => Math.max(0.25, Number((z - 0.25).toFixed(2))))}
                title="Zoom Out"
              >
                <ZoomOut size={12} />
              </button>
              <span
                className="font-mono"
                style={{ fontSize: '10px', minWidth: '32px', textAlign: 'center', color: 'var(--text-primary)' }}
              >
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                className="btn btn-icon btn-ghost"
                style={{
                  width: '20px',
                  height: '20px',
                  padding: 0,
                  backgroundColor: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                onClick={() => setZoomLevel((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
                title="Zoom In"
              >
                <ZoomIn size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {timelineSplitterProps && (
        <Splitter
          axis="y"
          title="Drag to resize timeline height · double-click to reset"
          {...timelineSplitterProps}
        />
      )}

      {/* 3. Transport & Timeline Scrubber Bar */}
      <div
        className={!hasSource ? 'section-unavailable' : ''}
        style={{
          height: 'var(--timeline-h, 94px)',
          minHeight: '76px',
          flexShrink: 0,
          backgroundColor: 'var(--bg-card)',
          borderTop: timelineSplitterProps ? 'none' : '0.75px solid var(--border-subtle)',
          padding: '10px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '8px',
        }}
        aria-disabled={!hasSource}
      >
        {/* Timeline Scrubber with Keyframe Interval Tick Visualization */}
        <div
          ref={timelineRef}
          className="timeline-scrubber"
          style={{
            flex: 1,
            minHeight: '22px',
            cursor: hasSource ? 'pointer' : 'not-allowed',
            touchAction: 'none',
          }}
          onPointerDown={hasSource ? handlePointerDownTimeline : undefined}
          onPointerMove={hasSource ? handlePointerMoveTimeline : undefined}
          onPointerUp={hasSource ? handlePointerUpTimeline : undefined}
          onLostPointerCapture={hasSource ? handleLostPointerCaptureTimeline : undefined}
        >
          {/* Active In-Out Selection Range Highlight */}
          {hasSource && totalFrames > 0 && (
            <div
              className="timeline-in-out-range"
              style={{
                left: `${inPercent}%`,
                width: `${Math.max(1, outPercent - inPercent)}%`,
              }}
            />
          )}

          {/* Keyframe (IDR) Cadence Markers along the Timeline */}
          {keyframeMarkers.map((marker) => (
            <div
              key={marker.frame}
              style={{
                position: 'absolute',
                bottom: 0,
                height: '6px',
                left: `${marker.pct}%`,
                width: '1.5px',
                backgroundColor: 'var(--text-muted)',
                opacity: 0.45,
                pointerEvents: 'none',
              }}
              title={`IDR Keyframe at Frame ${marker.frame}`}
            />
          ))}

          {/* In-Point Marker Tag */}
          {hasSource && totalFrames > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${inPercent}%`,
                width: '2px',
                backgroundColor: 'var(--color-info)',
                zIndex: 4,
                pointerEvents: 'none',
              }}
              title={`In-Point: Frame ${inPoint}`}
            />
          )}

          {/* Out-Point Marker Tag */}
          {hasSource && totalFrames > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${outPercent}%`,
                width: '2px',
                backgroundColor: 'var(--color-warning)',
                zIndex: 4,
                pointerEvents: 'none',
              }}
              title={`Effective Out-Point: Frame ${effectiveOutPoint}`}
            />
          )}

          {/* Playhead Marker */}
          {hasSource && totalFrames > 0 && (
            <div className="timeline-playhead" style={{ left: `${playheadPercent}%` }}>
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '-4px',
                  width: '10px',
                  height: '10px',
                  backgroundColor: 'var(--color-danger)',
                  borderRadius: '50%',
                }}
              />
            </div>
          )}
        </div>

        {/* Transport Controls & Timecode Readout */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Left: Timecode Readout (HH:MM:SS:FF) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="font-mono"
              style={{
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: hasSource ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {hasSource ? formatTimecode(activeFrame, targetFramerate * playbackSpeed) : '00:00:00:00'}
            </span>
            <span
              className="badge font-mono"
              style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}
            >
              FRAME {hasSource ? activeFrame + 1 : 0} / {totalFrames || 0}
            </span>
            {hasSource &&
              settings.webOptimizations.seamlessLooping &&
              settings.webOptimizations.dropDuplicateEndFrame && (
                <span
                  className="badge badge-info font-mono"
                  style={{ fontSize: '10px' }}
                  title="Final duplicate frame is trimmed for seamless loop repeat"
                >
                  Loop Trim (-1f)
                </span>
              )}
          </div>

          {/* Center: Transport Playback Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <button
              className="btn btn-icon"
              onClick={handleJumpIn}
              disabled={!hasSource || totalFrames === 0}
              title="Jump to In-Point"
            >
              <SkipBack size={13} />
            </button>

            <button
              className="btn btn-icon"
              onClick={handleStepBack}
              disabled={!hasSource || totalFrames === 0}
              title="Step Backward 1 Frame (Left Arrow)"
            >
              <ChevronLeft size={15} />
            </button>

            <button
              className="btn btn-primary"
              style={{ width: '36px', height: '32px', borderRadius: 'var(--radius-sm)' }}
              onClick={onTogglePlay}
              disabled={!hasSource || totalFrames === 0}
              title="Play / Pause Sequence at Target FPS (Space)"
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            </button>

            <button
              className="btn btn-icon"
              onClick={handleStepForward}
              disabled={!hasSource || totalFrames === 0}
              title="Step Forward 1 Frame (Right Arrow)"
            >
              <ChevronRight size={15} />
            </button>

            <button
              className="btn btn-icon"
              onClick={handleJumpOut}
              disabled={!hasSource || totalFrames === 0}
              title="Jump to Out-Point"
            >
              <SkipForward size={13} />
            </button>

            <button
              className={`btn btn-icon ${isLooping ? 'btn-primary' : ''}`}
              onClick={onToggleLoop}
              disabled={!hasSource || totalFrames === 0}
              title="Toggle Infinite Playback Loop (L)"
              style={{ marginLeft: '4px' }}
            >
              <Repeat size={13} />
            </button>
          </div>

          {/* Right: Set In/Out Shortcuts & Speed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <button
              className="btn"
              style={{ height: '26px', fontSize: '11px', padding: '0 7px' }}
              onClick={() => onSetInPoint(activeFrame)}
              disabled={!hasSource || totalFrames === 0}
              title="Set In-Point to Current Frame (I)"
            >
              Set In [I]
            </button>
            <button
              className="btn"
              style={{ height: '26px', fontSize: '11px', padding: '0 7px' }}
              onClick={() => onSetOutPoint(activeFrame)}
              disabled={!hasSource || totalFrames === 0}
              title="Set Out-Point to Current Frame (O)"
            >
              Set Out [O]
            </button>

            <AppleDropdown<string>
              value={String(playbackSpeed)}
              options={PLAYBACK_SPEED_OPTIONS}
              compact
              disabled={!hasSource}
              monoTrigger
              minWidth={68}
              menuWidth={168}
              align="right"
              direction="up"
              title="Preview Playback Speed Multiplier"
              onChange={(val) => setPlaybackSpeed(parseFloat(val))}
            />
          </div>
        </div>
      </div>
    </main>
  );
};
