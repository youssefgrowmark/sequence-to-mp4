import { SequenceItem } from '../../electron/types';

export interface FileEntry {
  name: string;
  path: string;
  size?: number;
}

interface ParsedFile {
  original: FileEntry;
  prefix: string;
  index: number;
  padding: number;
  suffix: string;
  extension: string;
  patternKey: string;
}

const SUPPORTED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
]);

/**
 * Robust regex to parse numbered image sequences.
 * Matches:
 *  - zero-padded: frame_0001.png, shot.0042.jpg, seq001.webp
 *  - unpadded: img1.png, test_2.jpg, frame9.webp
 *  - hyphenated/underscored: clip-001.png, asset-v2-005.jpg, 0001.png
 */
/**
 * Robust regex to parse numbered image sequences.
 * Always extracts the LAST numeric run before the file extension so filenames
 * with version/resolution numbers (e.g., hero_v2_1080p_0001.png) group by frame number.
 */
const SEQUENCE_REGEX = /^(.*[^\d]|^)(\d+)([^\d]*?)(\.[a-zA-Z0-9]+)$/;

export function parseFileName(file: FileEntry): ParsedFile | null {
  const match = file.name.match(SEQUENCE_REGEX);
  if (!match) return null;

  const [, rawPrefix, numStr, suffix, ext] = match;
  const extension = ext.toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return null;
  }

  const index = parseInt(numStr, 10);
  if (isNaN(index)) return null;

  const padding = numStr.length;
  // Group key unites frames sharing identical prefix, suffix, and extension (supporting both padded & unpadded)
  const patternKey = `${rawPrefix}##${suffix}${extension}`;

  return {
    original: file,
    prefix: rawPrefix,
    index,
    padding,
    suffix,
    extension,
    patternKey,
  };
}

/**
 * Finds missing indices in a sequence of integers
 */
export function findMissingIndices(indices: number[]): number[] {
  if (indices.length <= 1) return [];

  const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const present = new Set(sorted);
  const missing: number[] = [];

  for (let i = min; i <= max; i++) {
    if (!present.has(i)) {
      missing.push(i);
    }
  }

  return missing;
}

/**
 * Formats a list of missing numbers into human-readable ranges
 * e.g. [3, 4, 5, 8, 12] -> "3-5, 8, 12"
 */
export function formatMissingRanges(missing: number[]): string {
  if (missing.length === 0) return '0 missing (Continuous)';

  const ranges: string[] = [];
  let start = missing[0];
  let end = missing[0];

  for (let i = 1; i < missing.length; i++) {
    if (missing[i] === end + 1) {
      end = missing[i];
    } else {
      ranges.push(start === end ? `#${start}` : `#${start}–${end}`);
      start = missing[i];
      end = missing[i];
    }
  }
  ranges.push(start === end ? `#${start}` : `#${start}–${end}`);

  return `${missing.length} missing: ${ranges.slice(0, 5).join(', ')}${
    ranges.length > 5 ? ` (+${ranges.length - 5} more)` : ''
  }`;
}

/**
 * Detects all distinct image sequences from a list of files in a directory
 */
export function detectImageSequences(files: FileEntry[], directoryPath: string): SequenceItem[] {
  const groups = new Map<string, ParsedFile[]>();

  for (const file of files) {
    const parsed = parseFileName(file);
    if (!parsed) continue;

    if (!groups.has(parsed.patternKey)) {
      groups.set(parsed.patternKey, []);
    }
    groups.get(parsed.patternKey)!.push(parsed);
  }

  const sequences: SequenceItem[] = [];

  for (const [patternKey, parsedFiles] of groups.entries()) {
    // Sort files ascending by index
    parsedFiles.sort((a, b) => a.index - b.index);

    const indices = parsedFiles.map((p) => p.index);
    const missing = findMissingIndices(indices);
    const first = parsedFiles[0];
    const last = parsedFiles[parsedFiles.length - 1];

    let totalBytes = 0;
    const filePaths: string[] = [];
    const fileNames: string[] = [];
    for (const p of parsedFiles) {
      if (p.original.size) totalBytes += p.original.size;
      filePaths.push(p.original.path);
      fileNames.push(p.original.name);
    }

    // Create a clean display name and human-readable pattern
    const cleanPrefix = first.prefix.replace(/[-_.]+$/, '') || 'sequence';
    const name = `${cleanPrefix} (${first.extension.toUpperCase()})`;
    const isZeroPadded =
      parsedFiles.every((p) => p.padding === first.padding) && first.padding > 1;
    const displayPattern = isZeroPadded
      ? `${first.prefix}%0${first.padding}d${first.suffix}${first.extension}`
      : `${first.prefix}%d${first.suffix}${first.extension}`;

    sequences.push({
      id: `${directoryPath}:${patternKey}`,
      name,
      pattern: displayPattern,
      prefix: first.prefix,
      suffix: first.suffix,
      padding: isZeroPadded ? first.padding : 1,
      extension: first.extension,
      firstFrameIndex: first.index,
      lastFrameIndex: last.index,
      totalFrames: parsedFiles.length,
      missingIndices: missing,
      directory: directoryPath,
      sampleFilePath: first.original.path,
      filePaths,
      fileNames,
      totalSizeApproxBytes: totalBytes,
    });
  }

  // Sort sequences by frame count descending (largest sequence first)
  sequences.sort((a, b) => b.totalFrames - a.totalFrames);

  return sequences;
}
