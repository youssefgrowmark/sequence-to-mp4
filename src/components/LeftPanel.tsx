import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Folder,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sliders,
  FileImage,
} from 'lucide-react';
import { SequenceItem } from '../../electron/types';
import { formatDuration, formatBytes } from '../core/timecode';
import { formatMissingRanges } from '../core/sequenceDetector';
import { ResizableSection } from './ResizableSection';
import { AppleDropdown, AppleDropdownOption } from './AppleDropdown';

interface LeftPanelProps {
  currentDirectory: string | null;
  detectedSequences: SequenceItem[];
  selectedSequence: SequenceItem | null;
  onSelectSequence: (seq: SequenceItem) => void;
  onBrowseDirectory: () => void;
  targetFramerate: number;
  onChangeFramerate: (fps: number) => void;
  inPoint: number;
  outPoint: number;
  onChangeInPoint: (val: number) => void;
  onChangeOutPoint: (val: number) => void;
  isDraggingOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  hasPendingFolder?: boolean;
  onOverwritePendingFolder?: () => void;
  onSaveAndCreateNewPendingFolder?: () => void;
  onCancelPendingFolder?: () => void;
}

const COMMON_FPS = [12, 24, 25, 29.97, 30, 60];

const FPS_PRESET_DETAILS: Record<number, { label: string; sublabel: string; badge: string }> = {
  12: { label: '12 FPS', sublabel: 'Stop-motion & anime', badge: '12' },
  24: { label: '24 FPS', sublabel: 'Cinematic standard', badge: '24' },
  25: { label: '25 FPS', sublabel: 'PAL broadcast', badge: '25' },
  29.97: { label: '29.97 FPS', sublabel: 'NTSC broadcast', badge: '29.97' },
  30: { label: '30 FPS', sublabel: 'Standard web video', badge: '30' },
  60: { label: '60 FPS', sublabel: 'Smooth UI & scroll', badge: '60' },
};

