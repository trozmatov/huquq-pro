import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  active: boolean;
  /** Mutable ref carrying current 0..1 audio amplitude without causing React re-renders */
  levelRef: React.MutableRefObject<number>;
  accent?: 'indigo' | 'amber';
}

/**
 * Lightweight 60 FPS canvas AudioVisualizer driven by requestAnimationFrame and a ref
 * (zero React state re-renders during live voice streaming).
 */
export function AudioVisualizer({ active, levelRef, accent = 'indigo' }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const barCount = 28;
    const smoothed = new Float32Array(barCount);
    let phase = 0;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const level = active ? Math.max(0.08, Math.min(1, levelRef.current)) : 0.04;
      phase += active ? 0.11 : 0.03;

      const gap = 4;
      const barWidth = (w - gap * (barCount - 1)) / barCount;
      const centerY = h / 2;

      for (let i = 0; i < barCount; i++) {
        const distFromCenter = Math.abs(i - (barCount - 1) / 2) / (barCount / 2);
        const envelope = 1 - distFromCenter * 0.65;
        const wave = Math.sin(phase + i * 0.45) * 0.5 + 0.5;
        const target = Math.max(0.08, level * envelope * (0.45 + wave * 0.65));
        smoothed[i] = smoothed[i] * 0.78 + target * 0.22;

        const barHeight = Math.max(4, smoothed[i] * (h - 8));
        const x = i * (barWidth + gap);
        const y = centerY - barHeight / 2;

        const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (accent === 'amber') {
          grad.addColorStop(0, '#fbbf24');
          grad.addColorStop(1, '#f59e0b');
        } else {
          grad.addColorStop(0, '#a78bfa');
          grad.addColorStop(0.5, '#6366f1');
          grad.addColorStop(1, '#fbbf24');
        }

        ctx.fillStyle = active ? grad : 'rgba(148, 163, 184, 0.28)';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 4);
        ctx.fill();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [active, levelRef, accent]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={56}
      aria-label="Ovoz to'lqini indikatori"
      className="w-full max-w-xs h-14 mx-auto block"
    />
  );
}
