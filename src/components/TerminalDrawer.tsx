import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  Copy,
  Check,
  Trash2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { LogEntry } from '../../electron/types';

interface TerminalDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  logs: LogEntry[];
  activeCommand?: string;
  onClearLogs: () => void;
}

export const TerminalDrawer: React.FC<TerminalDrawerProps> = React.memo(({
  isOpen,
  onToggle,
  logs,
  activeCommand,
  onClearLogs,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleCopyCommand = () => {
    if (!activeCommand) return;
    navigator.clipboard.writeText(activeCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        height: 'var(--term-h, 240px)',
        flexShrink: 0,
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 50,
      }}
    >
      {/* Drawer Top Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Terminal size={14} style={{ color: 'var(--text-secondary)' }} />
          <span className="font-mono text-caption" style={{ color: 'var(--text-primary)' }}>
            FFMPEG TERMINAL & PROCESS STREAM
          </span>
          <span className="badge font-mono" style={{ fontSize: '10px' }}>
            {logs.length} events
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {activeCommand && (
            <button
              className="btn"
              style={{ height: '22px', fontSize: '10.5px', padding: '0 8px' }}
              onClick={handleCopyCommand}
              title="Copy active command to clipboard"
            >
              {copied ? <Check size={11} style={{ color: 'var(--color-success)' }} /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy FFmpeg CLI'}
            </button>
          )}

          <button
            className="btn btn-icon"
            style={{ width: '22px', height: '22px' }}
            onClick={onClearLogs}
            title="Clear logs"
          >
            <Trash2 size={11} />
          </button>

          <button
            className="btn btn-icon"
            style={{ width: '22px', height: '22px' }}
            onClick={onToggle}
            title="Close Drawer"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Underlying FFmpeg Command Monospace Bar */}
      {activeCommand && (
        <div
          style={{
            padding: '6px 14px',
            backgroundColor: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
          className="font-mono"
        >
          <span style={{ color: 'var(--color-info)', fontWeight: 600 }}>$</span>
          <span style={{ userSelect: 'text' }}>{activeCommand}</span>
        </div>
      )}

      {/* Log Output Console */}
      <div
        ref={logContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 14px',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          lineHeight: '1.6',
          backgroundColor: 'var(--bg-viewport)',
          color: 'var(--text-secondary)',
          userSelect: 'text',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>
            [Ready] No FFmpeg tasks executed yet. Start an export to view process output.
          </div>
        ) : (
          logs.map((log) => {
            let color = 'inherit';
            if (log.level === 'command') color = 'var(--color-info)';
            if (log.level === 'error') color = 'var(--color-danger)';
            if (log.level === 'warn') color = 'var(--color-warning)';

            return (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  gap: '8px',
                  color,
                  marginBottom: '2px',
                  wordBreak: 'break-all',
                }}
              >
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>[{log.timestamp}]</span>
                <span>{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
