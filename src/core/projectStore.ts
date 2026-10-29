import { ExportSettings, SequenceItem } from '../../electron/types';
import { DEFAULT_EXPORT_SETTINGS } from './presetsAndGuidance';

export interface ProjectFolder {
  id: string;
  name: string;
  color: string;
  parentId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectItem {
  id: string;
  name: string;
  folderId: string | null;
  status: 'draft' | 'exported';
  isDeleted: boolean;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  templateId?: string;
  templatePoint?: string;
  accentColor: string;
  /** Local image path for the rounded small image preview beside the title */
  thumbnailPath?: string;
  sequenceDirectory?: string;
  sequencePattern?: string;
  totalFrames?: number;
  width?: number;
  height?: number;
  exportedFilePath?: string;
  exportedSizeBytes?: number;
  selectedSequence?: SequenceItem;
  detectedSequences?: SequenceItem[];
  settings: ExportSettings;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  category: string;
  /** The specific optimization goal / point this template is built for */
  specificPoint: string;
  technicalSummary: string;
  accentColor: string;
  gradient: string;
  settings: ExportSettings;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'tpl-hero-centerpiece',
    name: 'Website Hero Centerpiece',
    category: 'Web Hero',
    specificPoint:
      'Instant above-the-fold playback (<150ms start) with crisp brand fidelity and a 6 Mbps network ceiling.',
    technicalSummary: '100% Scale • 30fps • CRF 20 • 6 Mbps Cap • 1s GOP • Faststart',
    accentColor: '#0071E3',
    gradient: '#0071E3',
    settings: {
      ...DEFAULT_EXPORT_SETTINGS,
      useCasePreset: 'hero-animation',
      codec: 'libx264',
      scale: '100',
      targetFramerate: 30,
      rateControlMode: 'crf-constrained',
      crf: 20,
      maxBitrateMbps: 6.0,
      preset: 'slow',
      keyframeMode: '1s',
      bFrames: 2,
      tune: 'none',
    },
  },
  {
    id: 'tpl-scroll-scrubbing',
    name: 'GSAP / JS Scroll-Driven Sequence',
    category: 'Scroll Scrubbing',
    specificPoint:
      'Zero-latency 60fps bidirectional scroll scrubbing (video.currentTime) via 4-frame GOP and 0 B-frames.',
    technicalSummary: '100% Scale • 30fps • 4-Frame GOP • 0 B-Frames • Fastdecode',
    accentColor: '#0071E3',
    gradient: '#1C1C1E',
    settings: {
      ...DEFAULT_EXPORT_SETTINGS,
      useCasePreset: 'scroll-driven',
      codec: 'libx264',
      scale: '100',
      targetFramerate: 30,
      rateControlMode: 'crf-constrained',
      crf: 21,
      maxBitrateMbps: 8.0,
      preset: 'fast',
      keyframeMode: 'ultra-short',
      customKeyintFrames: 4,
      bFrames: 0,
      tune: 'fastdecode',
    },
  },
  {
    id: 'tpl-all-intra-scrub',
    name: 'All-Intra Frame-Exact Scrubber',
    category: 'Scroll Scrubbing',
    specificPoint:
      'Every single frame is a self-contained keyframe (-g 1) for instant random-access pointer dragging.',
    technicalSummary: '1080p • 30fps • 1-Frame All-Intra GOP • 0 B-Frames • Fastdecode',
    accentColor: '#0071E3',
    gradient: '#1C1C1E',
    settings: {
      ...DEFAULT_EXPORT_SETTINGS,
      useCasePreset: 'scroll-driven',
      codec: 'libx264',
      scale: '1080p',
      targetFramerate: 30,
      rateControlMode: 'crf-constrained',
      crf: 22,
      maxBitrateMbps: 10.0,
      preset: 'veryfast',
      keyframeMode: 'every-frame',
      customKeyintFrames: 1,
      bFrames: 0,
      tune: 'fastdecode',
    },
  },
  {
    id: 'tpl-ambient-background',
    name: 'Seamless Ambient Background Loop',
    category: 'Background Loop',
    specificPoint:
      'Ultra-lightweight full-bleed background loop behind text/UI overlays with stutter-free <video loop> repeat.',
    technicalSummary: '75% Scale • 24fps • CRF 26 • 2.5 Mbps Cap • 2s Closed GOP',
    accentColor: '#0071E3',
    gradient: '#1C1C1E',
    settings: {
      ...DEFAULT_EXPORT_SETTINGS,
      useCasePreset: 'background-video',
      codec: 'libx264',
      scale: '75',
      targetFramerate: 24,
      rateControlMode: 'crf-constrained',
      crf: 26,
      maxBitrateMbps: 2.5,
      preset: 'slow',
      keyframeMode: '2s',
      bFrames: 3,
      sharpenOutput: true,
    },
  },
  {
    id: 'tpl-studio-showcase',
    name: '3D Product & Studio Presentation',
    category: 'High Fidelity',
    specificPoint:
      'Near-lossless encoding preserving dark 3D lighting gradients, metallic reflections, and fine textures.',
    technicalSummary: '100% Scale • 60fps • CRF 17 • 12 Mbps Cap • 2-Pass • Film Tune',
    accentColor: '#0071E3',
    gradient: '#1C1C1E',
    settings: {
      ...DEFAULT_EXPORT_SETTINGS,
      useCasePreset: 'visual-presentation',
      codec: 'libx264',
      scale: '100',
      targetFramerate: 60,
      rateControlMode: 'crf-constrained',
      crf: 17,
      maxBitrateMbps: 12.0,
      preset: 'slower',
      keyframeMode: '1s',
      bFrames: 2,
      tune: 'film',
      twoPass: true,
    },
  },
  {
    id: 'tpl-ui-motion-graphics',
    name: 'UI & Vector Motion Capture',
    category: 'Mobile & UI',
    specificPoint:
      'Keeps UI text, icons, and flat vector edges razor-sharp using Animation tune and luma micro-sharpening.',
    technicalSummary: '100% Scale • 60fps • CRF 19 • Animation Tune • Luma Sharpen',
    accentColor: '#0071E3',
    gradient: '#1C1C1E',
    settings: {
      ...DEFAULT_EXPORT_SETTINGS,
      useCasePreset: 'hero-animation',
      codec: 'libx264',
      scale: '100',
      targetFramerate: 60,
      rateControlMode: 'crf-constrained',
      crf: 19,
      maxBitrateMbps: 7.0,
      preset: 'slow',
      keyframeMode: '1s',
      bFrames: 2,
      tune: 'animation',
      sharpenOutput: true,
    },
  },
  {
    id: 'tpl-mobile-cellular',
    name: 'Mobile 4G Cellular Saver',
    category: 'Mobile & UI',
    specificPoint:
      'Maximum battery efficiency and instant mobile decoding using 720p H.264 Baseline capped at 1.5 Mbps.',
    technicalSummary: '720p Scale • 24fps • CRF 25 • 1.5 Mbps Cap • Baseline Profile',
    accentColor: '#0071E3',
    gradient: '#1C1C1E',
    settings: {
      ...DEFAULT_EXPORT_SETTINGS,
      useCasePreset: 'background-video',
      codec: 'libx264',
      scale: '720p',
      targetFramerate: 24,
      rateControlMode: 'crf-constrained',
      crf: 25,
      maxBitrateMbps: 1.5,
      preset: 'slow',
      keyframeMode: '2s',
      bFrames: 0,
      tune: 'fastdecode',
      webOptimizations: {
        ...DEFAULT_EXPORT_SETTINGS.webOptimizations,
        h264Profile: 'baseline',
      },
    },
  },
  {
    id: 'tpl-safari-hevc',
    name: 'Apple / Safari High-Density HEVC',
    category: 'High Fidelity',
    specificPoint:
      '35% smaller MP4 file size at equal visual fidelity using hvc1-tagged H.265 for Safari, iOS, and modern GPUs.',
    technicalSummary: '100% Scale • 30fps • H.265 (hvc1) • CRF 22 • 5 Mbps Cap',
    accentColor: '#0071E3',
    gradient: '#1C1C1E',
    settings: {
      ...DEFAULT_EXPORT_SETTINGS,
      useCasePreset: 'hero-animation',
      codec: 'libx265',
      scale: '100',
      targetFramerate: 30,
      rateControlMode: 'crf-constrained',
      crf: 22,
      maxBitrateMbps: 5.0,
      preset: 'medium',
      keyframeMode: '1s',
      bFrames: 2,
    },
  },
];

