import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { detectImageSequences } from '../src/core/sequenceDetector';
import { generateFFmpegCommand } from '../src/core/ffmpegGenerator';
import { ExportSettings, SequenceItem, FFmpegProgress, LogEntry } from './types';

// Bundled ffmpeg-static path resolution
let bundledFFmpegPath = '';
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // In the packaged app the binary is unpacked beside app.asar (build.asarUnpack)
  const ffmpegStatic = String(require('ffmpeg-static') || '').replace(
    `app.asar${path.sep}`,
    `app.asar.unpacked${path.sep}`
  );
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    bundledFFmpegPath = ffmpegStatic;
  }
} catch (e) {
  // Will check system path
}

let mainWindow: BrowserWindow | null = null;
let activeFFmpegProcess: ChildProcess | null = null;
let customFFmpegPath: string | null = null;
let cachedEncoders: Set<string> | null = null;
let lastBinaryForEncoders: string | null = null;

async function getAvailableEncoders(binary: string): Promise<Set<string>> {
  if (cachedEncoders && lastBinaryForEncoders === binary) {
    return cachedEncoders;
  }
  return new Promise((resolve) => {
    try {
      const proc = spawn(binary, ['-encoders'], { windowsHide: true });
      let output = '';
      proc.stdout.on('data', (d) => (output += d.toString()));
      proc.stderr.on('data', (d) => (output += d.toString()));
      proc.on('close', () => {
        const encoders = new Set<string>();
        for (const line of output.split('\n')) {
          const match = line.match(/^\s*[A-Z.]{6}\s+([a-zA-Z0-9_-]+)/);
          if (match) {
            encoders.add(match[1]);
          }
        }
        cachedEncoders = encoders;
        lastBinaryForEncoders = binary;
        resolve(encoders);
      });
      proc.on('error', () => {
        resolve(new Set());
      });
    } catch {
      resolve(new Set());
    }
  });
}

