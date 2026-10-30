import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  FolderOpen,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { ExportSettings, RenderState } from '../../electron/types';
import { MP4EstimateResult } from '../core/mp4Estimator';
import { formatBytes } from '../core/timecode';
import { resolveMediaUrl } from '../core/previewUrl';

/** What an export was started with, captured when it starts so later edits in the
 *  editor don't change the report */
export interface ExportRun {
  settings: ExportSettings;
  estimate: MP4EstimateResult;
  /** Up to 10 frames spread across the exported range, for the frame stack */
  framePaths: string[];
  sequenceName: string;
  sampleFilePath?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  outputFileName: string;
  startedAt: number;
  finishedAt?: number;
}

interface ExportReportProps {
  run: ExportRun;
  renderState: RenderState;
  projectName?: string;
  onBack: () => void;
  onCancel: () => void;
  onShowInFolder: (path: string) => void;
  onExportAgain: () => void;
}

const CODEC_LABELS: Record<ExportSettings['codec'], string> = {
  libx264: 'H.264',
  libx265: 'H.265',
  libsvtav1: 'AV1 (SVT)',
  'libaom-av1': 'AV1 (AOM)',
};

/** Splits "26.9 KB" / "1.32 s" into a number and its unit */
function splitValue(text: string): [string, string] {
  const i = text.lastIndexOf(' ');
  return i > 0 ? [text.slice(0, i), text.slice(i + 1)] : [text, ''];
}

/** Network timings: milliseconds under a second */
function formatSeconds(s: number): string {
  if (!isFinite(s) || s < 0) return '—';
  if (s < 1) return `${Math.round(s * 1000)} ms`;
  return formatClock(s);
}

/** Lengths and elapsed time: always in seconds (or m:ss) */
function formatClock(s: number): string {
  if (!isFinite(s) || s < 0) return '—';
  if (s < 10) return `${s.toFixed(2)} s`;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')} min`;
}

/** Eases a number up to `target` once it is known (instant with reduced motion) */
function useCountUp(target: number, active: boolean, durationMs = 750): number {
  const [value, setValue] = useState(active ? 0 : target);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!active || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    // Frames don't run while the window is hidden; land on the value regardless
    const settle = window.setTimeout(() => setValue(target), durationMs + 150);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      window.clearTimeout(settle);
    };
  }, [target, active, durationMs]);

  return value;
}

/* ---------------------------------------------------------------------------
   Illustrations, each drawn from the export's own numbers
   --------------------------------------------------------------------------- */

/** The hero: sequence frames dealt onto a receding stack as the encode advances;
 *  once done, the front card plays the finished MP4 */
const FrameStack: React.FC<{
  frames: string[];
  progress: number;
  isRendering: boolean;
  videoSrc: string | null;
  aspect: number;
}> = ({ frames, progress, isRendering, videoSrc, aspect }) => {
  const n = Math.max(1, frames.length);
  const visible = videoSrc ? n : Math.max(1, Math.min(n, Math.ceil((progress / 100) * n)));

  return (
    <div className="xr-stack" style={{ '--n': n, '--aspect': aspect } as React.CSSProperties}>
      {frames.slice(0, visible).map((fp, i) => {
        const isFront = i === visible - 1;
        const depth = n > 1 ? i / (n - 1) : 1;
        const src = resolveMediaUrl(fp);
        return (
          <div
            key={fp + i}
            className={`xr-stack-card ${isFront ? 'is-front' : ''}`}
            style={
              {
                '--i': i,
                '--shade': (0.35 + depth * 0.65).toFixed(2),
              } as React.CSSProperties
            }
          >
            {isFront && videoSrc ? (
              <video src={videoSrc} autoPlay muted loop playsInline />
            ) : src ? (
              <img src={src} alt="" />
            ) : null}
            {isFront && isRendering && <span className="xr-scanline" />}
          </div>
        );
      })}
    </div>
  );
};

/** One bar per frame (sampled when there are many), filled as frames encode,
 *  with keyframes picked out and a time ruler underneath */
