import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { createRequire } from 'module';
import { detectImageSequences } from './src/core/sequenceDetector';
import { generateFFmpegCommand } from './src/core/ffmpegGenerator';

const require = createRequire(import.meta.url);
let bundledFFmpegPath = 'ffmpeg';
try {
  const staticPath = require('ffmpeg-static');
  if (staticPath && fs.existsSync(staticPath)) {
    bundledFFmpegPath = staticPath;
  }
} catch {}

let activeRenderProcess: ChildProcess | null = null;
let renderCancelledByUser = false;
let currentRenderProgress = {
  frame: 0,
  fps: 0,
  bitrate: 'N/A',
  totalSize: 'N/A',
  outTime: '00:00:00',
  speed: '0x',
  progressPercent: 0,
};
let pendingRenderLogs: { id: string; timestamp: string; level: 'info' | 'warn' | 'error' | 'stderr'; message: string }[] = [];

function pushRenderLog(level: 'info' | 'warn' | 'error' | 'stderr', message: string) {
  pendingRenderLogs.push({
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    level,
    message,
  });
  if (pendingRenderLogs.length > 200) {
    pendingRenderLogs = pendingRenderLogs.slice(-200);
  }
}

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

let activeFolderDialogProc: ChildProcess | null = null;

function openWindowsFolderDialog(description: string): Promise<string | null> {
  if (activeFolderDialogProc) {
    try {
      activeFolderDialogProc.kill();
    } catch {}
    activeFolderDialogProc = null;
  }

  return new Promise((resolve) => {
    const outFile = path.join(os.tmpdir(), `dlg_out_${Date.now()}.txt`);
    const scriptFile = path.join(os.tmpdir(), `dlg_run_${Date.now()}.ps1`);
    const psInner = `
Add-Type -AssemblyName System.Windows.Forms
$sh = New-Object -ComObject Shell.Application
$folder = $sh.BrowseForFolder(0, '${description.replace(/'/g, "''")}', 0x51, 0)
if ($folder -ne $null -and $folder.Self -ne $null) {
  [System.IO.File]::WriteAllText('${outFile.replace(/'/g, "''")}', $folder.Self.Path)
}
`;
    fs.writeFileSync(scriptFile, psInner, 'utf-8');

    const launcher = `
$ws = New-Object -ComObject WScript.Shell
$ws.Run('powershell.exe -NoProfile -Sta -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptFile}"', 1, $true)
`;
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', launcher],
      { windowsHide: true }
    );
    activeFolderDialogProc = proc;
    proc.on('close', () => {
      if (activeFolderDialogProc === proc) activeFolderDialogProc = null;
      let picked: string | null = null;
      try {
        if (fs.existsSync(outFile)) {
          picked = fs.readFileSync(outFile, 'utf-8').trim() || null;
          fs.unlinkSync(outFile);
        }
      } catch {}
      try {
        if (fs.existsSync(scriptFile)) fs.unlinkSync(scriptFile);
      } catch {}
      resolve(picked);
    });
    proc.on('error', () => {
      if (activeFolderDialogProc === proc) activeFolderDialogProc = null;
      resolve(null);
    });
  });
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-sequence-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url) return next();

          if (req.url.startsWith('/api/select-directory')) {
            try {
              const urlObj = new URL(req.url, 'http://localhost:5173');
              const title = urlObj.searchParams.get('title') || 'Select Folder';
              const selectedPath = await openWindowsFolderDialog(title);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ path: selectedPath }));
              return;
            } catch (err: any) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ path: null, error: err.message }));
              return;
            }
          }

          if (req.url.startsWith('/api/ffmpeg-info')) {
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                available: Boolean(bundledFFmpegPath),
                binaryPath: bundledFFmpegPath,
                isBundled: true,
                version: 'Bundled FFmpeg Engine',
              })
            );
            return;
          }

          if (req.url.startsWith('/api/show-item')) {
            try {
              const urlObj = new URL(req.url, 'http://localhost:5173');
              const rawPath = urlObj.searchParams.get('path') || '';
              const winPath = rawPath ? path.resolve(rawPath) : '';
              if (winPath && fs.existsSync(winPath)) {
                const stat = fs.statSync(winPath);
                const explorerCmd = stat.isDirectory()
                  ? `explorer.exe "${winPath}"`
                  : `explorer.exe /select,"${winPath}"`;
                const psReveal = `
                  $ws = New-Object -ComObject WScript.Shell;
                  $ws.Run('${explorerCmd.replace(/'/g, "''")}', 1, $false);
                `;
                spawn(
                  'powershell.exe',
                  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psReveal],
                  { windowsHide: true }
                );
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, resolvedPath: winPath }));
                return;
              } else if (winPath && fs.existsSync(path.dirname(winPath))) {
                const parentDir = path.dirname(winPath);
                const psOpenParent = `
                  $ws = New-Object -ComObject WScript.Shell;
                  $ws.Run('explorer.exe "${parentDir.replace(/'/g, "''")}"', 1, $false);
                `;
                spawn(
                  'powershell.exe',
                  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psOpenParent],
                  { windowsHide: true }
                );
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, resolvedPath: parentDir }));
                return;
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: 'File or folder does not exist on disk' }));
              return;
            } catch (err: any) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
              return;
            }
          }

          if (req.url.startsWith('/api/fs-locations') && req.method === 'GET') {
            try {
              const urlObj = new URL(req.url, 'http://localhost:5173');
              const requestedDir = urlObj.searchParams.get('dir') || '';
              const homeDir = os.homedir();
              const defaultExportsDir = path.resolve(process.cwd(), 'exports');
              if (!fs.existsSync(defaultExportsDir)) {
                try {
                  fs.mkdirSync(defaultExportsDir, { recursive: true });
                } catch {}
              }

              const quickLocations = [
                { label: 'Exports', path: defaultExportsDir },
                { label: 'Desktop', path: path.join(homeDir, 'Desktop') },
                { label: 'Downloads', path: path.join(homeDir, 'Downloads') },
                { label: 'Videos', path: path.join(homeDir, 'Videos') },
                { label: 'Documents', path: path.join(homeDir, 'Documents') },
              ].filter((loc) => fs.existsSync(loc.path));

              const drives: string[] = [];
              for (const letter of ['C', 'D', 'E', 'F', 'G']) {
                const drv = `${letter}:\\`;
                if (fs.existsSync(drv)) drives.push(drv);
              }

              const currentDir =
                requestedDir && fs.existsSync(requestedDir)
                  ? path.resolve(requestedDir)
                  : defaultExportsDir;

              const parentDir = path.dirname(currentDir) !== currentDir ? path.dirname(currentDir) : null;
              let folders: { name: string; path: string }[] = [];
              try {
                const dirents = fs.readdirSync(currentDir, { withFileTypes: true });
                folders = dirents
                  .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('$'))
                  .map((d) => ({
                    name: d.name,
                    path: path.join(currentDir, d.name),
                  }))
                  .sort((a, b) => a.name.localeCompare(b.name));
              } catch {}

              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: true,
                  currentDir,
                  parentDir,
                  quickLocations,
                  drives,
                  folders,
                })
              );
              return;
            } catch (err: any) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
              return;
            }
          }

          if (req.url.startsWith('/api/fs-mkdir') && req.method === 'POST') {
            let body = '';
            req.on('data', (c) => (body += c.toString()));
            req.on('end', () => {
              try {
                const { parentDir, folderName } = JSON.parse(body);
                const safeName = String(folderName || '').replace(/[<>:"/\\|?*]/g, '_').trim();
                if (!parentDir || !safeName) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, error: 'Invalid folder name' }));
                  return;
                }
                const newPath = path.join(path.resolve(parentDir), safeName);
                fs.mkdirSync(newPath, { recursive: true });
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, path: newPath }));
              } catch (err: any) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
            return;
          }

          if (req.url.startsWith('/api/stage-init') && req.method === 'POST') {
            try {
              const stageDir = path.join(os.tmpdir(), `seq_stage_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
              fs.mkdirSync(stageDir, { recursive: true });
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, stageDir }));
              return;
            } catch (err: any) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
              return;
            }
          }

          if (req.url.startsWith('/api/stage-frame') && req.method === 'POST') {
            try {
              const urlObj = new URL(req.url, 'http://localhost:5173');
              const stageDir = urlObj.searchParams.get('stageDir') || '';
              const fileName = path.basename(urlObj.searchParams.get('name') || 'frame.png');
              if (!stageDir || !fs.existsSync(stageDir)) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Invalid staging directory' }));
                return;
              }
              const destPath = path.join(stageDir, fileName);
              const writeStream = fs.createWriteStream(destPath);
              req.pipe(writeStream);
              writeStream.on('finish', () => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, filePath: destPath }));
              });
              writeStream.on('error', (err) => {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: err.message }));
              });
              return;
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
              return;
            }
          }

          if (req.url.startsWith('/api/render-progress')) {
            const logsToReturn = pendingRenderLogs;
            pendingRenderLogs = [];
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                progress: currentRenderProgress,
                logs: logsToReturn,
              })
            );
            return;
          }

          if (req.url.startsWith('/api/cancel-render') && req.method === 'POST') {
            renderCancelledByUser = true;
            if (activeRenderProcess) {
              try {
                activeRenderProcess.kill('SIGTERM');
              } catch {}
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
            return;
          }

          if (req.url.startsWith('/api/start-render') && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => (body += chunk.toString()));
            req.on('end', async () => {
              let stagedDirToClean: string | null = null;
              try {
                const { sequence, settings, stagedDir } = JSON.parse(body);
                stagedDirToClean = stagedDir || null;
                const tempDir = os.tmpdir();
                const workingSeq = { ...sequence };

                if (stagedDir && !settings.outputDirectory) {
                  workingSeq.directory = path.resolve(process.cwd(), 'exports');
                  fs.mkdirSync(workingSeq.directory, { recursive: true });
                }

                renderCancelledByUser = false;
                pendingRenderLogs = [];
                currentRenderProgress = {
                  frame: 0,
                  fps: 0,
                  bitrate: 'N/A',
                  totalSize: 'N/A',
                  outTime: '00:00:00',
                  speed: '0x',
                  progressPercent: 0,
                };

                const totalFramesToEncode = Math.max(
                  1,
                  (settings.outPoint ?? workingSeq.filePaths.length - 1) - (settings.inPoint ?? 0) + 1
                );

                const passes = settings.twoPass ? [1, 2] : [null];
                for (const currentPass of passes) {
                  if (renderCancelledByUser) break;

                  const plan = generateFFmpegCommand(
                    workingSeq,
                    settings,
                    bundledFFmpegPath,
                    currentPass as 1 | 2 | null
                  );
                  const outDir = path.dirname(plan.outputFilePath);
                  if (!fs.existsSync(outDir)) {
                    fs.mkdirSync(outDir, { recursive: true });
                  }

                  let concatFilePath: string | null = null;
                  if (plan.concatDemuxerContent && plan.concatDemuxerFilename) {
                    concatFilePath = path.join(tempDir, plan.concatDemuxerFilename);
                    fs.writeFileSync(concatFilePath, plan.concatDemuxerContent, 'utf-8');
                    const idx = plan.args.indexOf(plan.concatDemuxerFilename);
                    if (idx !== -1) plan.args[idx] = concatFilePath;
                  }

                  pushRenderLog('info', `Executing FFmpeg${currentPass ? ` (Pass ${currentPass})` : ''}...`);

                  await new Promise<void>((resolve, reject) => {
                    const spawnArgs = ['-progress', 'pipe:1', ...plan.args];
                    const proc = spawn(plan.binary, spawnArgs, { windowsHide: true });
                    activeRenderProcess = proc;
                    let lastErr = '';

                    proc.stdout.on('data', (d) => {
                      const text = d.toString();
                      for (const rawLine of text.split(/\r?\n|\r/)) {
                        const line = rawLine.trim();
                        if (line.startsWith('frame=')) {
                          const frameNum = parseInt(line.replace('frame=', '').trim(), 10);
                          if (!isNaN(frameNum)) {
                            const pct = Math.min(99, Math.round((frameNum / totalFramesToEncode) * 100));
                            currentRenderProgress = {
                              ...currentRenderProgress,
                              frame: frameNum,
                              progressPercent: pct,
                            };
                          }
                        } else if (line.startsWith('fps=')) {
                          const fpsVal = parseFloat(line.replace('fps=', '').trim());
                          if (!isNaN(fpsVal)) {
                            currentRenderProgress = {
                              ...currentRenderProgress,
                              fps: fpsVal,
                            };
                          }
                        } else if (line.startsWith('bitrate=')) {
                          currentRenderProgress = {
                            ...currentRenderProgress,
                            bitrate: line.replace('bitrate=', '').trim(),
                          };
                        } else if (line.startsWith('out_time=')) {
                          currentRenderProgress = {
                            ...currentRenderProgress,
                            outTime: line.replace('out_time=', '').trim().split('.')[0],
                          };
                        } else if (line.startsWith('speed=')) {
                          currentRenderProgress = {
                            ...currentRenderProgress,
                            speed: line.replace('speed=', '').trim(),
                          };
                        }
                      }
                    });

                    proc.stderr.on('data', (d) => {
                      const text = d.toString();
                      for (const rawLine of text.split(/\r?\n|\r/)) {
                        const line = rawLine.trim();
                        if (!line) continue;
                        if (line.includes('frame=')) {
                          const frameM = line.match(/frame=\s*(\d+)/);
                          const fpsM = line.match(/fps=\s*([\d.]+)/);
                          const sizeM = line.match(/size=\s*(\S+)/);
                          const timeM = line.match(/time=\s*(\S+)/);
                          const brM = line.match(/bitrate=\s*(\S+)/);
                          const spdM = line.match(/speed=\s*(\S+)/);
                          const frameNum = frameM ? parseInt(frameM[1], 10) : currentRenderProgress.frame;
                          const pct = Math.min(99, Math.round((frameNum / totalFramesToEncode) * 100));
                          currentRenderProgress = {
                            frame: frameNum,
                            fps: fpsM ? parseFloat(fpsM[1]) : currentRenderProgress.fps,
                            totalSize: sizeM ? sizeM[1] : currentRenderProgress.totalSize,
                            outTime: timeM ? timeM[1] : currentRenderProgress.outTime,
                            bitrate: brM ? brM[1] : currentRenderProgress.bitrate,
                            speed: spdM ? spdM[1] : currentRenderProgress.speed,
                            progressPercent: pct,
                          };
                        } else {
                          pushRenderLog('stderr', line);
                          if (/error|invalid|failed/i.test(line)) lastErr = line;
                        }
                      }
                    });
                    proc.on('close', (code) => {
                      activeRenderProcess = null;
                      if (concatFilePath && fs.existsSync(concatFilePath)) {
                        try {
                          fs.unlinkSync(concatFilePath);
                        } catch {}
                      }
                      if (renderCancelledByUser) {
                        resolve();
                      } else if (code === 0) {
                        currentRenderProgress = {
                          ...currentRenderProgress,
                          frame: totalFramesToEncode,
                          progressPercent: 100,
                        };
                        resolve();
                      } else {
                        reject(new Error(lastErr || `FFmpeg exited with code ${code}`));
                      }
                    });
                    proc.on('error', (err) => {
                      activeRenderProcess = null;
                      reject(err);
                    });
                  });
                }

                if (stagedDirToClean && fs.existsSync(stagedDirToClean)) {
                  try {
                    fs.rmSync(stagedDirToClean, { recursive: true, force: true });
                  } catch {}
                }

                if (renderCancelledByUser) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, cancelled: true }));
                  return;
                }

                const finalPlan = generateFFmpegCommand(workingSeq, settings, bundledFFmpegPath);
                const resolvedOutput = path.resolve(finalPlan.outputFilePath);
                let outputSizeBytes: number | undefined;
                if (fs.existsSync(resolvedOutput)) {
                  outputSizeBytes = fs.statSync(resolvedOutput).size;
                }

                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    success: true,
                    outputPath: resolvedOutput,
                    outputSizeBytes,
                  })
                );
              } catch (err: any) {
                if (stagedDirToClean && fs.existsSync(stagedDirToClean)) {
                  try {
                    fs.rmSync(stagedDirToClean, { recursive: true, force: true });
                  } catch {}
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    success: false,
                    error: err.message || 'Render failed',
                  })
                );
              }
            });
            return;
          }

          if (req.url.startsWith('/api/media')) {
            try {
              const urlObj = new URL(req.url, 'http://localhost:5173');
              let filePath = urlObj.searchParams.get('path') || '';
              if (!filePath || !fs.existsSync(filePath)) {
                res.statusCode = 404;
                res.end('Not found');
                return;
              }
              const ext = path.extname(filePath).toLowerCase();
              const stat = fs.statSync(filePath);
              res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
              res.setHeader('Content-Length', String(stat.size));
              res.setHeader('Cache-Control', ext === '.mp4' ? 'no-cache' : 'public, max-age=86400');
              fs.createReadStream(filePath).pipe(res);
              return;
            } catch (err) {
              res.statusCode = 500;
              res.end('Error reading media');
              return;
            }
          }

          if (req.url.startsWith('/api/scan-directory')) {
            try {
              const urlObj = new URL(req.url, 'http://localhost:5173');
              let dirPath = urlObj.searchParams.get('dir') || '';
              if (dirPath === '__SAMPLE_SEQUENCE__') {
                dirPath = path.resolve(__dirname, 'sample_sequence');
              }
              if (!dirPath || !fs.existsSync(dirPath)) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: 'Directory not found' }));
                return;
              }
              const stat = fs.statSync(dirPath);
              if (stat.isFile()) {
                dirPath = path.dirname(dirPath);
              }
              const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
              const entries = dirents
                .filter((d) => d.isFile())
                .map((d) => {
                  const full = path.join(dirPath, d.name);
                  let size = 0;
                  try {
                    size = fs.statSync(full).size;
                  } catch {}
                  return { name: d.name, path: full, size };
                });
              const sequences = detectImageSequences(entries, dirPath);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, sequences }));
              return;
            } catch (err: any) {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
              return;
            }
          }

          next();
        });
      },
    },
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
