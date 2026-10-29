import { ExportSettings, SequenceItem } from '../../electron/types';

export interface CommandGeneratorResult {
  /** The FFmpeg binary or command name */
  binary: string;
  /** Array of separate arguments for child_process.spawn */
  args: string[];
  /** Single string representation safe for terminal copy/paste */
  commandString: string;
  /** Generated concat file content if concat demuxer is used */
  concatDemuxerContent?: string;
  /** Concat demuxer file name/path if applicable */
  concatDemuxerFilename?: string;
  /** Target output file path */
  outputFilePath: string;
  /** Expected total output frame count */
  totalOutputFrames: number;
  /** Resolved output width in pixels */
  outputWidth: number;
  /** Resolved output height in pixels */
  outputHeight: number;
  /** Resolved GOP / keyframe interval in frames */
  resolvedGopFrames: number;
}

/**
 * Resolves the effective keyframe interval (GOP length in frames) from settings
 */
export function resolveKeyframeInterval(
  fps: number,
  keyframeMode: ExportSettings['keyframeMode'],
  customKeyintFrames: number
): number {
  const safeFps = Math.max(1, Math.round(fps || 24));
  switch (keyframeMode) {
    case 'every-frame':
      return 1;
    case 'ultra-short':
      return 4;
    case 'short':
      return 12;
    case '1s':
      return safeFps;
    case '2s':
      return safeFps * 2;
    case '4s':
      return safeFps * 4;
    case 'custom':
      return Math.max(1, Math.round(customKeyintFrames || safeFps));
    default:
      return safeFps;
  }
}

/**
 * Sanitizes and formats template string to create a .mp4 output filename
 */
export function formatOutputFilename(
  template: string,
  sequence: SequenceItem,
  settings: ExportSettings,
  outputWidth: number,
  outputHeight: number
): string {
  const baseName = (sequence.name || 'sequence').replace(/\s*\(\.[A-Z0-9]+\)$/i, '');
  const fps = Math.round(settings.targetFramerate);
  const res = `${outputWidth}x${outputHeight}`;
  const quality =
    settings.rateControlMode === 'cbr'
      ? `${settings.targetBitrateMbps}Mbps`
      : `crf${settings.crf}`;
  const codecName =
    settings.codec === 'libx264'
      ? 'h264'
      : settings.codec === 'libx265'
      ? 'h265'
      : 'av1';
  const presetTag = settings.useCasePreset || 'web';
  const loopTag = settings.webOptimizations.seamlessLooping ? 'loop' : 'linear';

  let filename = template
    .replace('{name}', baseName)
    .replace('{preset}', presetTag)
    .replace('{fps}', `${fps}`)
    .replace('{resolution}', res)
    .replace('{quality}', quality)
    .replace('{codec}', codecName)
    .replace('{loop}', loopTag);

  // Fallback only if filename is empty
  if (!filename || !filename.trim()) {
    filename = `${baseName}_${presetTag}_${fps}fps_${res}_${quality}`;
  }

  // Remove illegal filename characters
  filename = filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');

  // Always enforce .mp4 extension
  filename = filename.replace(/\.(webm|mov|mkv|mp4)$/i, '');
  filename += '.mp4';

  return filename;
}

/**
 * Calculates effective output dimensions based on scale setting and source size,
 * ensuring dimensions are strictly even (divisible by 2) for YUV420p MP4 encoder compatibility.
 */
