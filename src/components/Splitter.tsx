import React, { useRef } from 'react';

interface SplitterProps {
  /** 'x' sits between two columns and drags sideways; 'y' sits between two rows and drags up/down */
  axis: 'x' | 'y';
  /** Called once when a drag begins, so the caller can remember the size it started from */
  onDragStart: () => void;
  /** Called with the pointer's movement since the drag began, in px */
  onDrag: (delta: number) => void;
  /** Double-click: back to the default size */
  onReset?: () => void;
  title?: string;
}

/**
 * Drag handle between two resizable panes. Pointer capture keeps the drag
 * alive when the cursor outruns the handle; the body class keeps the resize
 * cursor and blocks text selection everywhere while dragging.
 */
export const Splitter: React.FC<SplitterProps> = ({ axis, onDragStart, onDrag, onReset, title }) => {
  const startRef = useRef(0);
  const bodyClass = `is-resizing-${axis}`;
  const pos = (e: React.PointerEvent) => (axis === 'x' ? e.clientX : e.clientY);

  const end = () => document.body.classList.remove(bodyClass);

  return (
    <div
      className={`splitter splitter-${axis}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      title={title}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        startRef.current = pos(e);
        document.body.classList.add(bodyClass);
        onDragStart();
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        onDrag(pos(e) - startRef.current);
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        end();
      }}
      onLostPointerCapture={end}
      onDoubleClick={onReset}
    />
  );
};
