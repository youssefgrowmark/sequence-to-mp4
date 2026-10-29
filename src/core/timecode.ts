/**
 * Converts a frame index and framerate into a precision editorial timecode (HH:MM:SS:FF)
 */
export function formatTimecode(frameIndex: number, fps: number): string {
  const safeFps = Math.max(1, fps);
  const totalSeconds = Math.floor(frameIndex / safeFps);
  const frameRemainder = Math.floor(frameIndex % safeFps);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frameRemainder)}`;
}

/**
 * Calculates human duration string: e.g. "4.12s (100 frames @ 24fps)"
 */
export function formatDuration(totalFrames: number, fps: number): string {
  const safeFps = Math.max(1, fps);
  const seconds = (totalFrames / safeFps).toFixed(2);
  return `${seconds}s (${totalFrames} frames @ ${fps} fps)`;
}

/**
 * Formats bytes into clean human-readable string (KB, MB, GB)
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