// Register custom protocol for local high-performance image loading
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
  {
    scheme: 'local-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

function getFFmpegExecutable(): string {
  if (customFFmpegPath && fs.existsSync(customFFmpegPath)) {
    return customFFmpegPath;
  }
  if (bundledFFmpegPath && fs.existsSync(bundledFFmpegPath)) {
    return bundledFFmpegPath;
  }
  return 'ffmpeg';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0A0A0A',
    frame: true,
    titleBarStyle: 'default',
    title: 'Sequence to MP4 — Editorial Web Media Encoder',
    // the Growmark mark in the taskbar, not Electron's atom (vite copies public/ into dist/)
    icon: [path.join(__dirname, '../../dist/icon.png'), path.join(__dirname, '../dist/icon.png')].find(
      (p) => fs.existsSync(p)
    ),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allows local file preview safely in offline desktop app
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  const candidateA = path.join(__dirname, '../../dist/index.html');
  const candidateB = path.join(__dirname, '../dist/index.html');
  const prodHtml = fs.existsSync(candidateA)
    ? candidateA
    : fs.existsSync(candidateB)
    ? candidateB
    : null;

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else if (prodHtml) {
    mainWindow.loadFile(prodHtml);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('closed', () => {
    if (activeFFmpegProcess) {
      activeFFmpegProcess.kill('SIGKILL');
      activeFFmpegProcess = null;
    }
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.mp4': 'video/mp4',
  };

  const handleMediaRequest = (request: Request) => {
    try {
      let filePath: string | null = null;
      try {
        const urlObj = new URL(request.url);
        filePath = urlObj.searchParams.get('path');
      } catch {}

      if (!filePath) {
        // Fallback for direct path
        let raw = decodeURIComponent(request.url.replace(/^(media|local-file):\/\//, ''));
        if (process.platform === 'win32') {
          // If starts with /D:/ or /D%3A/, strip leading slash
          raw = raw.replace(/^\/([a-zA-Z]:)/, '$1');
          // If drive letter lost colon e.g. "d/Local" -> "d:/Local"
          raw = raw.replace(/^([a-zA-Z])\/([^\/])/, '$1:/$2');
        }
        filePath = raw;
      }

      if (!filePath || !fs.existsSync(filePath)) {
        console.warn('[Protocol] File does not exist:', filePath);
        return new Response('File not found', { status: 404 });
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const stat = fs.statSync(filePath);
      const totalSize = stat.size;
      const rangeHeader = request.headers.get('range');

      if (rangeHeader && totalSize > 0) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunkStart = Math.max(0, Math.min(start, totalSize - 1));
        const chunkEnd = Math.max(chunkStart, Math.min(end, totalSize - 1));
        const chunkLength = chunkEnd - chunkStart + 1;

        const chunkBuffer = Buffer.alloc(chunkLength);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, chunkBuffer, 0, chunkLength, chunkStart);
        fs.closeSync(fd);

        return new Response(chunkBuffer, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${chunkStart}-${chunkEnd}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkLength),
            'Content-Type': contentType,
            'Cache-Control': ext === '.mp4' ? 'no-cache' : 'public, max-age=86400',
          },
        });
      }

      const buffer = fs.readFileSync(filePath);

      return new Response(buffer, {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(totalSize),
          'Content-Type': contentType,
          'Cache-Control': ext === '.mp4' ? 'no-cache' : 'public, max-age=86400',
        },
      });
    } catch (err: any) {
      console.error('[Protocol] Error reading file:', err);
      return new Response('Internal error', { status: 500 });
    }
  };

  protocol.handle('media', handleMediaRequest);
  protocol.handle('local-file', handleMediaRequest);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler: Folder selection dialog
ipcMain.handle('dialog:select-directory', async (_, title?: string) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const options: Electron.OpenDialogOptions = {
    title: title || 'Select Image Sequence Folder',
    properties: ['openDirectory', 'dontAddToRecent'],
  };
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// IPC Handler: File dialog for custom FFmpeg binary selection
ipcMain.handle('dialog:select-ffmpeg-binary', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select FFmpeg Executable',
    properties: ['openFile'],
    filters: [
      { name: 'Executables', extensions: process.platform === 'win32' ? ['exe'] : ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  customFFmpegPath = result.filePaths[0];
  cachedEncoders = null;
  lastBinaryForEncoders = null;
  return customFFmpegPath;
});

// Helper: Inspect image dimensions from file header
async function getImageDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(24);
    fs.readSync(fd, buffer, 0, 24, 0);
    fs.closeSync(fd);

    // PNG dimension check
    if (buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // BMP dimension check ('BM')
    if (buffer[0] === 0x42 && buffer[1] === 0x4d && buffer.length >= 24) {
      const width = Math.abs(buffer.readInt32LE(18));
      const height = Math.abs(buffer.readInt32LE(22));
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }

    // JPEG dimension check
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      const fullBuffer = fs.readFileSync(filePath);
      let offset = 2;
      while (offset < fullBuffer.length) {
        if (fullBuffer[offset] !== 0xff) break;
        const marker = fullBuffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          const height = fullBuffer.readUInt16BE(offset + 5);
          const width = fullBuffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        const length = fullBuffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    }

    // WebP dimension check
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      const fullBuffer = fs.readFileSync(filePath);
      const format = fullBuffer.toString('ascii', 12, 16);
      if (format === 'VP8 ') {
        const width = fullBuffer.readUInt16LE(26) & 0x3fff;
        const height = fullBuffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      } else if (format === 'VP8L') {
        const b0 = fullBuffer[21];
        const b1 = fullBuffer[22];
        const b2 = fullBuffer[23];
        const b3 = fullBuffer[24];
        const width = 1 + (((b1 & 0x3f) << 8) | b0);
        const height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        return { width, height };
      }
    }
  } catch (err) {
    // Non-critical, fallback will read via preview element
  }
  return null;
}

// Helper: Collect image file entries from a directory (and 1 level of subdirectories if top level has none)
function collectFilesFromDirectory(dirPath: string): {
  resolvedDir: string;
  entries: { name: string; path: string; size?: number }[];
} {
  const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
  const fileEntries: { name: string; path: string; size?: number }[] = [];
  const subdirs: string[] = [];

  for (const ent of dirents) {
    const fullPath = path.join(dirPath, ent.name);
    if (ent.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        fileEntries.push({
          name: ent.name,
          path: fullPath,
          size: stat.size,
        });
      } catch {
        fileEntries.push({
          name: ent.name,
          path: fullPath,
        });
      }
    } else if (ent.isDirectory() && !ent.name.startsWith('.')) {
      subdirs.push(fullPath);
    }
  }

  const topDetected = detectImageSequences(fileEntries, dirPath);
  if (topDetected.length > 0) {
    return { resolvedDir: dirPath, entries: fileEntries };
  }

  // If no sequence directly in dirPath, check immediate subdirectories
  for (const sub of subdirs) {
    try {
      const subDirents = fs.readdirSync(sub, { withFileTypes: true });
      const subEntries: { name: string; path: string; size?: number }[] = [];
      for (const ent of subDirents) {
        if (ent.isFile()) {
          const fullPath = path.join(sub, ent.name);
          try {
            const stat = fs.statSync(fullPath);
            subEntries.push({ name: ent.name, path: fullPath, size: stat.size });
          } catch {
            subEntries.push({ name: ent.name, path: fullPath });
          }
        }
      }
      if (detectImageSequences(subEntries, sub).length > 0) {
        return { resolvedDir: sub, entries: subEntries };
      }
    } catch {}
  }

  return { resolvedDir: dirPath, entries: fileEntries };
}

