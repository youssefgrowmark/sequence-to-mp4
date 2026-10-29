import React from 'react';
import { X, Cpu, FolderOpen, CheckCircle2, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ffmpegInfo: {
    available: boolean;
    binaryPath: string;
    isBundled?: boolean;
    version?: string;
    error?: string;
  } | null;
  onSelectCustomBinary: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  ffmpegInfo,
  onSelectCustomBinary,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '520px',
          maxWidth: '90vw',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-card)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={16} />
            <span style={{ fontWeight: 600, fontSize: '13px' }}>FFmpeg Engine Configuration</span>
          </div>
          <button className="btn btn-icon" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Engine Status:
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {ffmpegInfo?.available ? (
                <CheckCircle2 size={16} style={{ color: 'var(--cta-blue)' }} />
              ) : (
                <AlertCircle size={16} style={{ color: 'var(--icon-color)' }} />
              )}
              <div style={{ fontSize: '12px', fontWeight: 500 }}>
                {ffmpegInfo?.available
                  ? `Active: ${ffmpegInfo.isBundled ? 'Bundled Offline Engine' : 'Custom FFmpeg'}`
                  : 'FFmpeg Unavailable'}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Binary Location:
            </div>
            <div
              style={{
                padding: '8px 10px',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                wordBreak: 'break-all',
              }}
              className="font-mono"
            >
              {ffmpegInfo?.binaryPath || 'Not configured'}
            </div>
          </div>

          {ffmpegInfo?.version && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Engine Build Version:
              </div>
              <div
                style={{
                  padding: '8px 10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                }}
                className="font-mono"
              >
                {ffmpegInfo.version}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Custom FFmpeg Binary:
            </div>
            <button className="btn" style={{ width: '100%', height: '34px' }} onClick={onSelectCustomBinary}>
              <FolderOpen size={14} />
              Select Custom ffmpeg.exe...
            </button>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              By default, Sequence to MP4 operates 100% offline using its bundled standalone FFmpeg binary.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-secondary)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