const PROJECTS_STORAGE_KEY = 'seq2mp4_projects_v2';
const FOLDERS_STORAGE_KEY = 'seq2mp4_folders_v2';

/**
 * Formats a timestamp into clean relative strings like "4 minutes ago", "2 hours ago", "1 year ago"
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

export function loadStoredFolders(): ProjectFolder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  return [];
}

export function saveStoredFolders(folders: ProjectFolder[]): void {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  } catch {}
}

function sanitizeProjectBlobUrls(p: ProjectItem): ProjectItem {
  const hasBlobPaths = p.selectedSequence?.filePaths?.some((fp) => fp.startsWith('blob:'));
  if (hasBlobPaths) {
    return {
      ...p,
      thumbnailPath: undefined,
      selectedSequence: p.selectedSequence
        ? {
            ...p.selectedSequence,
            filePaths: [],
            sampleFilePath: '',
          }
        : undefined,
      detectedSequences: (p.detectedSequences || []).map((seq) => ({
        ...seq,
        filePaths: seq.filePaths?.some((fp) => fp.startsWith('blob:')) ? [] : seq.filePaths,
        sampleFilePath: seq.sampleFilePath?.startsWith('blob:') ? '' : seq.sampleFilePath,
      })),
    };
  }
  return p;
}

export function loadStoredProjects(): ProjectItem[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(sanitizeProjectBlobUrls);
      }
    }
  } catch {}

  return [];
}

export function saveStoredProjects(projects: ProjectItem[]): void {
  try {
    const sanitized = projects.map(sanitizeProjectBlobUrls);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {}
}
