import { useCallback, useRef, useState } from 'react';

interface LongPressOptions {
  threshold?: number;
  onLongPress?: (e: any) => void;
  onClick?: (e: any) => void;
  moveTolerance?: number;
}

export const useLongPress = ({
  threshold = 500,
  onLongPress,
  onClick,
  moveTolerance = 12,
}: LongPressOptions = {}) => {
  const [longPressTriggered, setLongPressTriggered] = useState(false);
  const timeoutRef = useRef<any>(null);
  const touchStartPos = useRef<{ x: number, y: number } | null>(null);
  const movedRef = useRef(false);
  const longPressTriggeredRef = useRef(false);
  const lastTouchTimeRef = useRef(0);

  const getPoint = (event: any) => {
    const point = event.touches?.[0] || event.changedTouches?.[0] || event;
    return {
      x: point?.clientX ?? 0,
      y: point?.clientY ?? 0,
    };
  };

  const cancelTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const start = useCallback(
    (event: any) => {
      // Touch devices fire synthetic mouse events after touch events. Ignore those
      // so one finger gesture cannot become two clicks.
      if (event.type?.startsWith('mouse') && Date.now() - lastTouchTimeRef.current < 700) {
        return;
      }

      const point = getPoint(event);
      touchStartPos.current = point;
      movedRef.current = false;
      longPressTriggeredRef.current = false;
      setLongPressTriggered(false);

      cancelTimer();
      timeoutRef.current = setTimeout(() => {
        if (movedRef.current) return;
        onLongPress?.(event);
        longPressTriggeredRef.current = true;
        setLongPressTriggered(true);
      }, threshold);
    },
    [cancelTimer, onLongPress, threshold]
  );

  const move = useCallback(
    (event: any) => {
      if (!touchStartPos.current) return;

      const point = getPoint(event);
      const deltaX = Math.abs(point.x - touchStartPos.current.x);
      const deltaY = Math.abs(point.y - touchStartPos.current.y);

      // If user moves, treat it as scrolling/dragging, not a tap.
      if (deltaX > moveTolerance || deltaY > moveTolerance) {
        movedRef.current = true;
        cancelTimer();
      }
    },
    [cancelTimer, moveTolerance]
  );

  const clear = useCallback(
    (event: any, shouldTriggerClick = true) => {
      if (event.type?.startsWith('mouse') && Date.now() - lastTouchTimeRef.current < 700) {
        return;
      }

      if (event.type?.startsWith('touch')) {
        lastTouchTimeRef.current = Date.now();
      }

      cancelTimer();

      const shouldClick = shouldTriggerClick && !movedRef.current && !longPressTriggeredRef.current && !longPressTriggered;
      if (shouldClick) {
        onClick?.(event);
      }

      setLongPressTriggered(false);
      longPressTriggeredRef.current = false;
      movedRef.current = false;
      touchStartPos.current = null;
    },
    [cancelTimer, longPressTriggered, onClick]
  );

  return {
    onMouseDown: (e: any) => start(e),
    onMouseMove: (e: any) => move(e),
    onMouseUp: (e: any) => clear(e),
    onMouseLeave: (e: any) => clear(e, false),
    onTouchStart: (e: any) => start(e),
    onTouchMove: (e: any) => move(e),
    onTouchCancel: (e: any) => clear(e, false),
    onTouchEnd: (e: any) => clear(e),
  };
};