const FrameBarcode: React.FC<{
  totalFrames: number;
  progress: number;
  gop: number;
  duration: number;
}> = ({ totalFrames, progress, gop, duration }) => {
  const bars = Math.max(1, Math.min(totalFrames, 140));
  const stride = totalFrames / bars;
  const labels = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="xr-barcode">
      <div className="xr-barcode-labels">
        {labels.map((t) => (
          <span key={t}>Frame {Math.max(1, Math.round(t * totalFrames))}</span>
        ))}
      </div>
      <div className="xr-barcode-bars" aria-hidden="true">
        {Array.from({ length: bars }, (_, i) => {
          const frame = Math.floor(i * stride);
          const isKey = gop > 0 && Math.floor(frame / gop) !== Math.floor((frame - stride) / gop);
          const done = (i + 1) / bars <= progress / 100 + 1e-9;
          return (
            <span
              key={i}
              className={`xr-bar ${done ? 'is-done' : ''} ${isKey || i === 0 ? 'is-key' : ''}`}
            />
          );
        })}
      </div>
      <div className="xr-ruler" aria-hidden="true" />
      <div className="xr-barcode-labels is-time">
        {labels.map((t) => (
          <span key={t}>{formatClock(duration * t)}</span>
        ))}
      </div>
    </div>
  );
};

interface DotRow {
  label: string;
  value: string;
  /** 0–1, how much of the row lights up */
  level: number;
  tone?: 'accent' | 'ink' | 'muted';
}

/** Labelled comparison rows: name, a dot bar, the value; `note` says how to read them */
const DotRows: React.FC<{ rows: DotRow[]; note: string }> = ({ rows, note }) => {
  const dots = 18;
  return (
    <div className="xr-dotrows">
      {rows.map((r) => {
        const lit = Math.max(1, Math.round(Math.min(1, Math.max(0, r.level)) * dots));
        return (
          <div key={r.label} className={`xr-dotrow is-${r.tone || 'muted'}`}>
            <span className="xr-dotrow-label">{r.label}</span>
            <span className="xr-dotrow-bar" aria-hidden="true">
              {Array.from({ length: dots }, (_, i) => (
                <i key={i} className={i < lit ? 'is-lit' : ''} />
              ))}
            </span>
            <span className="xr-dotrow-value">{r.value}</span>
          </div>
        );
      })}
      <span className="xr-dotrows-note">{note}</span>
    </div>
  );
};

/** Nine dot columns lit up to the score */
const DotMeter: React.FC<{ score: number }> = ({ score }) => {
  const cols = 9;
  const lit = Math.round((score / 100) * cols);
  return (
    <div className="xr-meter" aria-hidden="true">
      {Array.from({ length: cols }, (_, c) => (
        <span key={c} className={`xr-meter-col ${c < lit ? 'is-lit' : ''}`}>
          {Array.from({ length: 1 + (c % 4) + Math.floor(c / 3) }, (_, r) => (
            <i key={r} />
          ))}
        </span>
      ))}
    </div>
  );
};

/** A signal-strength glyph in dots: how many of the four bars light up follows
 *  the loading score */
