import {
  useCallback,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { ArtifactKind } from './artifacts';
import { ARTIFACT_ICONS } from './artifacts';

export type WindowBounds = { width: number; height: number };

export default function WindowFrame({
  title,
  kind,
  x,
  y,
  w,
  h,
  z,
  minimized,
  focused,
  accent,
  bounds,
  onFocus,
  onMove,
  onResize,
  onClose,
  onMinimize,
  children,
  resizable = true,
}: {
  title: string;
  kind?: ArtifactKind | 'chat' | 'cognition';
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  focused: boolean;
  accent?: string;
  bounds: WindowBounds;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onClose?: () => void;
  onMinimize?: () => void;
  children: ReactNode;
  resizable?: boolean;
}) {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const clampX = useCallback(
    (value: number) => Math.max(0, Math.min(value, bounds.width - 64)),
    [bounds.width],
  );
  const clampY = useCallback(
    (value: number) => Math.max(0, Math.min(value, bounds.height - 36)),
    [bounds.height],
  );

  const onTitlePointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    onFocus();
    event.preventDefault();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origX: x,
      origY: y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onTitlePointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    onMove(
      clampX(drag.origX + event.clientX - drag.startX),
      clampY(drag.origY + event.clientY - drag.startY),
    );
  };

  const onTitlePointerUp = () => {
    dragRef.current = null;
  };

  const onResizePointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 || !resizable) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origW: w,
      origH: h,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onResizePointerMove = (event: ReactPointerEvent) => {
    const resize = resizeRef.current;
    if (!resize) return;
    const minWidth = 220;
    const minHeight = 140;
    const nextW = Math.min(
      bounds.width,
      Math.max(minWidth, resize.origW + event.clientX - resize.startX),
    );
    const nextH = Math.min(
      bounds.height,
      Math.max(minHeight, resize.origH + event.clientY - resize.startY),
    );
    onResize(Math.round(nextW), Math.round(nextH));
  };

  const onResizePointerUp = () => {
    resizeRef.current = null;
  };
  const icon =
    kind === 'chat'
      ? '💬'
      : kind === 'cognition'
        ? '🧠'
        : kind
          ? ARTIFACT_ICONS[kind]
          : null;
  const safeX = clampX(x);
  const safeY = clampY(y);

  return (
    <div
      ref={frameRef}
      className={`desktop-window ${focused ? 'window-focused' : ''} ${minimized ? 'window-minimized' : ''}`}
      style={
        minimized
          ? { zIndex: z }
          : ({
              zIndex: z,
              left: safeX,
              top: safeY,
              width: w,
              height: h,
              '--window-accent': accent ?? 'var(--indigo)',
            } as CSSProperties)
      }
      onPointerDownCapture={onFocus}
    >
      {minimized ? null : (
        <>
          <div
            className="window-titlebar"
            onPointerDown={onTitlePointerDown}
            onPointerMove={onTitlePointerMove}
            onPointerUp={onTitlePointerUp}
            title="Drag to move"
          >
            {icon ? <span className="window-icon">{icon}</span> : null}
            <strong className="window-title">{title}</strong>
            <span className="window-actions">
              {onMinimize ? (
                <button
                  type="button"
                  className="window-action"
                  aria-label="Minimize"
                  title="Minimize"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={onMinimize}
                >
                  –
                </button>
              ) : null}
              {onClose ? (
                <button
                  type="button"
                  className="window-action window-action-close"
                  aria-label="Close"
                  title="Close"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={onClose}
                >
                  ✕
                </button>
              ) : null}
            </span>
          </div>
          <div className="window-body">{children}</div>
          {resizable ? (
            <span
              className="window-resize"
              aria-hidden="true"
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
