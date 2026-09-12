'use client';

import {useLayoutEffect, useRef, useState} from 'react';

/**
 * Scales a working surface to fit its column without introducing a nested
 * scrollbar. Used by the report viewer and the Atlas panel on /console, and
 * nowhere else.
 *
 * A ResizeObserver measures the frame and the content, and the hook returns the
 * width and transform to put on the content element. Those two values are
 * computed at runtime from real measurements, so they can only be an inline
 * style — the stylesheet supplies the rest (.fit-panel positioning and
 * transform-origin), and below 760px it overrides both back to a static layout.
 * Neither half works without the other.
 *
 * @param width Fixed content width in px. Omit to measure the frame instead.
 */
export function useFitPanel(width?: number) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({scale: 1, width: width ?? 340});

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;

    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = width || frame.clientWidth;
        content.style.width = `${w}px`;
        const scale = Math.min(1, frame.clientWidth / w, frame.clientHeight / Math.max(1, content.scrollHeight));
        setSize((old) => (Math.abs(old.scale - scale) < 0.001 && old.width === w ? old : {scale, width: w}));
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);
    measure();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [width]);

  return {
    frameRef,
    contentRef,
    contentStyle: {width: size.width, transform: `translateX(-50%) scale(${size.scale})`},
  };
}
