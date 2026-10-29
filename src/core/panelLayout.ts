import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Resizable editor & dashboard layout:
 * - left: Left Panel width (--left-w)
 * - right: Right Panel width (--right-w)
 * - timeline: Central Viewport Timeline/Transport section height (--timeline-h)
 * - term: Terminal drawer height (--term-h)
 * - dashSidebar: Dashboard left sidebar width (--dash-sidebar-w)
 *
 * Sizes are applied as CSS variables and persisted in localStorage.
 */

export interface PanelSizes {
  left: number;
  right: number;
  timeline: number;
  term: number;
  dashSidebar: number;
}

export type PanelKey = keyof PanelSizes;

export const DEFAULT_PANEL_SIZES: PanelSizes = {
  left: 310,
  right: 410,
  timeline: 94,
  term: 240,
  dashSidebar: 240,
};

const STORAGE_KEY = 'seq2mp4.panelSizes.v2';
/** The preview always keeps at least this much width, and the editor this much height above the drawer */
const MIN_CENTER = 280;
const MIN_ABOVE_TERM = 240;

function clampSizes(s: PanelSizes): PanelSizes {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;

  const right = Math.round(
    Math.min(Math.max(s.right, 250), Math.max(250, Math.min(720, vw - MIN_CENTER - 190)))
  );
  const left = Math.round(
    Math.min(Math.max(s.left, 190), Math.max(190, Math.min(640, vw - MIN_CENTER - right)))
  );
  const timeline = Math.round(
    Math.min(Math.max(s.timeline, 76), Math.max(76, Math.min(300, Math.floor(vh * 0.42))))
  );
  const term = Math.round(
    Math.min(Math.max(s.term, 90), Math.max(90, vh - MIN_ABOVE_TERM))
  );
  const dashSidebar = Math.round(
    Math.min(Math.max(s.dashSidebar, 170), Math.max(170, Math.min(450, Math.floor(vw * 0.4))))
  );

  return { left, right, timeline, term, dashSidebar };
}

function loadSizes(): PanelSizes {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return clampSizes({ ...DEFAULT_PANEL_SIZES, ...saved });
    }
  } catch {
    // unreadable or blocked storage: use defaults
  }
  return clampSizes(DEFAULT_PANEL_SIZES);
}

/** Which way a pointer movement grows each pane:
 *  left & dashSidebar grow as pointer moves right (+1);
 *  right, timeline & term grow as pointer moves left/up (-1).
 */
const GROWS_WITH: Record<PanelKey, 1 | -1> = {
  left: 1,
  right: -1,
  timeline: -1,
  term: -1,
  dashSidebar: 1,
};

export function usePanelLayout() {
  const [sizes, setSizes] = useState<PanelSizes>(loadSizes);
  const sizesRef = useRef<PanelSizes>(sizes);
  sizesRef.current = sizes;
  const dragStart = useRef<PanelSizes>(sizes);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
    } catch {
      // storage blocked: sizes just won't be remembered
    }
  }, [sizes]);

  // A smaller window squeezes the panels back into range
  useEffect(() => {
    const onResize = () => setSizes((s) => clampSizes(s));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const splitterProps = useCallback(
    (key: PanelKey) => ({
      onDragStart: () => {
        dragStart.current = sizesRef.current;
      },
      onDrag: (delta: number) => {
        const base = dragStart.current;
        setSizes(clampSizes({ ...base, [key]: base[key] + GROWS_WITH[key] * delta }));
      },
      onReset: () =>
        setSizes((s) => clampSizes({ ...s, [key]: DEFAULT_PANEL_SIZES[key] })),
    }),
    []
  );

  const style = {
    '--left-w': `${sizes.left}px`,
    '--right-w': `${sizes.right}px`,
    '--timeline-h': `${sizes.timeline}px`,
    '--term-h': `${sizes.term}px`,
    '--dash-sidebar-w': `${sizes.dashSidebar}px`,
  } as React.CSSProperties;

  return { sizes, style, splitterProps };
}
