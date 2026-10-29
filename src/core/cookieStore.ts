import { ExportSettings } from '../../electron/types';
import { DEFAULT_EXPORT_SETTINGS } from './presetsAndGuidance';

const COOKIE_SETTINGS_KEY = 'seqmp4_export_settings_v1';
const COOKIE_UI_STATE_KEY = 'seqmp4_ui_state_v1';
const MAX_AGE_ONE_YEAR = 60 * 60 * 24 * 365;

export interface PersistedUIState {
  theme: 'light' | 'dark';
  appScreen: 'dashboard' | 'editor';
  activeProjectId: string | null;
  currentDirectory: string | null;
  selectedSequencePattern?: string | null;
  isLooping: boolean;
  inspectorTab: 'web' | 'quality' | 'performance';
  previewMode: 'original' | 'simulated' | 'split' | 'rendered-mp4';
  sourceGridFormat: '2-col' | '3-col' | '4-col' | '1-col' | 'single';
  viewMode: 'fit' | '100%';
  playbackSpeed: number;
  dashboardSection: string;
}

export const DEFAULT_UI_STATE: PersistedUIState = {
  theme: 'dark',
  appScreen: 'dashboard',
  activeProjectId: null,
  currentDirectory: null,
  selectedSequencePattern: null,
  isLooping: true,
  inspectorTab: 'quality',
  previewMode: 'simulated',
  sourceGridFormat: '2-col',
  viewMode: 'fit',
  playbackSpeed: 1,
  dashboardSection: 'recent',
};

export function setCookieRaw(name: string, value: string, maxAgeSeconds = MAX_AGE_ONE_YEAR): void {
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
        value
      )}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(name, value);
    }
  } catch {}
}

export function getCookieRaw(name: string): string | null {
  try {
    if (typeof document !== 'undefined' && document.cookie) {
      const target = `${encodeURIComponent(name)}=`;
      const parts = document.cookie.split(';');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith(target)) {
          return decodeURIComponent(trimmed.substring(target.length));
        }
      }
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(name);
    }
  } catch {}
  return null;
}

export function loadPersistedExportSettings(): ExportSettings {
  try {
    const raw = getCookieRaw(COOKIE_SETTINGS_KEY);
    if (!raw) return DEFAULT_EXPORT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_EXPORT_SETTINGS,
      ...parsed,
      format: 'mp4',
      webOptimizations: {
        ...DEFAULT_EXPORT_SETTINGS.webOptimizations,
        ...(parsed.webOptimizations || {}),
      },
    };
  } catch {
    return DEFAULT_EXPORT_SETTINGS;
  }
}

export function savePersistedExportSettings(settings: ExportSettings): void {
  try {
    setCookieRaw(COOKIE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

export function hasPersistedSession(): boolean {
  return Boolean(getCookieRaw(COOKIE_UI_STATE_KEY) || getCookieRaw(COOKIE_SETTINGS_KEY));
}

export function loadPersistedUIState(): PersistedUIState {
  try {
    const raw = getCookieRaw(COOKIE_UI_STATE_KEY);
    if (!raw) return DEFAULT_UI_STATE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_UI_STATE,
      ...parsed,
    };
  } catch {
    return DEFAULT_UI_STATE;
  }
}

export function savePersistedUIState(patch: Partial<PersistedUIState>): void {
  try {
    const current = loadPersistedUIState();
    const next = { ...current, ...patch };
    setCookieRaw(COOKIE_UI_STATE_KEY, JSON.stringify(next));
  } catch {}
}