export const LeftPanel: React.FC<LeftPanelProps> = React.memo(({
  currentDirectory,
  detectedSequences,
  selectedSequence,
  onSelectSequence,
  onBrowseDirectory,
  targetFramerate,
  onChangeFramerate,
  inPoint,
  outPoint,
  onChangeInPoint,
  onChangeOutPoint,
  isDraggingOver,
  onDragOver,
  onDragLeave,
  onDrop,
  hasPendingFolder,
  onOverwritePendingFolder,
  onSaveAndCreateNewPendingFolder,
  onCancelPendingFolder,
}) => {
  const totalFrames = selectedSequence ? selectedSequence.filePaths.length : 0;
  const maxFrameIndex = Math.max(0, totalFrames - 1);
  const selectedRangeCount = Math.max(0, outPoint - inPoint + 1);

  const isPresetFps = COMMON_FPS.includes(targetFramerate);
  const [showCustomFpsInput, setShowCustomFpsInput] = useState<boolean>(!isPresetFps);
  const customFpsInputRef = useRef<HTMLInputElement>(null);

  const [inDraft, setInDraft] = useState<string>(String(inPoint));
  const [outDraft, setOutDraft] = useState<string>(String(outPoint));

  useEffect(() => {
    setInDraft(String(inPoint));
  }, [inPoint]);

  useEffect(() => {
    setOutDraft(String(outPoint));
  }, [outPoint]);

  const fpsOptions = useMemo<AppleDropdownOption<string>[]>(() => {
    const opts: AppleDropdownOption<string>[] = COMMON_FPS.map((fps) => ({
      value: String(fps),
      label: FPS_PRESET_DETAILS[fps].label,
      sublabel: FPS_PRESET_DETAILS[fps].sublabel,
      badge: FPS_PRESET_DETAILS[fps].badge,
    }));

    if (!COMMON_FPS.includes(targetFramerate)) {
      opts.unshift({
        value: String(targetFramerate),
        label: `${targetFramerate} FPS`,
        sublabel: 'Custom framerate',
        badge: 'Custom',
      });
    }

    return opts;
  }, [targetFramerate]);

  const commitInPoint = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) {
      setInDraft(String(inPoint));
      return;
    }
    const clamped = Math.max(0, Math.min(Math.min(outPoint, maxFrameIndex), parsed));
    onChangeInPoint(clamped);
    setInDraft(String(clamped));
  };

  const commitOutPoint = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) {
      setOutDraft(String(outPoint));
      return;
    }
    const clamped = Math.max(inPoint, Math.min(maxFrameIndex, parsed));
    onChangeOutPoint(clamped);
    setOutDraft(String(clamped));
  };

  return (
    <aside className="side-panel">
      {/* 1. Directory Target & Dropzone */}
      <ResizableSection id="left-input-source" className="panel-section" minHeight={90}>
        <div className="panel-header">
          <span className="text-caption">Input Source</span>
        </div>

        {hasPendingFolder ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '2px 0' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--text-primary)', lineHeight: 1.45 }}>
              An existing project with loaded files is currently open. Would you like to over-write it or save and create a new project?
            </div>

            <div style={{ display: 'flex', flexDirection: 'row', gap: '6px', width: '100%', marginTop: '2px' }}>
              <button
                type="button"
                className="btn"
                style={{
                  flex: 1,
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '7px 4px',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
                onClick={onOverwritePendingFolder}
                title="Over-write the existing project"
              >
                Over-write Project
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  flex: 1,
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '7px 4px',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
                onClick={onSaveAndCreateNewPendingFolder}
                title="Save current project and create a new one"
              >
                Save & Create New
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-ghost"
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 8px',
                }}
                onClick={onCancelPendingFolder}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`dropzone ${isDraggingOver ? 'active' : ''}`}
              onClick={onBrowseDirectory}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <Folder size={28} style={{ opacity: 0.6, marginBottom: '8px' }} />
              <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '2px' }}>
                {currentDirectory ? 'Drop New Folder Here' : 'Select Sequence Folder'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Drag & drop or click to browse
              </div>
            </div>

            {currentDirectory && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '6px 8px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  wordBreak: 'break-all',
                  color: 'var(--text-secondary)',
                }}
                className="font-mono"
                title={currentDirectory}
              >
                {currentDirectory}
              </div>
            )}
          </>
        )}
      </ResizableSection>

      {/* 2. Sequence Inspector & Selector */}
      <ResizableSection
        id="left-detected-sequences"
        className="panel-section"
        style={{ flex: '1 0 auto' }}
        minHeight={100}
      >
        <div className="panel-header">
          <span className="text-caption">Detected Sequences</span>
          <span className="badge font-mono">{detectedSequences.length}</span>
        </div>

        {detectedSequences.length === 0 ? (
          <div
            style={{
              padding: '24px 8px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '12px',
            }}
          >
            No image sequences detected. Drop a folder containing numbered frames (PNG, JPG, WebP).
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {detectedSequences.map((seq) => {
              const isSelected = selectedSequence?.id === seq.id;
              const hasMissing = seq.missingIndices.length > 0;

              return (
                <div
                  key={seq.id}
                  onClick={() => onSelectSequence(seq)}
                  className={`card-item ${isSelected ? 'selected' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileImage size={14} style={{ color: 'var(--icon-color)' }} />
                      <span style={{ fontWeight: 600, fontSize: '12px' }}>{seq.name}</span>
                    </div>
                    <span className="badge font-mono" style={{ fontSize: '10px' }}>
                      {seq.extension.toUpperCase()}
                    </span>
                  </div>

                  <div
                    className="font-mono"
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                    }}
                  >
                    Pattern: {seq.pattern}
                  </div>

                  {/* Metadata Row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '4px',
                      fontSize: '11px',
                      marginBottom: '8px',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Frames: </span>
                      <span className="font-mono" style={{ fontWeight: 600 }}>
                        {seq.totalFrames}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Index: </span>
                      <span className="font-mono">
                        {seq.firstFrameIndex}–{seq.lastFrameIndex}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Resolution: </span>
                      <span className="font-mono">
                        {seq.width ? `${seq.width}×${seq.height}` : 'Reading...'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Size: </span>
                      <span className="font-mono">{formatBytes(seq.totalSizeApproxBytes)}</span>
                    </div>
                  </div>

                  {/* Missing Frames Warning Indicator */}
                  {hasMissing ? (
                    <div
                      className="badge badge-warning"
                      style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        padding: '2px 0',
                        backgroundColor: 'transparent',
                        border: 'none',
                      }}
                    >
                      <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: '10.5px' }}>
                        {formatMissingRanges(seq.missingIndices)}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="badge badge-success"
                      style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        padding: '2px 0',
                        backgroundColor: 'transparent',
                        border: 'none',
                      }}
                    >
                      <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: '10.5px' }}>Sequence is continuous (0 missing)</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ResizableSection>

      {/* 3. Framerate Settings (Dropdown on Left + Custom Icon on Right) */}
      {selectedSequence && (
        <ResizableSection id="left-framerate" className="panel-section" minHeight={90}>
          <div className="panel-header">
            <span className="text-caption">Framerate (FPS)</span>
            <span className="badge font-mono" style={{ fontSize: '10px' }}>
              {targetFramerate} FPS
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <AppleDropdown<string>
                value={String(targetFramerate)}
                options={fpsOptions}
                align="left"
                menuWidth={220}
                monoTrigger
                title="Select Target Framerate (FPS)"
                onChange={(val) => {
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed) && parsed > 0) {
                    onChangeFramerate(parsed);
                  }
                }}
              />
            </div>

            <button
              type="button"
              className="btn btn-icon btn-ghost"
              style={{
                width: '30px',
                height: '30px',
                flexShrink: 0,
                color:
                  showCustomFpsInput || !isPresetFps
                    ? 'var(--text-primary)'
                    : 'var(--text-muted)',
              }}
              onClick={() => {
                setShowCustomFpsInput((prev) => {
                  const next = !prev;
                  if (next) {
                    setTimeout(() => customFpsInputRef.current?.focus(), 20);
                  }
                  return next;
                });
              }}
              title="Custom Framerate (FPS)"
              aria-label="Custom Framerate (FPS)"
            >
              <Sliders size={13} />
            </button>
          </div>

          {showCustomFpsInput && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                marginTop: '8px',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                Custom FPS
              </span>
              <input
                ref={customFpsInputRef}
                type="number"
                className="input-field font-mono"
                style={{ width: '96px', height: '28px', textAlign: 'right' }}
                min={1}
                max={240}
                step={0.01}
                value={targetFramerate}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val > 0) onChangeFramerate(val);
                }}
              />
            </div>
          )}

          <div
            style={{
              marginTop: '10px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Clock size={12} />
            <span>Duration: {formatDuration(selectedRangeCount, targetFramerate)}</span>
          </div>
        </ResizableSection>
      )}

      {/* 4. Frame Range Selection (Typed Number Inputs for In / Out Points) */}
      {selectedSequence && totalFrames > 0 && (
        <ResizableSection id="left-frame-range" className="panel-section" minHeight={110}>
          <div className="panel-header">
            <span className="text-caption">Frame Range (In / Out)</span>
            <span className="badge font-mono" style={{ fontSize: '10px' }}>
              {selectedRangeCount} / {totalFrames} Frames
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* In-Point Typed Number Input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '11.5px', color: 'var(--text-primary)' }}>
                In-Point (Start)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Frame</span>
                <input
                  type="number"
                  className="input-field font-mono"
                  style={{ width: '88px', height: '28px', textAlign: 'right' }}
                  min={0}
                  max={Math.min(outPoint, maxFrameIndex)}
                  step={1}
                  value={inDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setInDraft(raw);
                    const parsed = parseInt(raw, 10);
                    if (!isNaN(parsed) && parsed >= 0 && parsed <= Math.min(outPoint, maxFrameIndex)) {
                      onChangeInPoint(parsed);
                    }
                  }}
                  onBlur={() => commitInPoint(inDraft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitInPoint(inDraft);
                      e.currentTarget.blur();
                    }
                  }}
                />
              </div>
            </div>

            {/* Out-Point Typed Number Input */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '11.5px', color: 'var(--text-primary)' }}>
                Out-Point (End)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Frame</span>
                <input
                  type="number"
                  className="input-field font-mono"
                  style={{ width: '88px', height: '28px', textAlign: 'right' }}
                  min={inPoint}
                  max={maxFrameIndex}
                  step={1}
                  value={outDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setOutDraft(raw);
                    const parsed = parseInt(raw, 10);
                    if (!isNaN(parsed) && parsed >= inPoint && parsed <= maxFrameIndex) {
                      onChangeOutPoint(parsed);
                    }
                  }}
                  onBlur={() => commitOutPoint(outDraft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitOutPoint(outDraft);
                      e.currentTarget.blur();
                    }
                  }}
                />
              </div>
            </div>

            {/* Quick Reset Buttons */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
              <button
                className="btn"
                style={{ flex: 1, height: '26px', fontSize: '11px' }}
                onClick={() => onChangeInPoint(0)}
              >
                Set In to 0
              </button>
              <button
                className="btn"
                style={{ flex: 1, height: '26px', fontSize: '11px' }}
                onClick={() => onChangeOutPoint(maxFrameIndex)}
              >
                Set Out to End
              </button>
            </div>
          </div>
        </ResizableSection>
      )}
    </aside>
  );
});
