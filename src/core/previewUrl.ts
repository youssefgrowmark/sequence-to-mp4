export function resolveMediaUrl(
  filePath: string | null | undefined,
  cacheBust?: number
): string | null {
  if (!filePath) return null;

  if (
    filePath.startsWith('blob:') ||
    filePath.startsWith('data:') ||
    filePath.startsWith('http://') ||
    filePath.startsWith('https://')
  ) {
    return filePath;
  }

  const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);
  const base = isElectron
    ? `media://preview?path=${encodeURIComponent(filePath)}`
    : `/api/media?path=${encodeURIComponent(filePath)}`;

  return cacheBust ? `${base}&t=${cacheBust}` : base;
}
