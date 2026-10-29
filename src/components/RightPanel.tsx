import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  XCircle,
  Lock,
  Unlock,
  Check,
  Copy,
  Code2,
  AlertTriangle,
  Info,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  ExportSettings,
  SequenceItem,
  RenderState,
  VideoCodec,
  EncoderPreset,
  ResolutionScale,
  ScalingAlgorithm,
  RateControlMode,
  KeyframeIntervalMode,
  H264Profile,
  EncoderTune,
  UseCasePresetId,
} from '../../electron/types';
import { formatOutputFilename } from '../core/ffmpegGenerator';
import {
  USE_CASE_PRESETS,
  SETTING_GUIDANCE,
  SettingGuidance,
} from '../core/presetsAndGuidance';
import { MP4EstimateResult, generateWebEmbedSnippet } from '../core/mp4Estimator';
import { formatBytes } from '../core/timecode';
import { loadPersistedUIState, savePersistedUIState } from '../core/cookieStore';
import { AppleDropdown, AppleDropdownOption } from './AppleDropdown';
import { ResizableSection } from './ResizableSection';

interface RightPanelProps {
  settings: ExportSettings;
  onChangeSettings: (updater: (prev: ExportSettings) => ExportSettings) => void;
  selectedSequence: SequenceItem | null;
  estimate: MP4EstimateResult;
  renderState: RenderState;
  ffmpegInfo?: {
    available: boolean;
    binaryPath: string;
    isBundled?: boolean;
    version?: string;
    error?: string;
  } | null;
  onStartRender: () => void;
  onCancelRender: () => void;
  onSelectOutputDirectory: () => void;
  onOpenOutputFolder: (path: string) => void;
  onBrowseSequenceDirectory?: () => void;
}

type ConfigAreaTab = 'web' | 'quality' | 'performance';

const PRESET_OPTIONS: AppleDropdownOption<EncoderPreset>[] = [
  { label: 'Ultrafast', sublabel: 'Fastest export', badge: '1×', value: 'ultrafast' },
  { label: 'Veryfast', sublabel: 'Quick preview', badge: '2×', value: 'veryfast' },
  { label: 'Fast', sublabel: 'Balanced speed', badge: '3×', value: 'fast' },
  { label: 'Medium', sublabel: 'Standard', badge: '4×', value: 'medium' },
  { label: 'Slow', sublabel: 'Recommended web density', badge: 'Rec', value: 'slow' },
  { label: 'Slower', sublabel: 'High compression', badge: '6×', value: 'slower' },
  { label: 'Veryslow', sublabel: 'Maximum byte savings', badge: 'Max', value: 'veryslow' },
];

const TUNE_OPTIONS: AppleDropdownOption<EncoderTune>[] = [
  { label: 'Default', sublabel: 'Balanced psychovisual tuning', value: 'none' },
  { label: 'Fastdecode', sublabel: 'Scroll scrubbing & low CPU', badge: 'Web', value: 'fastdecode' },
  { label: 'Animation', sublabel: 'UI, flat vectors & sharp text', value: 'animation' },
  { label: 'Film', sublabel: '3D renders & smooth gradients', value: 'film' },
  { label: 'Zerolatency', sublabel: 'Instant frame decoding', value: 'zerolatency' },
];

const COMMON_FPS = [12, 24, 25, 30, 60];

const SettingTitleWithInfo: React.FC<{
  title: string;
  guidance: SettingGuidance;
}> = ({ title, guidance }) => {
  return (
    <div className="setting-title-group">
      <span className="setting-title">{title}</span>
      <span className="setting-info-trigger" tabIndex={0} aria-label={`${title} definition`}>
        <Info size={12.5} />
        <div className="setting-info-popover" role="tooltip">
          <div className="setting-info-popover-section">{guidance.whatItDoes}</div>
          <div className="setting-info-popover-section">
            <span className="setting-info-popover-label">Impact: </span>
            {guidance.impact}
          </div>
          <div className="setting-info-popover-section">
            <span className="setting-info-popover-label">When to use: </span>
            {guidance.whenToUse}
          </div>
          {guidance.cliFlag && (
            <div className="setting-info-popover-cli font-mono">{guidance.cliFlag}</div>
          )}
        </div>
      </span>
    </div>
  );
};

