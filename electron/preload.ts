import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { SequenceItem, ExportSettings, FFmpegProgress, LogEntry } from './types';

const electronAPI = {
  selectDirectory: (title?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-directory', title),

  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return (file as any).path || '';
    }
  },

  selectFFmpegBinary: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:select-ffmpeg-binary'),

  scanDirectory: (
    directoryPath: string
  ): Promise<{ success: boolean; sequences?: SequenceItem[]; error?: string }> =>
    ipcRenderer.invoke('scanner:scan-directory', directoryPath),

  getFFmpegInfo: (): Promise<{
    available: boolean;
    binaryPath: string;
    isBundled?: boolean;
    version?: string;
    error?: string;
  }> => ipcRenderer.invoke('ffmpeg:get-info'),

  startRender: (
    sequence: SequenceItem,
    settings: ExportSettings
  ): Promise<{
    success: boolean;
    outputPath?: string;
    outputSizeBytes?: number;
    error?: string;
    cancelled?: boolean;
  }> => ipcRenderer.invoke('ffmpeg:start-render', { sequence, settings }),

  cancelRender: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('ffmpeg:cancel-render'),

  showItemInFolder: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:show-item-in-folder', filePath),

  onProgress: (callback: (progress: FFmpegProgress) => void): (() => void) => {
    const handler = (_: any, data: FFmpegProgress) => callback(data);
    ipcRenderer.on('ffmpeg:progress', handler);
    return () => {
      ipcRenderer.removeListener('ffmpeg:progress', handler);
    };
  },

  onLog: (callback: (log: LogEntry) => void): (() => void) => {
    const handler = (_: any, data: LogEntry) => callback(data);
    ipcRenderer.on('ffmpeg:log', handler);
    return () => {
      ipcRenderer.removeListener('ffmpeg:log', handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
