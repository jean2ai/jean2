import { useState, useEffect } from 'react';

interface VisualViewportState {
  height: number;
  offsetTop: number;
  scale: number;
}

export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(() => ({
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
    offsetTop: 0,
    scale: 1,
  }));

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => {
      setState({
        height: viewport.height,
        offsetTop: viewport.offsetTop,
        scale: viewport.scale,
      });
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);

    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);

  return state;
}