// IPC Handler: Scan directory for sequences
ipcMain.handle('scanner:scan-directory', async (_, rawDirectoryPath: string) => {
  try {
    let directoryPath = rawDirectoryPath;
    if (directoryPath === '__SAMPLE_SEQUENCE__') {
      const candidateA = path.resolve(__dirname, '../../sample_sequence');
      const candidateB = path.resolve(process.cwd(), 'sample_sequence');
      directoryPath = fs.existsSync(candidateA) ? candidateA : candidateB;
    }

    if (!fs.existsSync(directoryPath)) {
      throw new Error(`Directory does not exist: ${directoryPath}`);
    }

    // If a file path was passed (e.g., from dropping an image file), resolve its parent folder
    const stat = fs.statSync(directoryPath);
    if (stat.isFile()) {
      directoryPath = path.dirname(directoryPath);
    }

    const { resolvedDir, entries } = collectFilesFromDirectory(directoryPath);
    const detected = detectImageSequences(entries, resolvedDir);

    // Read dimensions for each detected sequence's sample file
    for (const seq of detected) {
      if (seq.sampleFilePath) {
        const dims = await getImageDimensions(seq.sampleFilePath);
        if (dims) {
          seq.width = dims.width;
          seq.height = dims.height;
          seq.aspectRatio = `${dims.width}:${dims.height}`;
        }
      }
    }

    return { success: true, sequences: detected };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to scan directory' };
  }
});

// IPC Handler: Query FFmpeg binary information
ipcMain.handle('ffmpeg:get-info', async () => {
  const binary = getFFmpegExecutable();
  try {
    return new Promise((resolve) => {
      const proc = spawn(binary, ['-version']);
      let output = '';
      proc.stdout.on('data', (d) => (output += d.toString()));
      proc.stderr.on('data', (d) => (output += d.toString()));
      proc.on('close', (code) => {
        if (code === 0) {
          const firstLine = output.split('\n')[0].trim();
          resolve({
            available: true,
            binaryPath: binary,
            isBundled: binary === bundledFFmpegPath,
            version: firstLine,
          });
        } else {
          resolve({
            available: false,
            binaryPath: binary,
            error: `FFmpeg returned code ${code}`,
          });
        }
      });
      proc.on('error', (err) => {
        resolve({
          available: false,
          binaryPath: binary,
          error: err.message,
        });
      });
    });
  } catch (err: any) {
    return { available: false, binaryPath: binary, error: err.message };
  }
});

// Helper: Parse FFmpeg stderr for progress
function parseFFmpegStderr(line: string, totalFrames: number): Partial<FFmpegProgress> | null {
  const frameMatch = line.match(/frame=\s*(\d+)/);
  if (!frameMatch) return null;

  const frame = parseInt(frameMatch[1], 10);
  const fpsMatch = line.match(/fps=\s*([\d.]+)/);
  const qMatch = line.match(/q=\s*([\d.-]+)/);
  const sizeMatch = line.match(/size=\s*(\S+)/);
  const timeMatch = line.match(/time=\s*([\d:.]+)/);
  const bitrateMatch = line.match(/bitrate=\s*(\S+)/);
  const speedMatch = line.match(/speed=\s*([\d.x]+)/);

  const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
  const progressPercent = totalFrames > 0 ? Math.min(100, Math.round((frame / totalFrames) * 100)) : 0;

  let estimatedRemainingSeconds: number | undefined = undefined;
  if (fps > 0 && totalFrames > frame) {
    estimatedRemainingSeconds = Math.round((totalFrames - frame) / fps);
  }

  return {
    frame,
    fps,
    bitrate: bitrateMatch ? bitrateMatch[1] : 'N/A',
    totalSize: sizeMatch ? sizeMatch[1] : 'N/A',
    outTime: timeMatch ? timeMatch[1] : '00:00:00',
    speed: speedMatch ? speedMatch[1] : '1x',
    progressPercent,
    estimatedRemainingSeconds,
  };
}