export function calculateOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  scale: ExportSettings['scale'],
  customWidth: number,
  customHeight: number,
  aspectRatioLocked: boolean
): { width: number; height: number } {
  const safeSrcW = sourceWidth > 0 ? sourceWidth : 1920;
  const safeSrcH = sourceHeight > 0 ? sourceHeight : 1080;
  const ratio = safeSrcW / safeSrcH;

  let targetW = safeSrcW;
  let targetH = safeSrcH;

  if (scale === '75') {
    targetW = Math.round(safeSrcW * 0.75);
    targetH = Math.round(safeSrcH * 0.75);
  } else if (scale === '50') {
    targetW = Math.round(safeSrcW * 0.5);
    targetH = Math.round(safeSrcH * 0.5);
  } else if (scale === '25') {
    targetW = Math.round(safeSrcW * 0.25);
    targetH = Math.round(safeSrcH * 0.25);
  } else if (scale === '1080p') {
    if (safeSrcW >= safeSrcH) {
      targetH = 1080;
      targetW = Math.round(1080 * ratio);
    } else {
      targetW = 1080;
      targetH = Math.round(1080 / ratio);
    }
  } else if (scale === '720p') {
    if (safeSrcW >= safeSrcH) {
      targetH = 720;
      targetW = Math.round(720 * ratio);
    } else {
      targetW = 720;
      targetH = Math.round(720 / ratio);
    }
  } else if (scale === 'custom') {
    if (aspectRatioLocked && safeSrcW > 0 && safeSrcH > 0) {
      targetW = customWidth || safeSrcW;
      targetH = Math.round(targetW / ratio);
    } else {
      targetW = customWidth || safeSrcW;
      targetH = customHeight || safeSrcH;
    }
  }

  // Enforce even dimensions required by yuv420p MP4 encoders
  targetW = Math.max(2, Math.floor(targetW / 2) * 2);
  targetH = Math.max(2, Math.floor(targetH / 2) * 2);

  return { width: targetW, height: targetH };
}

/**
 * Builds the complete, battle-tested FFmpeg argument list for converting
 * an image sequence into a highly optimized, web-ready MP4 video file.
 */