const SignalDots: React.FC<{ score: number }> = ({ score }) => {
  const lit = Math.max(1, Math.round((score / 100) * 4));
  return (
    <span className="xr-signal" aria-hidden="true">
      {[1, 2, 3, 4].map((h) => (
        <span key={h} className={h <= lit ? 'is-lit' : ''}>
          {Array.from({ length: h * 2 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      ))}
    </span>
  );
};

/** Bottom-aligned bars, one highlighted */
const Bars: React.FC<{ values: number[]; highlight: number }> = ({ values, highlight }) => {
  const max = Math.max(...values, 1e-6);
  return (
    <div className="xr-bars" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={i === highlight ? 'is-hi' : ''}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
};

/* ---------------------------------------------------------------------------
   Page
   --------------------------------------------------------------------------- */

export const ExportReport: React.FC<ExportReportProps> = ({
  run,
  renderState,
  projectName,
  onBack,
  onCancel,
  onShowInFolder,
  onExportAgain,
}) => {
  const { settings, estimate } = run;
  const status = renderState.status;
  const isRendering = status === 'rendering';
  const isDone = status === 'completed';

  // Result shows what the encoder produced; Estimate shows the prediction it started from
  const [view, setView] = useState<'result' | 'estimate'>('result');
  const showResult = isDone && view === 'result';

  // Tick the elapsed clock while encoding
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isRendering) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [isRendering]);

  // Encoder speed over time, for the speed chart
  const [fpsSamples, setFpsSamples] = useState<number[]>([]);
  useEffect(() => {
    const fps = renderState.progress.fps;
    if (isRendering && fps > 0) setFpsSamples((prev) => [...prev.slice(-29), fps]);
  }, [isRendering, renderState.progress.fps]);

  const elapsedSec = ((run.finishedAt ?? now) - run.startedAt) / 1000;
  const totalFrames = estimate.totalOutputFrames;
  const duration = estimate.durationSeconds;
  const actualBytes = isDone ? renderState.outputSizeBytes || 0 : 0;
  const shownBytes = useCountUp(actualBytes, isDone && actualBytes > 0);

  const actualMbps = actualBytes && duration > 0 ? (actualBytes * 8) / duration / 1e6 : 0;
  const bitrate = showResult && actualMbps ? actualMbps : estimate.estimatedBitrateMbps;
  const capMbps = settings.maxBitrateMbps || Math.max(bitrate * 2, 1);
  const deltaPct =
    actualBytes && estimate.estimatedBytes
      ? ((actualBytes - estimate.estimatedBytes) / estimate.estimatedBytes) * 100
      : 0;
  // Network timings scale with the real file size
  const sizeRatio =
    showResult && actualBytes && estimate.estimatedBytes ? actualBytes / estimate.estimatedBytes : 1;
  const finalBytes = showResult && actualBytes ? actualBytes : estimate.estimatedBytes;
  const sourceBytes = estimate.rawSequenceBytes;
  const savings = sourceBytes > 0 ? (1 - finalBytes / sourceBytes) * 100 : 0;
  // Log scale so a 100× gap between frames and MP4 still reads as a ramp
  const logLevel = (b: number) =>
    b > 0 && sourceBytes > 1 ? Math.max(0.08, Math.log10(b) / Math.log10(sourceBytes)) : 0.08;

  const progress = isDone ? 100 : renderState.progress.progressPercent || 0;
  const framesDone = isDone ? totalFrames : Math.min(totalFrames, renderState.progress.frame || 0);
  const encodeFps = elapsedSec > 0 ? framesDone / elapsedSec : 0;

  const outW = estimate.outputWidth;
  const outH = estimate.outputHeight;
  const srcW = run.sourceWidth || outW;
  const srcH = run.sourceHeight || outH;

  const outputName = renderState.outputPath
    ? renderState.outputPath.split(/[/\\]/).pop() || run.outputFileName
    : run.outputFileName;
  const videoSrc = isDone ? resolveMediaUrl(renderState.outputPath, renderState.outputSizeBytes || 1) : null;
  const showInFolder = () => renderState.outputPath && onShowInFolder(renderState.outputPath);

  const title = isDone
    ? 'Export Complete'
    : isRendering
    ? renderState.progress.fps > 0
      ? 'Encoding'
      : 'Preparing'
    : status === 'cancelled'
    ? 'Cancelled'
    : 'Export Failed';

  const [sizeValue, sizeUnit] = splitValue(formatBytes(showResult ? shownBytes : finalBytes));
  const [timeValue, timeUnit] = splitValue(formatClock(elapsedSec));
  const [loadValue, loadUnit] = splitValue(formatSeconds(estimate.fast4gLoadSeconds * sizeRatio));
  const settingsLine = [
    CODEC_LABELS[settings.codec],
    settings.rateControlMode === 'cbr' ? `${settings.targetBitrateMbps} Mbps` : `CRF ${settings.crf}`,
    settings.preset,
    `GOP ${estimate.resolvedGopFrames}`,
  ].join(' · ');

  const scores = [
    {
      name: 'Visual quality',
      sub: `${estimate.tradeOffs.visualFidelityLabel} · ${
        settings.rateControlMode === 'cbr' ? `${settings.targetBitrateMbps} Mbps` : `CRF ${settings.crf}`
      }`,
      score: estimate.tradeOffs.visualFidelityScore,
    },
    {
      name: 'File size',
      sub: `${estimate.tradeOffs.fileSizeLabel} · ${formatBytes(finalBytes)}`,
      score: estimate.tradeOffs.fileSizeScore,
    },
    {
      name: 'Loading speed',
      sub: `${estimate.tradeOffs.loadingSpeedLabel} · ${formatSeconds(estimate.fast4gLoadSeconds * sizeRatio)} on 4G`,
      score: estimate.tradeOffs.loadingSpeedScore,
    },
    {
      name: 'Playback',
      sub: `${estimate.tradeOffs.playbackSmoothnessLabel} · GOP ${estimate.resolvedGopFrames}, ${settings.bFrames} B-frames`,
      score: estimate.tradeOffs.playbackSmoothnessScore,
    },
  ];

  const speedBars = fpsSamples.length >= 2 ? fpsSamples.slice(-6) : [encodeFps];
  const speedPeak = speedBars.indexOf(Math.max(...speedBars));

  return (
    <div className="export-page">
      <header className="export-topbar">
        <div className="export-topbar-left">
          <button className="xr-square" onClick={onBack} title="Back to the editor" aria-label="Back to the editor">
            <ArrowLeft size={15} />
          </button>
          <div className="export-topbar-title">
            <span className="export-topbar-name">Export</span>
            {projectName && (
              <>
                <span className="export-topbar-sep">/</span>
                <span className="export-topbar-project">{projectName}</span>
              </>
            )}
          </div>
        </div>
        <div className="export-topbar-right">
          <span className={`xr-chip ${isRendering ? 'is-live' : isDone ? 'is-done' : ''}`}>
            <span className="xr-chip-dot" />
            {isRendering ? 'Encoding' : isDone ? 'Complete' : status === 'cancelled' ? 'Cancelled' : 'Failed'}
          </span>
          {isRendering ? (
            <button className="xr-text-btn" onClick={onCancel}>
              <X size={13} />
              Cancel
            </button>
          ) : (
            <button className="xr-text-btn" onClick={onExportAgain}>
              <RotateCcw size={13} />
              {isDone ? 'Export again' : 'Try again'}
            </button>
          )}
        </div>
      </header>

      <div className="export-body">
        <div className="xr-grid">
          {/* Hero: the frames stacking into a video */}
          <section className="xr-panel xr-hero" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="xr-hero-head">
              <h1 className="xr-display">{title}</h1>
              <div className="xr-hero-chips">
                {isDone && (
                  <span className="xr-chip">
                    <ArrowUpRight size={12} />
                    {deltaPct >= 0 ? '+' : '−'}
                    {Math.abs(deltaPct).toFixed(1)}%
                  </span>
                )}
                <span className="xr-chip is-cream">{Math.round(progress)}%</span>
              </div>
            </div>

            <div className="xr-hero-stage">
              <div className="xr-hero-meta">
                <span className="xr-struck font-dot">
                  {srcW}×{srcH}
                </span>
                <span className="xr-hero-to">
                  {outW}×{outH} · {CODEC_LABELS[settings.codec]} MP4
                </span>
                <dl className="xr-facts">
                  <div>
                    <dt>Frames</dt>
                    <dd>
                      {framesDone} / {totalFrames}
                    </dd>
                  </div>
                  <div>
                    <dt>Elapsed</dt>
                    <dd>{formatClock(elapsedSec)}</dd>
                  </div>
                  <div>
                    <dt>{isRendering ? 'Remaining' : 'Speed'}</dt>
                    <dd>
                      {isRendering
                        ? renderState.progress.estimatedRemainingSeconds !== undefined
                          ? `~${formatClock(renderState.progress.estimatedRemainingSeconds)}`
                          : '—'
                        : `${encodeFps.toFixed(1)} fps`}
                    </dd>
                  </div>
                </dl>
                {renderState.errorMessage && !isRendering && !isDone && (
                  <p className="xr-error">{renderState.errorMessage}</p>
                )}
              </div>
              {/* Frame stack hero, turned off for now: dark frames read as a wall of black cards
              <FrameStack
                frames={run.framePaths.length ? run.framePaths : run.sampleFilePath ? [run.sampleFilePath] : []}
                progress={progress}
                isRendering={isRendering}
                videoSrc={videoSrc}
                aspect={outW / Math.max(1, outH)}
              />
              */}
            </div>

            <FrameBarcode
              totalFrames={totalFrames}
              progress={progress}
              gop={estimate.resolvedGopFrames}
              duration={duration}
            />
          </section>

          {/* Output size */}
          <section className="xr-panel xr-size" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="xr-panel-head">
              <span className="xr-panel-title">Output Size</span>
              <div className="xr-head-tools">
              <div className="xr-toggle" role="tablist">
                <button
                  className={view === 'result' ? 'is-on' : ''}
                  role="tab"
                  aria-selected={view === 'result'}
                  onClick={() => setView('result')}
                  disabled={!isDone}
                >
                  Result
                </button>
                <button
                  className={view === 'estimate' || !isDone ? 'is-on' : ''}
                  role="tab"
                  aria-selected={view === 'estimate'}
                  onClick={() => setView('estimate')}
                >
                  Estimate
                </button>
              </div>
              <button
                className="xr-square"
                onClick={showInFolder}
                disabled={!isDone || !renderState.outputPath}
                title="Show in folder"
                aria-label="Show in folder"
              >
                <FolderOpen size={14} />
              </button>
              </div>
            </div>
            <div className="xr-compact-body">
              <div className="xr-compact-figure">
                <div className="xr-figure">
                  <span className="font-dot xr-figure-value is-mid">{sizeValue}</span>
                  <span className="xr-figure-unit">{sizeUnit}</span>
                </div>
                <span className="xr-label">{showResult ? 'Final file size' : 'Estimated file size'}</span>
              </div>
              <DotRows
                rows={[
                  { label: 'Source frames', value: formatBytes(sourceBytes), level: 1 },
                  {
                    label: 'Estimate',
                    value: formatBytes(estimate.estimatedBytes),
                    level: logLevel(estimate.estimatedBytes),
                    tone: 'ink',
                  },
                  ...(isDone && actualBytes
                    ? [{ label: 'MP4', value: formatBytes(actualBytes), level: logLevel(actualBytes), tone: 'accent' as const }]
                    : []),
                ]}
                note={`The MP4 is ${Math.max(1, Math.round(sourceBytes / Math.max(finalBytes, 1)))}× smaller than the frames (${savings.toFixed(1)}% saved)${
                  isDone ? `, ${deltaPct >= 0 ? '+' : '−'}${Math.abs(deltaPct).toFixed(1)}% vs the estimate` : ''
                }. Bars use a log scale so the small file still shows.`}
              />
            </div>
          </section>

          {/* Bitrate */}
          <section className="xr-panel xr-rate" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="xr-panel-head">
              <span className="xr-panel-title">Bitrate</span>
              <button className="xr-square" onClick={onBack} title="Adjust in the editor" aria-label="Adjust in the editor">
                <SlidersHorizontal size={14} />
              </button>
            </div>
            <div className="xr-compact-body">
              <div className="xr-compact-figure">
                <div className="xr-figure">
                  <span className="font-dot xr-figure-value is-mid">{bitrate.toFixed(2)}</span>
                  <span className="xr-figure-unit">Mbps</span>
                </div>
                <span className="xr-label">{showResult ? 'Average, measured' : 'Average, estimated'}</span>
              </div>
              <DotRows
                rows={[
                  {
                    label: 'Estimate',
                    value: `${estimate.estimatedBitrateMbps.toFixed(2)} Mbps`,
                    level: estimate.estimatedBitrateMbps / capMbps,
                    tone: 'ink',
                  },
                  ...(isDone && actualMbps
                    ? [{ label: 'Measured', value: `${actualMbps.toFixed(2)} Mbps`, level: actualMbps / capMbps, tone: 'accent' as const }]
                    : []),
                  { label: 'Peak cap', value: `${capMbps} Mbps`, level: 1 },
                ]}
                note={`Bars fill toward the ${capMbps} Mbps peak cap set in Rate Control; this export averages ${Math.round(
                  (bitrate / capMbps) * 100
                )}% of it. Measured = file size ÷ video length.`}
              />
            </div>
          </section>

          {/* Trade-off scores, on the cream panel */}
          <section className="xr-panel xr-cream" style={{ '--i': 3 } as React.CSSProperties}>
            <span className="xr-panel-title">Trade-off Scores</span>
            <div className="xr-rows">
              {scores.map((s) => (
                <div key={s.name} className="xr-row">
                  <div className="xr-row-text">
                    <span className="xr-row-name">{s.name}</span>
                    <span className="xr-row-sub">{s.sub}</span>
                  </div>
                  <DotMeter score={s.score} />
                  <span className="xr-row-value font-dot">{Math.round(s.score)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Delivery, with the next steps */}
          <section className="xr-panel xr-delivery" style={{ '--i': 4 } as React.CSSProperties}>
            <div className="xr-panel-head">
              <span className="xr-panel-title">Delivery</span>
            </div>
            <div className="xr-delivery-body">
              <div className="xr-delivery-figure">
                <div className="xr-label-row">
                  <span className="xr-label">Fast 4G load</span>
                  <span className="xr-chip is-small">{estimate.tradeOffs.loadingSpeedLabel}</span>
                </div>
                <div className="xr-figure">
                  <span className="font-dot xr-figure-value">{loadValue}</span>
                  <span className="xr-figure-unit">/{loadUnit}</span>
                </div>
              </div>
              <SignalDots score={estimate.tradeOffs.loadingSpeedScore} />
            </div>
            <DotRows
              rows={(() => {
                const firstFrame = estimate.timeToFirstFrameMs / 1000;
                const fast4g = estimate.fast4gLoadSeconds * sizeRatio;
                const wifi = estimate.wifiLoadSeconds * sizeRatio;
                const max = Math.max(firstFrame, fast4g, wifi, 1e-6);
                return [
                  { label: 'First frame', value: formatSeconds(firstFrame), level: firstFrame / max, tone: 'ink' as const },
                  { label: 'Fast 4G', value: formatSeconds(fast4g), level: fast4g / max, tone: 'accent' as const },
                  { label: 'Wi-Fi', value: formatSeconds(wifi), level: wifi / max },
                ];
              })()}
              note="Estimated time before playback starts (first frame) and to download the whole file. Shorter rows load faster; the signal bars follow the loading score."
            />
            <div className="xr-actions">
              <button className="xr-action" onClick={showInFolder} disabled={!isDone || !renderState.outputPath}>
                <span className="xr-action-tag">Open</span>
                <span className="xr-action-text">{outputName}</span>
                <span className="xr-action-icon">
                  <ArrowUpRight size={14} />
                </span>
              </button>
              <button className="xr-action" onClick={onExportAgain} disabled={isRendering}>
                <span className="xr-action-tag">Again</span>
                <span className="xr-action-text">{settingsLine}</span>
                <span className="xr-action-icon">
                  <RotateCcw size={13} />
                </span>
              </button>
              <button className="xr-action is-accent" onClick={onBack}>
                <span className="xr-action-tag">Editor</span>
                <span className="xr-action-text">Back to the tools to adjust settings</span>
                <span className="xr-action-icon">
                  <ArrowLeft size={14} />
                </span>
              </button>
            </div>
          </section>

          {/* Frames + encode time */}
          <div className="xr-smalls">
            <section className="xr-panel xr-small" style={{ '--i': 5 } as React.CSSProperties}>
              <div className="xr-figure">
                <span className="font-dot xr-figure-value is-small">{totalFrames}</span>
                <span className="xr-figure-unit">{settings.targetFramerate} fps</span>
              </div>
              <span className="xr-label">Frames</span>
              <div className="xr-thumbs">
                {run.framePaths.slice(0, 3).map((fp, i) => {
                  const src = resolveMediaUrl(fp);
                  return <span key={i}>{src && <img src={src} alt="" />}</span>;
                })}
              </div>
            </section>
            <section className="xr-panel xr-small" style={{ '--i': 6 } as React.CSSProperties}>
              <div className="xr-panel-head">
                <div className="xr-figure">
                  <span className="font-dot xr-figure-value is-small">{timeValue}</span>
                  <span className="xr-figure-unit">{timeUnit}</span>
                </div>
                <span className="xr-chip is-small">
                  <ArrowUpRight size={11} />
                  {(duration / Math.max(elapsedSec, 1e-6)).toFixed(2)}×
                </span>
              </div>
              <span className="xr-label">Encode time</span>
              <span className="xr-note xr-small-foot">{encodeFps.toFixed(1)} frames per second</span>
            </section>
          </div>

          {/* Encode speed, on the slate panel */}
          <section className="xr-panel xr-slate" style={{ '--i': 7 } as React.CSSProperties}>
            <span className="xr-label">Encode speed</span>
            <div className="xr-slate-body">
              <div className="xr-figure">
                <span className="font-dot xr-figure-value">{encodeFps.toFixed(1)}</span>
                <span className="xr-figure-unit">/fps</span>
              </div>
              <Bars values={speedBars} highlight={speedPeak} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
