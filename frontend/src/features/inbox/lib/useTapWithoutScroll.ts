import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const TAP_MOVE_THRESHOLD_PX = 12;

export function useTapWithoutScroll(onTap: () => void) {
  const gestureRef = useRef({ x: 0, y: 0, moved: false });

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    gestureRef.current = { x: event.clientX, y: event.clientY, moved: false };
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent) => {
    if (gestureRef.current.moved) {
      return;
    }
    const dx = Math.abs(event.clientX - gestureRef.current.x);
    const dy = Math.abs(event.clientY - gestureRef.current.y);
    if (dx > TAP_MOVE_THRESHOLD_PX || dy > TAP_MOVE_THRESHOLD_PX) {
      gestureRef.current.moved = true;
    }
  }, []);

  const onPointerUp = useCallback(() => {
    if (!gestureRef.current.moved) {
      onTap();
    }
  }, [onTap]);

  const onPointerCancel = useCallback(() => {
    gestureRef.current.moved = true;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