export function generateFFmpegCommand(
  sequence: SequenceItem,
  settings: ExportSettings,
  ffmpegBinaryPath: string = 'ffmpeg',
  pass: 1 | 2 | null = null
): CommandGeneratorResult {
  const args: string[] = [];

  // Overwrite output files without asking & hide noisy banner
  args.push('-y', '-hide_banner');

  // Input framerate specification
  const fps = Math.max(1, Number(settings.targetFramerate) || 24);

  // Filter selected frame subset (In-point to Out-point)
  const inPoint = Math.max(0, Math.min(settings.inPoint, sequence.filePaths.length - 1));
  let outPoint = Math.max(inPoint, Math.min(settings.outPoint, sequence.filePaths.length - 1));

  // If seamless looping with boundary duplicate drop is enabled, trim 1 frame from end if >= 2 frames
  if (
    settings.webOptimizations.seamlessLooping &&
    settings.webOptimizations.dropDuplicateEndFrame &&
    outPoint > inPoint
  ) {
    outPoint -= 1;
  }

  const selectedFilePaths = sequence.filePaths.slice(inPoint, outPoint + 1);
  const totalOutputFrames = selectedFilePaths.length;

  // Build Concat Demuxer Script for 100% memory safety and continuous frame streaming
  const durationPerFrame = (1 / fps).toFixed(6);
  const concatLines: string[] = ['ffconcat version 1.0'];

  for (const filePath of selectedFilePaths) {
    const safePath = filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
    concatLines.push(`file '${safePath}'`);
    concatLines.push(`duration ${durationPerFrame}`);
  }

  if (selectedFilePaths.length > 0) {
    const lastSafePath = selectedFilePaths[selectedFilePaths.length - 1]
      .replace(/\\/g, '/')
      .replace(/'/g, "'\\''");
    concatLines.push(`file '${lastSafePath}'`);
  }

  const concatDemuxerContent = concatLines.join('\n');
  const concatDemuxerFilename = `sequence_concat_${Date.now()}.txt`;

  // Input specification
  args.push('-f', 'concat', '-safe', '0', '-r', `${fps}`, '-i', concatDemuxerFilename);

  // Video Filter Graph (-vf)
  const vfFilters: string[] = [];

  const srcW = sequence.width || 1920;
  const srcH = sequence.height || 1080;
  const { width: outW, height: outH } = calculateOutputDimensions(
    srcW,
    srcH,
    settings.scale,
    settings.customWidth,
    settings.customHeight,
    settings.aspectRatioLocked
  );

  const scaleAlg = settings.scalingAlgorithm || 'lanczos';
  if (outW !== srcW || outH !== srcH) {
    vfFilters.push(`scale=${outW}:${outH}:flags=${scaleAlg}`);
  } else {
    // Guarantee even dimensions even at 100% native scale
    vfFilters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  }

  // Optional Post-Scale Luma Micro-Sharpening
  if (settings.sharpenOutput) {
    vfFilters.push('unsharp=3:3:0.35:3:3:0.0');
  }

  // Universal Web Pixel Format (YUV420p)
  if (settings.webOptimizations.forceYuv420p) {
    vfFilters.push('format=yuv420p');
  }

  if (vfFilters.length > 0) {
    args.push('-vf', vfFilters.join(','));
  }

  // Video Codec
  args.push('-c:v', settings.codec);

  // Rate Control: CRF, Constrained CRF (CRF + VBV Maxrate), or Target Bitrate (CBR/ABR)
  const targetKbps = Math.max(100, Math.round((settings.targetBitrateMbps || 4) * 1000));
  const maxKbps = Math.max(200, Math.round((settings.maxBitrateMbps || 6) * 1000));
  const bufSizeKbps = maxKbps * 2;

  if (settings.codec === 'libx264' || settings.codec === 'libx265') {
    if (settings.rateControlMode === 'cbr') {
      args.push('-b:v', `${targetKbps}k`, '-maxrate', `${maxKbps}k`, '-bufsize', `${bufSizeKbps}k`);
    } else if (settings.rateControlMode === 'crf-constrained') {
      args.push('-crf', `${settings.crf}`, '-maxrate', `${maxKbps}k`, '-bufsize', `${bufSizeKbps}k`);
    } else {
      args.push('-crf', `${settings.crf}`);
    }

    args.push('-preset', settings.preset);

    // Codec-specific Profile, B-Frames, and Tune
    if (settings.codec === 'libx264') {
      const profile = settings.webOptimizations.h264Profile || 'high';
      args.push('-profile:v', profile);

      // Baseline profile does not support B-frames
      const effectiveBFrames = profile === 'baseline' ? 0 : Math.max(0, Math.min(4, settings.bFrames));
      args.push('-bf', `${effectiveBFrames}`);

      if (settings.tune && settings.tune !== 'none') {
        args.push('-tune', settings.tune);
      }
    } else if (settings.codec === 'libx265') {
      // Tag as hvc1 so Apple Safari / iOS / macOS play HEVC in MP4 natively
      args.push('-tag:v', 'hvc1');
      const effectiveBFrames = Math.max(0, Math.min(4, settings.bFrames));
      args.push('-bf', `${effectiveBFrames}`);

      if (
        settings.tune &&
        settings.tune !== 'none' &&
        (settings.tune === 'fastdecode' || settings.tune === 'animation' || settings.tune === 'zerolatency')
      ) {
        args.push('-tune', settings.tune);
      }
    }
  } else if (settings.codec === 'libaom-av1') {
    if (settings.rateControlMode === 'cbr') {
      args.push('-b:v', `${targetKbps}k`, '-maxrate', `${maxKbps}k`, '-bufsize', `${bufSizeKbps}k`);
    } else {
      args.push('-crf', `${settings.crf}`, '-b:v', '0');
    }
    const aomCpuUsedMap: Record<string, string> = {
      ultrafast: '8',
      superfast: '7',
      veryfast: '6',
      faster: '5',
      fast: '4',
      medium: '3',
      slow: '2',
      slower: '1',
      veryslow: '0',
    };
    args.push('-cpu-used', aomCpuUsedMap[settings.preset] || '6', '-row-mt', '1');
  } else if (settings.codec === 'libsvtav1') {
    if (settings.rateControlMode === 'cbr') {
      args.push('-b:v', `${targetKbps}k`, '-maxrate', `${maxKbps}k`, '-bufsize', `${bufSizeKbps}k`);
    } else {
      args.push('-crf', `${settings.crf}`);
    }
    const svtPresetMap: Record<string, string> = {
      ultrafast: '10',
      superfast: '9',
      veryfast: '8',
      faster: '7',
      fast: '6',
      medium: '5',
      slow: '4',
      slower: '3',
      veryslow: '2',
    };
    args.push('-preset', svtPresetMap[settings.preset] || '6');
  }

  // Keyframe Interval (GOP Length) & Seamless Loop Structure
  const gopSize = resolveKeyframeInterval(fps, settings.keyframeMode, settings.customKeyintFrames);
  args.push('-g', `${gopSize}`);
  args.push('-keyint_min', `${gopSize}`);

  if (settings.webOptimizations.seamlessLooping || gopSize <= 12) {
    if (settings.codec === 'libx264' || settings.codec === 'libx265') {
      args.push('-sc_threshold', '0');
    }
    if (gopSize > 1 && settings.webOptimizations.seamlessLooping) {
      args.push('-flags', '+cgop');
    }
  }

  // Explicit BT.709 Web Color Space Metadata
  if (settings.webOptimizations.forceYuv420p) {
    args.push(
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-color_range',
      'tv'
    );
  }

  // Audio Stripping (-an) for clean muted autoplay web videos
  if (settings.webOptimizations.stripAudio) {
    args.push('-an');
  }

  // Faststart for MP4 (shifts moov atom to head of file for instant progressive HTML5 streaming)
  if (settings.webOptimizations.faststart) {
    args.push('-movflags', '+faststart');
  }

  // Two-pass encoding handling
  if (settings.twoPass && pass !== null) {
    args.push('-pass', `${pass}`);
    if (pass === 1) {
      args.push('-f', 'null');
      args.push(process.platform === 'win32' ? 'NUL' : '/dev/null');
      return {
        binary: ffmpegBinaryPath,
        args,
        commandString: formatCommandLine(ffmpegBinaryPath, args),
        concatDemuxerContent,
        concatDemuxerFilename,
        outputFilePath: 'NUL',
        totalOutputFrames,
        outputWidth: outW,
        outputHeight: outH,
        resolvedGopFrames: gopSize,
      };
    }
  }

  // Output filename and destination (.mp4)
  const outputFilename = formatOutputFilename(
    settings.filenameTemplate,
    sequence,
    settings,
    outW,
    outH
  );

  const normalizedDir = settings.outputDirectory || sequence.directory;
  const sep = normalizedDir.includes('\\') ? '\\' : '/';
  const outputFilePath = `${normalizedDir.replace(/[/\\]+$/, '')}${sep}${outputFilename}`;

  args.push(outputFilePath);

  const commandString = formatCommandLine(ffmpegBinaryPath, args);

  return {
    binary: ffmpegBinaryPath,
    args,
    commandString,
    concatDemuxerContent,
    concatDemuxerFilename,
    outputFilePath,
    totalOutputFrames,
    outputWidth: outW,
    outputHeight: outH,
    resolvedGopFrames: gopSize,
  };
}

/**
 * Formats a command and arguments into an easy-to-read, copyable shell command
 */
export function formatCommandLine(binary: string, args: string[]): string {
  const escapedBinary = binary.includes(' ') ? `"${binary}"` : binary;
  const escapedArgs = args.map((arg) => {
    if (arg.includes(' ') || arg.includes(';') || arg.includes('&')) {
      return `"${arg}"`;
    }
    return arg;
  });

  return `${escapedBinary} ${escapedArgs.join(' ')}`;
}
