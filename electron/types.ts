export type ContainerFormat = 'mp4';

export type VideoCodec = 'libx264' | 'libx265' | 'libsvtav1' | 'libaom-av1';

export type EncoderPreset =
  | 'ultrafast'
  | 'superfast'
  | 'veryfast'
  | 'faster'
  | 'fast'
  | 'medium'
  | 'slow'
  | 'slower'
  | 'veryslow';

export type ResolutionScale = '100' | '75' | '50' | '25' | '1080p' | '720p' | 'custom';

export type ScalingAlgorithm = 'lanczos' | 'bicubic' | 'bilinear';

export type RateControlMode = 'crf-constrained' | 'crf' | 'cbr';

export type KeyframeIntervalMode =
  | 'every-frame'
  | 'ultra-short'
  | 'short'
  | '1s'
  | '2s'
  | '4s'
  | 'custom';

export type H264Profile = 'baseline' | 'main' | 'high';

export type EncoderTune = 'none' | 'fastdecode' | 'animation' | 'film' | 'zerolatency';

export type UseCasePresetId =
  | 'hero-animation'
  | 'scroll-driven'
  | 'background-video'
  | 'visual-presentation'
  | 'custom';

export interface SequenceItem {
  id: string;
  name: string;
  pattern: string;
  prefix: string;
  suffix: string;
  padding: number;
  extension: string;
  firstFrameIndex: number;
  lastFrameIndex: number;
  totalFrames: number;
  missingIndices: number[];
  directory: string;
  sampleFilePath: string;
  filePaths: string[];
  fileNames?: string[];
  /** The frames as detected on disk, kept once frames are removed or reordered so they can be restored */
  originalFilePaths?: string[];
  originalFileNames?: string[];
  width?: number;
  height?: number;
  aspectRatio?: string;
  totalSizeApproxBytes?: number;
}

export interface WebOptimizationSettings {
  /** Enables -movflags +faststart for MP4 files to shift moov atom to beginning */
  faststart: boolean;
  /** Eliminates HTML5 <video loop> repeat stutter via closed GOP, keyframe cadence, and removing boundary dupes */
  seamlessLooping: boolean;
  /** Drop last duplicate frame if identical to first frame */
  dropDuplicateEndFrame: boolean;
  /** Enforces yuv420p pixel format and BT.709 metadata for Safari/Chrome compatibility */
  forceYuv420p: boolean;
  /** Strip dummy or ambient audio streams to minimize web payload (-an) */
  stripAudio: boolean;
  /** H.264 compatibility profile (baseline for legacy mobile, main, high for modern web) */
  h264Profile: H264Profile;
}

export interface ExportSettings {
  /** Active use-case preset identifier */
  useCasePreset: UseCasePresetId;
  /** Output container is strictly MP4 (.mp4) for web playback */
  format: ContainerFormat;

  // --- Video Quality Settings ---
  codec: VideoCodec;
  scale: ResolutionScale;
  customWidth: number;
  customHeight: number;
  aspectRatioLocked: boolean;
  scalingAlgorithm: ScalingAlgorithm;
  targetFramerate: number;
  rateControlMode: RateControlMode;
  /** Constant Rate Factor (14 = near lossless, 23 = standard web, 34 = heavy compression) */
  crf: number;
  /** Target average bitrate in Mbps when rateControlMode === 'cbr' */
  targetBitrateMbps: number;
  /** Maximum peak bitrate cap in Mbps (VBV maxrate) for smooth network streaming */
  maxBitrateMbps: number;

  // --- Web Optimization Settings ---
  webOptimizations: WebOptimizationSettings;

  // --- Advanced Performance Tuning ---
  preset: EncoderPreset;
  keyframeMode: KeyframeIntervalMode;
  customKeyintFrames: number;
  /** Number of B-frames (0 = instant scroll decoding, 2-4 = higher compression efficiency) */
  bFrames: number;
  /** Psychovisual & decoder tuning */
  tune: EncoderTune;
  /** 2-pass encoding for optimal bit distribution */
  twoPass: boolean;
  /** Subtle luma sharpening to counteract 4:2:0 chroma subsampling softness */
  sharpenOutput: boolean;

  // --- Frame Range & Destination ---
  inPoint: number;
  outPoint: number;
  outputDirectory: string;
  filenameTemplate: string;
}

export interface FFmpegProgress {
  frame: number;
  fps: number;
  bitrate: string;
  totalSize: string;
  outTime: string;
  speed: string;
  progressPercent: number;
  estimatedRemainingSeconds?: number;
}

export interface RenderState {
  status: 'idle' | 'rendering' | 'completed' | 'error' | 'cancelled';
  progress: FFmpegProgress;
  outputPath?: string;
  outputSizeBytes?: number;
  errorMessage?: string;
  activeCommand?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'command';
  message: string;
}
