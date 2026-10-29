import React, { useState, useEffect, useMemo } from 'react';
import { Folder } from 'lucide-react';
import { AppleDropdown, AppleDropdownOption } from './AppleDropdown';

interface QuickLocation {
  label: string;
  path: string;
}

interface ExportLocationModalProps {
  isOpen: boolean;
  mode: 'export' | 'select-only';
  initialDirectory: string;
  filenameTemplate: string;
  previewFilename: string;
  estimatedSizeFormatted: string;
  onClose: () => void;
  onConfirm: (
    selectedDirectory: string,
    updatedFilenameTemplate: string,
    startExportNow: boolean
  ) => void;
}

const CHOOSE_CUSTOM_VALUE = '__CHOOSE_FOLDER__';

export const ExportLocationModal: React.FC<ExportLocationModalProps> = ({
  isOpen,
  mode,
  initialDirectory,
  previewFilename,
  estimatedSizeFormatted,
  onClose,
  onConfirm,
}) => {
  const [selectedDir, setSelectedDir] = useState<string>(initialDirectory || '');
  const [quickLocations, setQuickLocations] = useState<QuickLocation[]>([]);
  const [fileName, setFileName] = useState<string>(previewFilename);

  useEffect(() => {
    if (!isOpen) return;
    setFileName(previewFilename);

    fetch(`/api/fs-locations?dir=${encodeURIComponent(initialDirectory || '')}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.success) {
          const locs: QuickLocation[] = data.quickLocations || [];
          setQuickLocations(locs);
          if (initialDirectory) {
            setSelectedDir(initialDirectory);
          } else {
            const downloads = locs.find((l) => l.label === 'Downloads');
            setSelectedDir(downloads?.path || data.currentDir || '');
          }
        }
      })
      .catch(() => {
        if (initialDirectory) setSelectedDir(initialDirectory);
      });
  }, [isOpen, initialDirectory, previewFilename]);

  const handleBrowseSystemFolder = async () => {
    if (window.electronAPI) {
      const picked = await window.electronAPI.selectDirectory('Select Export Folder');
      if (picked) setSelectedDir(picked);
    } else {
      try {
        const resp = await fetch(
          `/api/select-directory?title=${encodeURIComponent('Select Export Folder')}`
        );
        const data = await resp.json();
        if (data && data.path) {
          setSelectedDir(data.path);
        }
      } catch {}
    }
  };

  const folderOptions = useMemo<AppleDropdownOption<string>[]>(() => {
    const opts: AppleDropdownOption<string>[] = quickLocations.map((loc) => ({
      value: loc.path,
      label: loc.label,
      icon: <Folder size={13} />,
    }));

    if (
      selectedDir &&
      !opts.some((o) => o.value.toLowerCase() === selectedDir.toLowerCase())
    ) {
      const folderName =
        selectedDir.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || selectedDir;
      opts.unshift({
        value: selectedDir,
        label: folderName,
        icon: <Folder size={13} />,
      });
    }

    opts.push({
      value: CHOOSE_CUSTOM_VALUE,
      label: 'Other...',
      dividerBefore: true,
      icon: <Folder size={13} />,
    });

    return opts;
  }, [quickLocations, selectedDir]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '370px',
          backgroundColor: 'var(--bg-primary)',
          border: '0.75px solid var(--border-subtle)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-md)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Minimal Apple Sheet Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '-0.015em',
              color: 'var(--text-primary)',
            }}
          >
            {mode === 'export' ? 'Export MP4' : 'Output Location'}
          </span>
          {mode === 'export' && (
            <span
              className="font-mono"
              style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}
            >
              {estimatedSizeFormatted}
            </span>
          )}
        </div>

        {/* Form Rows: Save As & Where */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mode === 'export' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                }}
              >
                Save As
              </label>
              <input
                type="text"
                className="input-field"
                style={{ height: '32px', fontSize: '12px', padding: '0 10px' }}
                value={fileName}
                autoFocus
                onChange={(e) => setFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && selectedDir) {
                    onConfirm(selectedDir, fileName.trim() || previewFilename, true);
                  }
                  if (e.key === 'Escape') onClose();
                }}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
              }}
            >
              Where
            </label>
            <AppleDropdown<string>
              value={selectedDir}
              options={folderOptions}
              menuWidth="100%"
              align="left"
              onChange={(val) => {
                if (val === CHOOSE_CUSTOM_VALUE) {
                  handleBrowseSystemFolder();
                } else {
                  setSelectedDir(val);
                }
              }}
            />
          </div>
        </div>

        {/* Minimal Footer Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '4px',
          }}
        >
          <button
            type="button"
            className="btn"
            style={{ height: '32px', padding: '0 14px', fontSize: '12px' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{
              height: '32px',
              padding: '0 18px',
              fontSize: '12px',
              fontWeight: 600,
            }}
            disabled={!selectedDir}
            onClick={() =>
              onConfirm(
                selectedDir,
                fileName.trim() || previewFilename,
                mode === 'export'
              )
            }
          >
            {mode === 'export' ? 'Export' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