// IPC Handler: Run Render Pipeline
ipcMain.handle(
  'ffmpeg:start-render',
  async (_, { sequence, settings }: { sequence: SequenceItem; settings: ExportSettings }) => {
    if (activeFFmpegProcess) {
      return { success: false, error: 'A render is already in progress' };
    }

    const binary = getFFmpegExecutable();
    const tempDir = os.tmpdir();

    // Verify encoder compatibility
    const availableEncoders = await getAvailableEncoders(binary);
    if (availableEncoders.size > 0 && !availableEncoders.has(settings.codec)) {
      if (settings.codec === 'libsvtav1' && availableEncoders.has('libaom-av1')) {
        settings.codec = 'libaom-av1';
      } else if (settings.codec === 'libaom-av1' && availableEncoders.has('libsvtav1')) {
        settings.codec = 'libsvtav1';
      } else {
        const errorMsg = `Selected video encoder "${settings.codec}" is not available in the active FFmpeg binary (${path.basename(binary)}). Please choose another codec (e.g. H.264 Universal or VP9).`;
        return { success: false, error: errorMsg };
      }
    }

    // Send log message
    const sendLog = (level: LogEntry['level'], message: string) => {
      if (mainWindow) {
        mainWindow.webContents.send('ffmpeg:log', {
          id: Math.random().toString(36).substring(7),
          timestamp: new Date().toLocaleTimeString(),
          level,
          message,
        } as LogEntry);
      }
    };

    try {
      const passes = settings.twoPass ? [1, 2] : [null];

      for (const currentPass of passes) {
        const plan = generateFFmpegCommand(sequence, settings, binary, currentPass as 1 | 2 | null);

        // Concat Demuxer Script for memory safety and frame subset selection
        let concatFilePath: string | null = null;
        if (plan.concatDemuxerContent && plan.concatDemuxerFilename) {
          concatFilePath = path.join(tempDir, plan.concatDemuxerFilename);
          fs.writeFileSync(concatFilePath, plan.concatDemuxerContent, 'utf-8');

          // Replace placeholder filename in args with full path
          const inputIndex = plan.args.indexOf(plan.concatDemuxerFilename);
          if (inputIndex !== -1) {
            plan.args[inputIndex] = concatFilePath;
          }
        }

        sendLog('command', `$ ${plan.binary} ${plan.args.join(' ')}`);

        // Execute FFmpeg child process
        const renderSuccess = await new Promise<boolean>((resolve, reject) => {
          const proc = spawn(plan.binary, plan.args, {
            windowsHide: true,
          });

          activeFFmpegProcess = proc;

          let lastErrorLine = '';
          proc.stderr.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              if (/error|unknown|invalid|failed/i.test(trimmed)) {
                lastErrorLine = trimmed;
              }

              const progress = parseFFmpegStderr(trimmed, plan.totalOutputFrames);
              if (progress && mainWindow) {
                mainWindow.webContents.send('ffmpeg:progress', progress);
              } else {
                sendLog('info', trimmed);
              }
            }
          });

          proc.on('error', (err) => {
            sendLog('error', `FFmpeg execution error: ${err.message}`);
            cleanupConcat();
            activeFFmpegProcess = null;
            reject(err);
          });

          proc.on('close', (code) => {
            cleanupConcat();
            activeFFmpegProcess = null;
            if (code === 0) {
              resolve(true);
            } else if (code === null) {
              sendLog('warn', 'Render was cancelled by user');
              resolve(false);
            } else {
              const detail = lastErrorLine ? `: ${lastErrorLine}` : '';
              sendLog('error', `FFmpeg process exited with code ${code}${detail}`);
              reject(new Error(`FFmpeg exited with error code ${code}${detail}`));
            }
          });

          function cleanupConcat() {
            if (concatFilePath && fs.existsSync(concatFilePath)) {
              try {
                fs.unlinkSync(concatFilePath);
              } catch {}
            }
          }
        });

        if (!renderSuccess) {
          return { success: false, cancelled: true };
        }
      }

      // Generate final output path from plan
      const finalPlan = generateFFmpegCommand(sequence, settings, binary);
      let outputSizeBytes: number | undefined = undefined;
      if (fs.existsSync(finalPlan.outputFilePath)) {
        try {
          outputSizeBytes = fs.statSync(finalPlan.outputFilePath).size;
        } catch {}
      }
      sendLog('info', `Render complete! Output saved: ${finalPlan.outputFilePath}`);

      return {
        success: true,
        outputPath: finalPlan.outputFilePath,
        outputSizeBytes,
      };
    } catch (err: any) {
      sendLog('error', `Render failed: ${err.message || err}`);
      return { success: false, error: err.message || 'Render failed' };
    }
  }
);

// IPC Handler: Cancel active render
ipcMain.handle('ffmpeg:cancel-render', async () => {
  if (activeFFmpegProcess) {
    try {
      activeFFmpegProcess.kill('SIGINT');
      setTimeout(() => {
        if (activeFFmpegProcess) {
          activeFFmpegProcess.kill('SIGKILL');
          activeFFmpegProcess = null;
        }
      }, 1000);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'No render in progress' };
});

// IPC Handler: Open item or folder in Explorer
ipcMain.handle('shell:show-item-in-folder', async (_, fullPath: string) => {
  try {
    const winPath = path.resolve(fullPath);
    if (fs.existsSync(winPath)) {
      shell.showItemInFolder(winPath);
      return true;
    }
    const parentDir = path.dirname(winPath);
    if (fs.existsSync(parentDir)) {
      await shell.openPath(parentDir);
      return true;
    }
  } catch {}
  return false;
});
