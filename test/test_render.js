const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

// Require compiled core modules from dist-electron
const { detectImageSequences } = require('../dist-electron/src/core/sequenceDetector');
const { generateFFmpegCommand } = require('../dist-electron/src/core/ffmpegGenerator');
const { DEFAULT_EXPORT_SETTINGS, USE_CASE_PRESETS } = require('../dist-electron/src/core/presetsAndGuidance');
const { estimateMP4Output } = require('../dist-electron/src/core/mp4Estimator');

async function testPipeline() {
  console.log('--- 1. Testing Sequence Detector on sample_sequence ---');
  const sampleDir = path.resolve(__dirname, '../sample_sequence');
  const files = fs.readdirSync(sampleDir).map((f) => ({
    name: f,
    path: path.join(sampleDir, f),
    size: fs.statSync(path.join(sampleDir, f)).size,
  }));

  const detected = detectImageSequences(files, sampleDir);
  console.log(`Detected ${detected.length} sequence(s):`);
  const seq = detected[0];
  console.log(`- Pattern: ${seq.pattern}`);
  console.log(`- Total frames: ${seq.totalFrames} (indices: ${seq.firstFrameIndex} to ${seq.lastFrameIndex})`);
  console.log(`- Missing frames: ${seq.missingIndices.length}`);
  seq.width = 640;
  seq.height = 360;

  console.log('\n--- 2. Testing Use-Case Presets & MP4 File Size Estimator ---');
  for (const preset of USE_CASE_PRESETS) {
    const presetSettings = preset.apply({
      ...DEFAULT_EXPORT_SETTINGS,
      inPoint: 0,
      outPoint: seq.totalFrames - 1,
    });
    const est = estimateMP4Output(seq, presetSettings);
    console.log(
      `Preset [${preset.name}]: Est=${est.estimatedFormatted} (${est.estimatedBitrateMbps} Mbps), GOP=${est.resolvedGopFrames}f, Scores=[Size:${est.tradeOffs.fileSizeScore}%, Fidelity:${est.tradeOffs.visualFidelityScore}%, Load:${est.tradeOffs.loadingSpeedScore}%, Smooth:${est.tradeOffs.playbackSmoothnessScore}%]`
    );
  }

  console.log('\n--- 3. Testing FFmpeg Command Generator (Scroll-Driven Sequence MP4) ---');
  const ffmpegBinary = require('ffmpeg-static');
  console.log(`FFmpeg binary: ${ffmpegBinary}`);

  const scrollPreset = USE_CASE_PRESETS.find((p) => p.id === 'scroll-driven');
  const settings = {
    ...scrollPreset.apply(DEFAULT_EXPORT_SETTINGS),
    inPoint: 0,
    outPoint: 47,
    outputDirectory: path.resolve(__dirname, '../output_test'),
    filenameTemplate: '{name}_{preset}_{fps}fps_{resolution}_{quality}',
  };

  if (!fs.existsSync(settings.outputDirectory)) {
    fs.mkdirSync(settings.outputDirectory, { recursive: true });
  }

  const plan = generateFFmpegCommand(seq, settings, ffmpegBinary);
  console.log('Generated CLI:');
  console.log(plan.commandString);

  // Write concat demuxer file
  const concatPath = path.join(settings.outputDirectory, 'concat.txt');
  fs.writeFileSync(concatPath, plan.concatDemuxerContent, 'utf-8');

  // Replace concat filename in args
  const inputIdx = plan.args.indexOf(plan.concatDemuxerFilename);
  if (inputIdx !== -1) {
    plan.args[inputIdx] = concatPath;
  }

  console.log('\n--- 4. Executing Standalone Offline FFmpeg MP4 Render ---');
  const startTime = Date.now();
  const res = spawnSync(plan.binary, plan.args, { encoding: 'utf-8' });

  if (res.status === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const stat = fs.statSync(plan.outputFilePath);
    console.log(`\nSUCCESS! Encoded web-ready MP4 in ${elapsed}s`);
    console.log(`Output: ${plan.outputFilePath} (${(stat.size / 1024).toFixed(1)} KB)`);
  } else {
    console.error('FFmpeg execution failed:', res.stderr);
    process.exit(1);
  }

  // Cleanup concat file
  if (fs.existsSync(concatPath)) {
    fs.unlinkSync(concatPath);
  }
}

testPipeline().catch(console.error);
