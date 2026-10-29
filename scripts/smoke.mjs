// Smoke test for a packaged build: launches the app with a debug port,
// checks it found its bundled FFmpeg, then encodes the sample sequence
// (npm run sample) through the same IPC the UI uses.
//
//   node scripts/smoke.mjs "<path to the app's executable>"
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const exe = process.argv[2];
const port = 9333;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sampleDir = path.join(root, 'sample_sequence').split(path.sep).join('/');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seq2mp4-')).split(path.sep).join('/');

const app = spawn(exe, [`--remote-debugging-port=${port}`], { stdio: 'ignore' });
const fail = (msg) => { console.error('SMOKE FAIL:', msg); app.kill(); process.exit(1); };
setTimeout(() => fail('timed out'), 120000).unref();

let page;
for (let i = 0; i < 60 && !page; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    page = list.find((t) => t.type === 'page');
  } catch {}
  if (!page) await new Promise((r) => setTimeout(r, 500));
}
if (!page) fail('no window');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const evaluate = (expression) =>
  new Promise((resolve) => {
    const my = ++id;
    const onMessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id !== my) return;
      ws.removeEventListener('message', onMessage);
      if (m.result?.exceptionDetails) console.log('eval error:', m.result.exceptionDetails.exception?.description);
      resolve(m.result?.result?.value);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id: my, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });

// the preload exposes window.electronAPI once the page has loaded
for (let i = 0; i < 40 && !(await evaluate('Boolean(window.electronAPI)')); i++) {
  await new Promise((r) => setTimeout(r, 250));
}

const ff = await evaluate('window.electronAPI.getFFmpegInfo()');
console.log('ffmpeg:', JSON.stringify(ff));
if (!ff || !ff.available || !ff.isBundled) fail('bundled FFmpeg not found');

const result = await evaluate(`(async () => {
  const s = await window.electronAPI.scanDirectory(${JSON.stringify(sampleDir)});
  if (!s.success) return s;
  const settings = {
    useCasePreset: 'scroll-driven', format: 'mp4', codec: 'libx264', scale: '50',
    customWidth: 1920, customHeight: 1080, aspectRatioLocked: true, scalingAlgorithm: 'lanczos',
    targetFramerate: 24, rateControlMode: 'crf-constrained', crf: 21, targetBitrateMbps: 4.5, maxBitrateMbps: 6,
    webOptimizations: { faststart: true, seamlessLooping: true, dropDuplicateEndFrame: false, forceYuv420p: true, stripAudio: true, h264Profile: 'high' },
    preset: 'medium', keyframeMode: 'custom', customKeyintFrames: 4, bFrames: 0, tune: 'fastdecode',
    twoPass: false, sharpenOutput: true, inPoint: 0, outPoint: 0,
    outputDirectory: ${JSON.stringify(outDir)}, filenameTemplate: '{name}_{preset}_{fps}fps_{resolution}_{quality}',
  };
  return window.electronAPI.startRender(s.sequences[0], settings);
})()`);
console.log('render:', JSON.stringify(result));
if (!result || !result.success || !(result.outputSizeBytes > 0)) fail('render failed');

console.log('SMOKE OK');
ws.close();
app.kill();
process.exit(0);
