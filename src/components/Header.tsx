import React, { useState } from 'react';
import {
  Terminal,
  Settings,
  Sun,
  Moon,
  FolderOpen,
  ArrowLeft,
  Edit3,
  Check,
} from 'lucide-react';
import { GrowmarkWordmark } from './BrandLogo';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  isTerminalOpen: boolean;
  onToggleTerminal: () => void;
  onOpenSettings: () => void;
  ffmpegInfo: {
    available: boolean;
    binaryPath: string;
    isBundled?: boolean;
    version?: string;
  } | null;
  onOpenFolderDialog: () => void;
  onBackToDashboard: () => void;
  activeProjectName?: string;
  activeProjectAccent?: string;
  onRenameActiveProject?: (newName: string) => void;
}

export const Header: React.FC<HeaderProps> = React.memo(({
  theme,
  onToggleTheme,
  isTerminalOpen,
  onToggleTerminal,
  onOpenSettings,
  ffmpegInfo,
  onOpenFolderDialog,
  onBackToDashboard,
  activeProjectName,
  onRenameActiveProject,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(activeProjectName || '');

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && onRenameActiveProject) {
      onRenameActiveProject(trimmed);
    }
    setIsEditingTitle(false);
  };

  return (
    <header className="header-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Back to Dashboard Icon Button (No Fill / No Container) */}
        <button
          className="btn btn-icon"
          style={{
            background: 'transparent',
            border: 'none',
            width: '26px',
            height: '26px',
          }}
          onClick={onBackToDashboard}
          title="Back to Dashboard"
          aria-label="Back to Dashboard"
        >
          <ArrowLeft size={16} />
        </button>

        {/* Growmark Logo & Active Project Title (No Vertical Divider) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <GrowmarkWordmark width={98} color="var(--text-primary)" />

          <span style={{ color: 'var(--border-subtle)', fontSize: '14px' }}>/</span>

          {isEditingTitle ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="text"
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                onBlur={commitTitle}
                style={{
                  height: '24px',
                  minWidth: '140px',
                  maxWidth: '260px',
                  padding: '0 2px 3px 2px',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: 'var(--text-primary)',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: '1.5px dashed var(--border-focus)',
                  borderRadius: 0,
                  outline: 'none',
                  boxShadow: 'none',
                }}
              />
              <button
                type="button"
                className="btn btn-icon btn-ghost"
                style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
                onClick={commitTitle}
                title="Save project name"
                aria-label="Save project name"
              >
                <Check size={13} strokeWidth={2.2} />
              </button>
            </div>
          ) : (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              onClick={() => {
                setTitleDraft(activeProjectName || 'Untitled Project');
                setIsEditingTitle(true);
              }}
              title="Click to rename project"
            >
              <span style={{ fontWeight: 600, fontSize: '13px', letterSpacing: '-0.01em' }}>
                {activeProjectName || 'Untitled Project'}
              </span>
              <Edit3 size={11} style={{ color: 'var(--text-muted)' }} />
            </div>
          )}
        </div>

        {/* Switch Sequence Folder Icon Button */}
        <button
          className="btn btn-icon"
          onClick={onOpenFolderDialog}
          title="Switch Sequence Folder"
          aria-label="Switch Sequence Folder"
        >
          <FolderOpen size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Terminal Logs Toggle Icon Button */}
        <button
          className={`btn btn-icon ${isTerminalOpen ? 'btn-primary' : ''}`}
          onClick={onToggleTerminal}
          title="Toggle FFmpeg Terminal Logs"
          aria-label="Toggle FFmpeg Terminal Logs"
        >
          <Terminal size={14} />
        </button>

        {/* Settings & FFmpeg Engine Configuration */}
        <button
          className="btn btn-icon"
          onClick={onOpenSettings}
          title={
            ffmpegInfo?.available
              ? `Settings (FFmpeg Ready ${ffmpegInfo.isBundled ? 'Bundled' : ''} — ${ffmpegInfo.binaryPath})`
              : 'Settings (FFmpeg Engine Configuration)'
          }
          aria-label="Settings"
        >
          <Settings size={14} />
        </button>

        {/* Theme Toggle */}
        <button
          className="btn btn-icon"
          onClick={onToggleTheme}
          title={theme === 'light' ? 'Switch to Black Mode' : 'Switch to White Mode'}
          aria-label="Toggle Theme"
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
        </button>
      </div>
    </header>
  );
});