export const RightPanel: React.FC<RightPanelProps> = React.memo(({
  settings,
  onChangeSettings,
  selectedSequence,
  estimate,
  renderState,
  ffmpegInfo,
  onStartRender,
  onCancelRender,
  onSelectOutputDirectory,
  onOpenOutputFolder,
  onBrowseSequenceDirectory,
}) => {
  const [activeTab, setActiveTab] = useState<ConfigAreaTab>(
    () => loadPersistedUIState().inspectorTab || 'quality'
  );
  const [showSnippet, setShowSnippet] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);

  useEffect(() => {
    savePersistedUIState({ inspectorTab: activeTab });
  }, [activeTab]);

  const hasSource = Boolean(
    selectedSequence && (selectedSequence.totalFrames || selectedSequence.filePaths?.length || 0) > 0
  );

  const outW = estimate.outputWidth;
  const outH = estimate.outputHeight;

  const previewFilename = selectedSequence
    ? formatOutputFilename(settings.filenameTemplate, selectedSequence, settings, outW, outH)
    : 'sequence_24fps_1920x1080_crf20.mp4';

  const previewFullPath = `${(
    settings.outputDirectory ||
    selectedSequence?.directory ||
    '...'
  ).replace(/[/\\]+$/, '')}/${previewFilename}`;

  const updateWithCustomPreset = (updater: (prev: ExportSettings) => ExportSettings) => {
    onChangeSettings((prev) => {
      const next = updater(prev);
      return {
        ...next,
        format: 'mp4',
        useCasePreset: 'custom',
      };
    });
  };

  const applyUseCasePreset = (presetId: Exclude<UseCasePresetId, 'custom'>) => {
    const found = USE_CASE_PRESETS.find((p) => p.id === presetId);
    if (found) {
      onChangeSettings((prev) => found.apply(prev));
    }
  };

  const activePresetDef = USE_CASE_PRESETS.find((p) => p.id === settings.useCasePreset);

  const htmlSnippet = generateWebEmbedSnippet(settings, previewFilename, outW, outH);

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(htmlSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const isRendering = renderState.status === 'rendering';

  const canRender =
    hasSource &&
    settings.outPoint >= settings.inPoint &&
    (ffmpegInfo ? ffmpegInfo.available : true);

  const exportFlyout: {
    title: string;
    message: string;
    showSelectSequenceBtn?: boolean;
  } | null = !selectedSequence
    ? {
        title: 'Cannot Export — No Sequence Loaded',
        message:
          'Select or drag & drop a numbered image sequence folder in the Left Panel before exporting an MP4 video.',
        showSelectSequenceBtn: true,
      }
    : selectedSequence.totalFrames === 0
    ? {
        title: 'Cannot Export — 0 Valid Frames',
        message: 'The selected folder does not contain any numbered image sequence frames.',
        showSelectSequenceBtn: true,
      }
    : settings.outPoint < settings.inPoint
    ? {
        title: 'Cannot Export — Invalid Frame Range',
        message: `Out-Point (${settings.outPoint}) must be greater than or equal to In-Point (${settings.inPoint}).`,
      }
    : ffmpegInfo && !ffmpegInfo.available
    ? {
        title: 'Cannot Export — FFmpeg Engine Unavailable',
        message:
          ffmpegInfo.error ||
          'FFmpeg binary could not be initialized. Click the Settings icon in the top header to configure FFmpeg.',
      }
    : renderState.status === 'error' && renderState.errorMessage
    ? {
        title: 'Export Failed',
        message: renderState.errorMessage,
      }
    : null;

  const resolvedOutputFolderDisplay =
    settings.outputDirectory ||
    (selectedSequence?.directory && !selectedSequence.filePaths[0]?.startsWith('blob:')
      ? selectedSequence.directory
      : 'Default (Same as sequence / exports folder)');

  return (
    <aside className="side-panel side-panel-right">
      {/* 1. Minimalist Apple Output Summary (Sticky & Non-scrollable) */}
      <div
        id="right-output-summary"
        className={`panel-section ${!hasSource ? 'section-unavailable' : ''}`}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          overflow: 'visible',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '4px',
          }}
        >
          <span
            className="font-mono"
            style={{
              fontSize: '22px',
              fontWeight: 600,
              letterSpacing: '-0.03em',
              color: hasSource ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {hasSource ? estimate.estimatedFormatted : '0 KB'}
          </span>
          <span
            className="font-mono"
            style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}
          >
            {hasSource
              ? `${outW}×${outH} · ${settings.targetFramerate} fps · ${estimate.estimatedBitrateMbps} Mbps`
              : '0×0 · 0 fps · 0 Mbps'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginBottom: '12px',
          }}
        >
          <span>Range: {hasSource ? estimate.estimatedRangeFormatted : '0 KB – 0 KB'}</span>
          <span>4G load ~{hasSource ? `${estimate.fast4gLoadSeconds}s` : '0s'}</span>
        </div>

        {/* Clean 4-Column Monochrome Trade-Off Bars */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[
            { label: 'Size', score: hasSource ? estimate.tradeOffs.fileSizeScore : 0 },
            { label: 'Quality', score: hasSource ? estimate.tradeOffs.visualFidelityScore : 0 },
            { label: 'Load', score: hasSource ? estimate.tradeOffs.loadingSpeedScore : 0 },
            { label: 'Smooth', score: hasSource ? estimate.tradeOffs.playbackSmoothnessScore : 0 },
          ].map((pillar) => (
            <div key={pillar.label}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '10.5px',
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                }}
              >
                <span>{pillar.label}</span>
                <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
                  {hasSource ? `${pillar.score}%` : '0%'}
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '3px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${hasSource ? pillar.score : 0}%`,
                    height: '100%',
                    backgroundColor: 'var(--text-primary)',
                    transition: 'width 200ms ease',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {hasSource && estimate.warnings.length > 0 && (
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {estimate.warnings.map((warn, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  fontSize: '11px',
                  lineHeight: 1.35,
                }}
              >
                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{warn}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Simple Apple Use-Case Presets (Monochrome Selection) */}
      <ResizableSection
        id="right-presets"
        className={`panel-section ${!hasSource ? 'section-unavailable' : ''}`}
        minHeight={90}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}
        >
          <span className="apple-section-label">Preset</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {settings.useCasePreset === 'custom' ? 'Custom' : activePresetDef?.shortLabel}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
          {USE_CASE_PRESETS.map((preset) => {
            const isSelected = settings.useCasePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`apple-preset-tile ${isSelected ? 'selected' : ''}`}
                onClick={() => applyUseCasePreset(preset.id)}
              >
                <span className="apple-preset-title">{preset.shortLabel}</span>
                <span className="apple-preset-sub">{preset.badge}</span>
              </button>
            );
          })}
        </div>

        {activePresetDef && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}
          >
            {activePresetDef.description}
          </div>
        )}
      </ResizableSection>

      {/* 3. Native Apple Segmented Control for the 3 Core Areas */}
      <div
        className={!hasSource ? 'section-unavailable' : ''}
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div className="apple-segmented">
          <button
            type="button"
            className={`apple-segment-btn ${activeTab === 'web' ? 'active' : ''}`}
            disabled={!hasSource}
            onClick={() => setActiveTab('web')}
          >
            Web
          </button>
          <button
            type="button"
            className={`apple-segment-btn ${activeTab === 'quality' ? 'active' : ''}`}
            disabled={!hasSource}
            onClick={() => setActiveTab('quality')}
          >
            Quality
          </button>
          <button
            type="button"
            className={`apple-segment-btn ${activeTab === 'performance' ? 'active' : ''}`}
            disabled={!hasSource}
            onClick={() => setActiveTab('performance')}
          >
            Tuning
          </button>
        </div>
      </div>

      {/* =====================================================================
          AREA 1: WEB OPTIMIZATION
         ===================================================================== */}
      {activeTab === 'web' && (
        <ResizableSection
          id="right-tab-web"
          className={`panel-section ${!hasSource ? 'section-unavailable' : ''}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          minHeight={120}
        >
          {/* Faststart */}
          <div className="apple-setting-row">
            <div className="apple-setting-top">
              <SettingTitleWithInfo title="Faststart Streaming" guidance={SETTING_GUIDANCE.faststart} />
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.webOptimizations.faststart}
                  onChange={(e) =>
                    updateWithCustomPreset((prev) => ({
                      ...prev,
                      webOptimizations: {
                        ...prev.webOptimizations,
                        faststart: e.target.checked,
                      },
                    }))
                  }
                />
                <span className="slider-round" />
              </label>
            </div>
          </div>

          <div className="apple-divider" />

          {/* Universal Pixel Format & BT.709 */}
          <div className="apple-setting-row">
            <div className="apple-setting-top">
              <SettingTitleWithInfo
                title="YUV420p & BT.709 Color"
                guidance={SETTING_GUIDANCE.forceYuv420p}
              />
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.webOptimizations.forceYuv420p}
                  onChange={(e) =>
                    updateWithCustomPreset((prev) => ({
                      ...prev,
                      webOptimizations: {
                        ...prev.webOptimizations,
                        forceYuv420p: e.target.checked,
                      },
                    }))
                  }
                />
                <span className="slider-round" />
              </label>
            </div>
          </div>

          <div className="apple-divider" />

          {/* Seamless Web Looping */}
          <div className="apple-setting-row">
            <div className="apple-setting-top">
              <SettingTitleWithInfo title="Seamless Loop" guidance={SETTING_GUIDANCE.seamlessLooping} />
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.webOptimizations.seamlessLooping}
                  onChange={(e) =>
                    updateWithCustomPreset((prev) => ({
                      ...prev,
                      webOptimizations: {
                        ...prev.webOptimizations,
                        seamlessLooping: e.target.checked,
                      },
                    }))
                  }
                />
                <span className="slider-round" />
              </label>
            </div>

            {settings.webOptimizations.seamlessLooping && (
              <div
                className="apple-setting-row"
                style={{
                  marginTop: '10px',
                  paddingLeft: '10px',
                  paddingBottom: 0,
                  borderLeft: '1px solid var(--border-subtle)',
                }}
              >
                <div className="apple-setting-top">
                  <SettingTitleWithInfo
                    title="Trim Duplicate End Frame"
                    guidance={SETTING_GUIDANCE.dropDuplicateEndFrame}
                  />
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.webOptimizations.dropDuplicateEndFrame}
                      onChange={(e) =>
                        updateWithCustomPreset((prev) => ({
                          ...prev,
                          webOptimizations: {
                            ...prev.webOptimizations,
                            dropDuplicateEndFrame: e.target.checked,
                          },
                        }))
                      }
                    />
                    <span className="slider-round" />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="apple-divider" />

          {/* Strip Empty Audio Track */}
          <div className="apple-setting-row">
            <div className="apple-setting-top">
              <SettingTitleWithInfo title="Strip Audio Track" guidance={SETTING_GUIDANCE.stripAudio} />
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.webOptimizations.stripAudio}
                  onChange={(e) =>
                    updateWithCustomPreset((prev) => ({
                      ...prev,
                      webOptimizations: {
                        ...prev.webOptimizations,
                        stripAudio: e.target.checked,
                      },
                    }))
                  }
                />
                <span className="slider-round" />
              </label>
            </div>
          </div>

          {settings.codec === 'libx264' && (
            <>
              <div className="apple-divider" />
              <div className="apple-setting-row">
                <div className="apple-setting-top" style={{ marginBottom: '6px' }}>
                  <SettingTitleWithInfo
                    title="H.264 Profile"
                    guidance={SETTING_GUIDANCE.h264Profile}
                  />
                </div>
                <div className="apple-segmented">
                  {(['high', 'main', 'baseline'] as H264Profile[]).map((prof) => (
                    <button
                      key={prof}
                      type="button"
                      className={`apple-segment-btn ${
                        settings.webOptimizations.h264Profile === prof ? 'active' : ''
                      }`}
                      style={{ textTransform: 'capitalize' }}
                      onClick={() =>
                        updateWithCustomPreset((prev) => ({
                          ...prev,
                          webOptimizations: {
                            ...prev.webOptimizations,
                            h264Profile: prof,
                          },
                        }))
                      }
                    >
                      {prof}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="apple-divider" />

          {/* HTML5 Snippet */}
          <div>
            <div className="apple-setting-top">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Code2 size={13} style={{ color: 'var(--text-secondary)' }} />
                <span className="setting-title">HTML5 Embed Code</span>
              </div>
              <button
                className="btn"
                style={{ height: '24px', fontSize: '11px', padding: '0 8px' }}
                onClick={() => setShowSnippet(!showSnippet)}
              >
                {showSnippet ? 'Hide' : 'Show'}
              </button>
            </div>
            {showSnippet && (
              <div style={{ marginTop: '8px' }}>
                <pre
                  className="font-mono"
                  style={{
                    padding: '10px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '10.5px',
                    overflowX: 'auto',
                    userSelect: 'text',
                    color: 'var(--text-primary)',
                    lineHeight: 1.45,
                  }}
                >
                  {htmlSnippet}
                </pre>
                <button
                  className="btn"
                  style={{ width: '100%', marginTop: '6px', height: '28px', fontSize: '11.5px' }}
                  onClick={handleCopySnippet}
                >
                  {copiedSnippet ? <Check size={12} /> : <Copy size={12} />}
                  {copiedSnippet ? 'Copied' : 'Copy Code'}
                </button>
              </div>
            )}
          </div>
        </ResizableSection>
      )}

      {/* =====================================================================
          AREA 2: VIDEO QUALITY
         ===================================================================== */}
      {activeTab === 'quality' && (
        <ResizableSection
          id="right-tab-quality"
          className={`panel-section ${!hasSource ? 'section-unavailable' : ''}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          minHeight={140}
        >
          {/* Codec */}
          <div className="apple-setting-row">
            <div className="apple-setting-top" style={{ marginBottom: '6px' }}>
              <SettingTitleWithInfo title="Codec" guidance={SETTING_GUIDANCE.codec} />
            </div>
            <select
              className="select-field"
              value={settings.codec}
              onChange={(e) => {
                const codec = e.target.value as VideoCodec;
                updateWithCustomPreset((prev) => ({ ...prev, codec }));
              }}
            >
              <option value="libx264">H.264 (Universal Web MP4)</option>
              <option value="libx265">H.265 / HEVC (Apple &amp; Modern MP4)</option>
              <option value="libsvtav1">AV1 (SVT-AV1 Next-Gen MP4)</option>
              <option value="libaom-av1">AV1 (AOM Reference MP4)</option>
            </select>
          </div>

          <div className="apple-divider" />

          {/* Resolution */}
          <div className="apple-setting-row">
            <div className="apple-setting-top" style={{ marginBottom: '6px' }}>
              <SettingTitleWithInfo title="Resolution" guidance={SETTING_GUIDANCE.resolution} />
              <span className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                {outW} × {outH}
              </span>
            </div>

            <div className="apple-segmented" style={{ marginBottom: '6px' }}>
              {(['100', '75', '50', '1080p', '720p', 'custom'] as ResolutionScale[]).map(
                (scale) => (
                  <button
                    key={scale}
                    type="button"
                    className={`apple-segment-btn ${settings.scale === scale ? 'active' : ''}`}
                    onClick={() => updateWithCustomPreset((prev) => ({ ...prev, scale }))}
                  >
                    {scale === 'custom'
                      ? 'Custom'
                      : scale.endsWith('p')
                      ? scale
                      : `${scale}%`}
                  </button>
                )
              )}
            </div>

            {settings.scale === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <input
                  type="number"
                  className="input-field font-mono"
                  placeholder="Width"
                  min={2}
                  max={7680}
                  value={settings.customWidth || ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const w = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                    const srcW = selectedSequence?.width || 1920;
                    const srcH = selectedSequence?.height || 1080;
                    const ratio = srcW / Math.max(1, srcH);
                    updateWithCustomPreset((prev) => ({
                      ...prev,
                      customWidth: w,
                      customHeight:
                        prev.aspectRatioLocked && w > 0
                          ? Math.max(2, Math.round(w / ratio / 2) * 2)
                          : prev.customHeight,
                    }));
                  }}
                />
                <button
                  type="button"
                  className="btn btn-icon btn-ghost"
                  style={{
                    color: settings.aspectRatioLocked
                      ? 'var(--text-primary)'
                      : 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                  title={
                    settings.aspectRatioLocked
                      ? 'Aspect ratio locked — Click to unlock independent Width × Height'
                      : 'Aspect ratio unlocked — Click to lock proportional Width × Height'
                  }
                  onClick={() =>
                    updateWithCustomPreset((prev) => ({
                      ...prev,
                      aspectRatioLocked: !prev.aspectRatioLocked,
                      customWidth: outW,
                      customHeight: outH,
                    }))
                  }
                >
                  {settings.aspectRatioLocked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
                <input
                  type="number"
                  className="input-field font-mono"
                  placeholder="Height"
                  min={2}
                  max={7680}
                  value={
                    settings.aspectRatioLocked
                      ? settings.customWidth === 0
                        ? ''
                        : outH
                      : settings.customHeight || ''
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    const h = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                    const srcW = selectedSequence?.width || 1920;
                    const srcH = selectedSequence?.height || 1080;
                    const ratio = srcW / Math.max(1, srcH);
                    updateWithCustomPreset((prev) => ({
                      ...prev,
                      customHeight: h,
                      customWidth:
                        prev.aspectRatioLocked && h > 0
                          ? Math.max(2, Math.round((h * ratio) / 2) * 2)
                          : prev.customWidth,
                    }));
                  }}
                />
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Scaling Filter</span>
              <select
                className="select-field"
                style={{ width: '150px', height: '26px', padding: '0 8px', fontSize: '11.5px' }}
                value={settings.scalingAlgorithm}
                onChange={(e) =>
                  updateWithCustomPreset((prev) => ({
                    ...prev,
                    scalingAlgorithm: e.target.value as ScalingAlgorithm,
                  }))
                }
              >
                <option value="lanczos">Lanczos (Sharp)</option>
                <option value="bicubic">Bicubic (Smooth)</option>
                <option value="bilinear">Bilinear (Fast)</option>
              </select>
            </div>
          </div>

          <div className="apple-divider" />

          {/* Frame Rate */}
          <div className="apple-setting-row">
            <div className="apple-setting-top" style={{ marginBottom: '6px' }}>
              <SettingTitleWithInfo title="Frame Rate" guidance={SETTING_GUIDANCE.framerate} />
              <span className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                {settings.targetFramerate} fps ({estimate.durationSeconds.toFixed(1)}s)
              </span>
            </div>

            <div className="apple-segmented">
              {COMMON_FPS.map((fps) => (
                <button
                  key={fps}
                  type="button"
                  className={`apple-segment-btn ${settings.targetFramerate === fps ? 'active' : ''}`}
                  onClick={() => onChangeSettings((prev) => ({ ...prev, targetFramerate: fps }))}
                >
                  {fps}
                </button>
              ))}
            </div>
          </div>

          <div className="apple-divider" />

          {/* Rate Control */}
          <div className="apple-setting-row">
            <div className="apple-setting-top" style={{ marginBottom: '6px' }}>
              <SettingTitleWithInfo
                title="Rate Control"
                guidance={SETTING_GUIDANCE.rateControlMode}
              />
            </div>

            <div className="apple-segmented">
              {(
                [
                  { id: 'crf-constrained', label: 'Constrained CRF' },
                  { id: 'crf', label: 'Pure CRF' },
                  { id: 'cbr', label: 'Target Bitrate' },
                ] as { id: RateControlMode; label: string }[]
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`apple-segment-btn ${
                    settings.rateControlMode === mode.id ? 'active' : ''
                  }`}
                  onClick={() =>
                    updateWithCustomPreset((prev) => ({ ...prev, rateControlMode: mode.id }))
                  }
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Compression Level (CRF) */}
          {settings.rateControlMode !== 'cbr' && (
            <>
              <div className="apple-divider" />
              <div className="apple-setting-row">
                <div className="apple-setting-top">
                  <SettingTitleWithInfo
                    title="Compression (CRF)"
                    guidance={SETTING_GUIDANCE.crf}
                  />
                  <span className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    CRF {settings.crf}
                  </span>
                </div>

                <input
                  type="range"
                  className="range-slider"
                  min={14}
                  max={34}
                  step={1}
                  value={settings.crf}
                  onChange={(e) => {
                    const crf = parseInt(e.target.value, 10);
                    updateWithCustomPreset((prev) => ({ ...prev, crf }));
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '10.5px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>Higher Quality (14)</span>
                  <span>Smaller File (34)</span>
                </div>
              </div>
            </>
          )}

          {/* Bitrate Cap */}
          {(settings.rateControlMode === 'crf-constrained' ||
            settings.rateControlMode === 'cbr') && (
            <>
              <div className="apple-divider" />
              <div className="apple-setting-row">
                {settings.rateControlMode === 'cbr' && (
                  <div style={{ marginBottom: '10px' }}>
                    <div className="apple-setting-top">
                      <SettingTitleWithInfo
                        title="Target Bitrate"
                        guidance={SETTING_GUIDANCE.bitrate}
                      />
                      <span className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                        {settings.targetBitrateMbps} Mbps
                      </span>
                    </div>
                    <input
                      type="range"
                      className="range-slider"
                      min={0.5}
                      max={20}
                      step={0.5}
                      value={settings.targetBitrateMbps}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        updateWithCustomPreset((prev) => ({
                          ...prev,
                          targetBitrateMbps: val,
                          maxBitrateMbps: Math.max(val, prev.maxBitrateMbps),
                        }));
                      }}
                    />
                  </div>
                )}

                <div className="apple-setting-top">
                  <SettingTitleWithInfo
                    title="Peak Bitrate Cap"
                    guidance={SETTING_GUIDANCE.bitrate}
                  />
                  <span className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    {settings.maxBitrateMbps} Mbps
                  </span>
                </div>
                <input
                  type="range"
                  className="range-slider"
                  min={0.5}
                  max={25}
                  step={0.5}
                  value={settings.maxBitrateMbps}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    updateWithCustomPreset((prev) => ({ ...prev, maxBitrateMbps: val }));
                  }}
                />
              </div>
            </>
          )}
        </ResizableSection>
      )}

      {/* =====================================================================
          AREA 3: ADVANCED PERFORMANCE TUNING
         ===================================================================== */}
      {activeTab === 'performance' && (
        <ResizableSection
          id="right-tab-performance"
          className={`panel-section ${!hasSource ? 'section-unavailable' : ''}`}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          minHeight={140}
        >
          {/* Keyframe Interval */}
          <div className="apple-setting-row">
            <div className="apple-setting-top" style={{ marginBottom: '6px' }}>
              <SettingTitleWithInfo
                title="Keyframe Interval"
                guidance={SETTING_GUIDANCE.keyframeInterval}
              />
              <span className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                Every {estimate.resolvedGopFrames}f
              </span>
            </div>

            <div className="apple-segmented">
              {(
                [
                  { id: 'every-frame', label: '1f' },
                  { id: 'ultra-short', label: '4f' },
                  { id: 'short', label: '12f' },
                  { id: '1s', label: '1s' },
                  { id: '2s', label: '2s' },
                  { id: 'custom', label: 'Custom' },
                ] as { id: KeyframeIntervalMode; label: string }[]
              ).map((kf) => (
                <button
                  key={kf.id}
                  type="button"
                  className={`apple-segment-btn ${settings.keyframeMode === kf.id ? 'active' : ''}`}
                  onClick={() =>
                    updateWithCustomPreset((prev) => ({ ...prev, keyframeMode: kf.id }))
                  }
                >
                  {kf.label}
                </button>
              ))}
            </div>

            {settings.keyframeMode === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Frames:</span>
                <div className="number-stepper-container">
                  <input
                    type="number"
                    className="input-field font-mono"
                    style={{ width: '90px', height: '26px', paddingRight: '20px' }}
                    min={1}
                    max={600}
                    value={settings.customKeyintFrames}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                      updateWithCustomPreset((prev) => ({ ...prev, customKeyintFrames: val }));
                    }}
                  />
                  <div className="number-stepper-arrows">
                    <button
                      type="button"
                      tabIndex={-1}
                      className="number-stepper-btn"
                      title="Increase Frames"
                      onClick={() =>
                        updateWithCustomPreset((prev) => ({
                          ...prev,
                          customKeyintFrames: Math.min(600, (prev.customKeyintFrames || 1) + 1),
                        }))
                      }
                    >
                      <ChevronUp size={10} strokeWidth={2.2} />
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      className="number-stepper-btn"
                      title="Decrease Frames"
                      onClick={() =>
                        updateWithCustomPreset((prev) => ({
                          ...prev,
                          customKeyintFrames: Math.max(1, (prev.customKeyintFrames || 1) - 1),
                        }))
                      }
                    >
                      <ChevronDown size={10} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="apple-divider" />

          {/* B-Frames */}
          {(settings.codec === 'libx264' || settings.codec === 'libx265') && (
            <>
              <div className="apple-setting-row">
                <div className="apple-setting-top" style={{ marginBottom: '6px' }}>
                  <SettingTitleWithInfo title="B-Frames" guidance={SETTING_GUIDANCE.bFrames} />
                  <span className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    {settings.bFrames}
                  </span>
                </div>

                <div className="apple-segmented">
                  {[0, 1, 2, 3, 4].map((bf) => (
                    <button
                      key={bf}
                      type="button"
                      className={`apple-segment-btn ${settings.bFrames === bf ? 'active' : ''}`}
                      disabled={
                        settings.codec === 'libx264' &&
                        settings.webOptimizations.h264Profile === 'baseline' &&
                        bf > 0
                      }
                      onClick={() => updateWithCustomPreset((prev) => ({ ...prev, bFrames: bf }))}
                    >
                      {bf}
                    </button>
                  ))}
                </div>
              </div>
              <div className="apple-divider" />
            </>
          )}

          {/* Encoder Speed Preset */}
          <div className="apple-setting-row">
            <div className="apple-setting-top" style={{ marginBottom: '6px' }}>
              <SettingTitleWithInfo
                title="Compression Speed"
                guidance={SETTING_GUIDANCE.preset}
              />
            </div>
            <AppleDropdown<EncoderPreset>
              value={settings.preset}
              options={PRESET_OPTIONS}
              menuWidth="100%"
              align="left"
              onChange={(preset) =>
                updateWithCustomPreset((prev) => ({ ...prev, preset }))
              }
            />
          </div>

          {/* Decoder & Visual Tune */}
          {(settings.codec === 'libx264' || settings.codec === 'libx265') && (
            <>
              <div className="apple-divider" />
              <div className="apple-setting-row">
                <div className="apple-setting-top" style={{ marginBottom: '6px' }}>
                  <SettingTitleWithInfo title="Encoder Tuning" guidance={SETTING_GUIDANCE.tune} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  {TUNE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      title={opt.sublabel}
                      className={`apple-preset-tile ${settings.tune === opt.value ? 'selected' : ''}`}
                      onClick={() =>
                        updateWithCustomPreset((prev) => ({ ...prev, tune: opt.value }))
                      }
                    >
                      <span className="apple-preset-title">{opt.label}</span>
                      <span className="apple-preset-sub">{opt.sublabel}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="apple-divider" />

          {/* Edge Sharpening */}
          <div className="apple-setting-row">
            <div className="apple-setting-top">
              <SettingTitleWithInfo
                title="Edge Micro-Sharpening"
                guidance={SETTING_GUIDANCE.sharpenOutput}
              />
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.sharpenOutput}
                  onChange={(e) =>
                    updateWithCustomPreset((prev) => ({
                      ...prev,
                      sharpenOutput: e.target.checked,
                    }))
                  }
                />
                <span className="slider-round" />
              </label>
            </div>
          </div>

          <div className="apple-divider" />

          {/* 2-Pass Encoding */}
          <div className="apple-setting-row">
            <div className="apple-setting-top">
              <SettingTitleWithInfo title="2-Pass Analysis" guidance={SETTING_GUIDANCE.twoPass} />
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.twoPass}
                  onChange={(e) =>
                    updateWithCustomPreset((prev) => ({ ...prev, twoPass: e.target.checked }))
                  }
                />
                <span className="slider-round" />
              </label>
            </div>
          </div>
        </ResizableSection>
      )}

      {/* 4. Output Destination */}
      <ResizableSection
        id="right-output-dest"
        className={`panel-section ${!hasSource ? 'section-unavailable' : ''}`}
        minHeight={95}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px',
          }}
        >
          <span className="apple-section-label">Output</span>
          <button
            type="button"
            className="btn"
            style={{ height: '24px', fontSize: '11px', padding: '0 9px' }}
            onClick={onSelectOutputDirectory}
            title="Choose destination folder for exported MP4"
          >
            <FolderOpen size={11} />
            Folder
          </button>
        </div>

        {/* Active Output Folder Path Display / Click to Change */}
        <div
          onClick={onSelectOutputDirectory}
          className="font-mono"
          style={{
            padding: '6px 8px',
            marginBottom: '6px',
            backgroundColor: 'var(--bg-tertiary)',
            border: '0.75px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            wordBreak: 'break-all',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px',
          }}
          title="Click to change MP4 output folder"
        >
          <span>{resolvedOutputFolderDisplay}</span>
          {settings.outputDirectory && (
            <button
              type="button"
              className="btn"
              style={{ height: '18px', padding: '0 6px', fontSize: '10px' }}
              onClick={(e) => {
                e.stopPropagation();
                onChangeSettings((prev) => ({ ...prev, outputDirectory: '' }));
              }}
              title="Reset to sequence folder"
            >
              Reset
            </button>
          )}
        </div>

        <input
          type="text"
          className="input-field font-mono"
          style={{ fontSize: '11.5px', marginBottom: '4px' }}
          value={settings.filenameTemplate}
          onChange={(e) => {
            const val = e.target.value;
            onChangeSettings((prev) => ({ ...prev, filenameTemplate: val }));
          }}
        />
        <div
          className="font-mono"
          style={{
            fontSize: '10.5px',
            color: 'var(--text-muted)',
            wordBreak: 'break-all',
          }}
          title={previewFullPath}
        >
          {previewFilename}
        </div>
      </ResizableSection>

      {/* 5. Primary Export CTA with Hover Diagnostic Flyout & Percentage Indicator */}
      <ResizableSection id="right-export-cta" className="panel-section" style={{ borderBottom: 'none' }} minHeight={70}>
        {isRendering ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '9px',
              padding: '2px 0',
              backgroundColor: 'transparent',
              border: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>
                {renderState.progress.fps > 0 ? 'Encoding MP4...' : 'Staging & Preparing...'}
              </span>
              <span
                className="badge font-mono"
                style={{
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: 0,
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                }}
              >
                {renderState.progress.progressPercent}%
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(2, renderState.progress.progressPercent)}%`,
                  height: '100%',
                  backgroundColor: 'var(--cta-blue)',
                  transition: 'width 150ms ease',
                }}
              />
            </div>

            <div
              className="font-mono"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '10.5px',
                color: 'var(--text-secondary)',
              }}
            >
              <span>
                Frame {renderState.progress.frame} / {estimate.totalOutputFrames}
              </span>
              <span>
                {renderState.progress.fps > 0 ? `${renderState.progress.fps} fps` : 'Streaming...'}
              </span>
              <span>
                {renderState.progress.estimatedRemainingSeconds !== undefined
                  ? `${renderState.progress.estimatedRemainingSeconds}s left`
                  : renderState.progress.speed !== '0x'
                  ? renderState.progress.speed
                  : ''}
              </span>
            </div>

            <button className="btn" style={{ height: '30px' }} onClick={onCancelRender}>
              <XCircle size={13} />
              Cancel Export
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
              className={`export-cta-wrapper ${!canRender ? 'is-disabled' : ''}`}
              tabIndex={!canRender ? 0 : -1}
            >
              {exportFlyout && (
                <div className="export-flyout" role="tooltip">
                  <div className="export-flyout-header">
                    <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                    <span>{exportFlyout.title}</span>
                  </div>
                  <div className="export-flyout-body">{exportFlyout.message}</div>
                  {exportFlyout.showSelectSequenceBtn && onBrowseSequenceDirectory && (
                    <button
                      type="button"
                      className="btn"
                      style={{
                        marginTop: '4px',
                        height: '26px',
                        fontSize: '11px',
                        width: '100%',
                        pointerEvents: 'auto',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBrowseSequenceDirectory();
                      }}
                    >
                      <FolderOpen size={12} />
                      Select Sequence Folder
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary"
                style={{
                  width: '100%',
                  height: '38px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-sm)',
                  pointerEvents: !canRender ? 'none' : 'auto',
                }}
                disabled={!canRender}
                onClick={onStartRender}
              >
                Export MP4 ({estimate.estimatedFormatted})
              </button>
            </div>

            {renderState.status === 'completed' && renderState.outputPath && (
              <div
                style={{
                  padding: '2px 0',
                  backgroundColor: 'transparent',
                  border: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Check size={13} />
                    <span style={{ fontSize: '11.5px', fontWeight: 600 }}>
                      Exported{' '}
                      {renderState.outputSizeBytes
                        ? `(${formatBytes(renderState.outputSizeBytes)})`
                        : ''}
                    </span>
                  </div>
                  <span
                    className="badge font-mono"
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      padding: 0,
                    }}
                  >
                    {renderState.progress.progressPercent || 100}%
                  </span>
                </div>

                {/* 100% Progress Indicator Bar */}
                <div
                  style={{
                    width: '100%',
                    height: '4px',
                    borderRadius: '2px',
                    backgroundColor: 'var(--bg-primary)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${renderState.progress.progressPercent || 100}%`,
                      height: '100%',
                      backgroundColor: 'var(--text-primary)',
                    }}
                  />
                </div>

                <div
                  className="font-mono"
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    wordBreak: 'break-all',
                  }}
                >
                  {renderState.outputPath}
                </div>
              </div>
            )}

            {(renderState.status === 'cancelled' || renderState.status === 'error') && (
              <div
                style={{
                  padding: '2px 0',
                  backgroundColor: 'transparent',
                  border: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '11px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {renderState.status === 'cancelled' ? 'Export Cancelled' : 'Export Stopped'}
                  </span>
                  <span
                    className="badge font-mono"
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 600,
                      backgroundColor: 'transparent',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    Reached {renderState.progress.progressPercent}% (Frame {renderState.progress.frame} / {estimate.totalOutputFrames})
                  </span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '4px',
                    borderRadius: '2px',
                    backgroundColor: 'var(--bg-primary)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${renderState.progress.progressPercent}%`,
                      height: '100%',
                      backgroundColor: 'var(--text-secondary)',
                    }}
                  />
                </div>
                {renderState.errorMessage && (
                  <div style={{ color: 'var(--text-secondary)' }}>{renderState.errorMessage}</div>
                )}
              </div>
            )}
          </div>
        )}
      </ResizableSection>
    </aside>
  );
});
