import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

/** Gap between the trigger and the menu, and the margin kept from container/window edges. */
const MENU_GAP = 5;
const VIEWPORT_MARGIN = 8;

export interface AppleDropdownOption<T extends string = string> {
  value: T;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: React.ReactNode;
  dividerBefore?: boolean;
  groupHeader?: string;
}

interface AppleDropdownProps<T extends string = string> {
  value: T;
  options: AppleDropdownOption<T>[];
  onChange: (value: T) => void;
  prefixLabel?: string;
  align?: 'left' | 'right';
  direction?: 'down' | 'up';
  minWidth?: number | string;
  menuWidth?: number | string;
  compact?: boolean;
  monoTrigger?: boolean;
  title?: string;
  disabled?: boolean;
}

export function AppleDropdown<T extends string = string>({
  value,
  options,
  onChange,
  prefixLabel,
  align = 'right',
  direction = 'down',
  minWidth,
  menuWidth = 220,
  compact = false,
  monoTrigger = false,
  title,
  disabled = false,
}: AppleDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<React.CSSProperties | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  // Portalled to <body> with fixed positioning so no overflow:hidden container can clip it.
  // Also clamps within the containing workspace section (.central-viewport, .side-panel, etc.)
  // so a dropdown near the left/right edge of a section never overflows across section borders.
  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }

    const place = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const r = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = menu.getBoundingClientRect();
      const targetW =
        menuWidth === '100%'
          ? Math.max(140, Math.round(r.width))
          : typeof menuWidth === 'number'
          ? menuWidth
          : Math.max(menu.offsetWidth, Math.ceil(rect.width), Math.round(r.width), 160);
      const w = Math.min(targetW, vw - VIEWPORT_MARGIN * 2);
      const h = Math.max(menu.scrollHeight, Math.ceil(rect.height), 80);

      // Keep menu inside its parent workspace section when possible
      const sectionEl = trigger.closest(
        '.central-viewport, .side-panel, .dashboard-main'
      ) as HTMLElement | null;
      const sectionRect = sectionEl ? sectionEl.getBoundingClientRect() : null;

      const minLeft =
        sectionRect && sectionRect.width >= w + VIEWPORT_MARGIN * 2
          ? Math.max(VIEWPORT_MARGIN, sectionRect.left + VIEWPORT_MARGIN)
          : VIEWPORT_MARGIN;
      const maxLeft =
        sectionRect && sectionRect.width >= w + VIEWPORT_MARGIN * 2
          ? Math.min(vw - VIEWPORT_MARGIN - w, sectionRect.right - VIEWPORT_MARGIN - w)
          : vw - VIEWPORT_MARGIN - w;

      let left: number;
      if (align === 'right') {
        const rightAligned = r.right - w;
        // If right-aligning pushes the menu past the left boundary of the section, align left instead
        left = rightAligned < minLeft ? r.left : rightAligned;
      } else {
        const leftAligned = r.left;
        // If left-aligning pushes the menu past the right boundary of the section, align right instead
        left = leftAligned > maxLeft ? r.right - w : leftAligned;
      }

      left = Math.max(minLeft, Math.min(left, Math.max(minLeft, maxLeft)));

      const below = vh - r.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const above = r.top - MENU_GAP - VIEWPORT_MARGIN;
      const wantsUp = direction === 'up';
      const goUp = (wantsUp ? above : below) >= h ? wantsUp : above > below;

      setMenuPos({
        width: w,
        left: Math.round(left),
        top: goUp ? undefined : Math.round(r.bottom + MENU_GAP),
        bottom: goUp ? Math.round(vh - r.top + MENU_GAP) : undefined,
        maxHeight: Math.max(140, Math.floor(goUp ? above : below)),
        visibility: 'visible',
      });
    };

    place();
    const rafId = requestAnimationFrame(place);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && menuRef.current) {
      ro = new ResizeObserver(place);
      ro.observe(menuRef.current);
    }

    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, direction, menuWidth, options.length]);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className={`apple-dropdown ${open ? 'is-open' : ''}`}
      style={{ minWidth }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={`apple-dropdown-trigger ${compact ? 'is-compact' : ''} ${
          monoTrigger ? 'font-mono' : ''
        } ${disabled ? 'is-disabled' : ''}`}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
      >
        <span className="apple-dropdown-trigger-content">
          {selectedOption?.icon && (
            <span className="apple-dropdown-trigger-icon">{selectedOption.icon}</span>
          )}
          {prefixLabel && (
            <span className="apple-dropdown-trigger-prefix">{prefixLabel}</span>
          )}
          <span className="apple-dropdown-trigger-label">{selectedOption?.label}</span>
          {selectedOption?.badge && (
            <span className="apple-dropdown-trigger-badge font-mono">
              {selectedOption.badge}
            </span>
          )}
        </span>
        <ChevronDown
          size={12}
          className={`apple-dropdown-chevron ${open ? 'is-open' : ''}`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={`apple-dropdown-menu align-${align} dir-${direction}`}
            style={{
              width: typeof menuWidth === 'number' ? menuWidth : 220,
              ...(menuPos ?? { left: 0, top: 0, visibility: 'hidden' as const }),
            }}
            role="listbox"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <React.Fragment key={opt.value}>
                  {opt.dividerBefore && <div className="apple-dropdown-divider" />}
                  {opt.groupHeader && (
                    <div className="apple-dropdown-group-header">{opt.groupHeader}</div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`apple-dropdown-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <div className="apple-dropdown-item-left">
                      {opt.icon && (
                        <span className="apple-dropdown-item-icon">{opt.icon}</span>
                      )}
                      <div className="apple-dropdown-item-text">
                        <span className="apple-dropdown-item-label">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="apple-dropdown-item-sublabel">
                            {opt.sublabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="apple-dropdown-item-right">
                      {opt.badge && (
                        <span className="apple-dropdown-item-badge font-mono">
                          {opt.badge}
                        </span>
                      )}
                      <span className="apple-dropdown-item-check">
                        {isSelected && <Check size={12} strokeWidth={2.3} />}
                      </span>
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
