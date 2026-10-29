import React, { useState, useRef, useEffect } from 'react';

const SECTION_STORAGE_KEY = 'seq2mp4.sectionHeights.v1';

function loadSectionHeights(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SECTION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

function saveSectionHeight(id: string, height: number | null) {
  try {
    const current = loadSectionHeights();
    if (height === null) {
      delete current[id];
    } else {
      current[id] = Math.round(height);
    }
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

interface ResizableSectionProps {
  id: string;
  className?: string;
  style?: React.CSSProperties;
  minHeight?: number;
  maxHeight?: number;
  hideSplitter?: boolean;
  children: React.ReactNode;
}

export const ResizableSection: React.FC<ResizableSectionProps> = ({
  id,
  className = 'panel-section',
  style,
  minHeight = 68,
  maxHeight = 900,
  hideSplitter = false,
  children,
}) => {
  const [height, setHeight] = useState<number | null>(() => {
    const stored = loadSectionHeights()[id];
    return typeof stored === 'number' && stored >= minHeight ? stored : null;
  });

  const sectionRef = useRef<HTMLElement>(null);
  const startYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(0);

  useEffect(() => {
    saveSectionHeight(id, height);
  }, [id, height]);

  return (
    <section
      ref={sectionRef}
      className={`${className} resizable-panel-section ${height !== null ? 'has-custom-height' : ''}`}
      style={{
        ...style,
        ...(height !== null
          ? {
              height: `${height}px`,
              flex: '0 0 auto',
              overflowY: 'auto',
            }
          : {}),
      }}
    >
      {children}
      {!hideSplitter && (
        <div
          className="section-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          title="Drag to resize section height · double-click to reset"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            startYRef.current = e.clientY;
            startHeightRef.current =
              sectionRef.current?.getBoundingClientRect().height || minHeight;
            document.body.classList.add('is-resizing-y');
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const deltaY = e.clientY - startYRef.current;
            const nextH = Math.max(
              minHeight,
              Math.min(maxHeight, Math.round(startHeightRef.current + deltaY))
            );
            setHeight(nextH);
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
            document.body.classList.remove('is-resizing-y');
          }}
          onLostPointerCapture={() => {
            document.body.classList.remove('is-resizing-y');
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setHeight(null);
          }}
        />
      )}
    </section>
  );
};
