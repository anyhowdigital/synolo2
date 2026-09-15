"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/invoice/totals";

type Point = { label: string; inflow: number; outflow: number; running: number };

export function CashflowChart({ data, startingCash }: { data: Point[]; startingCash: number }) {
  const { max, min, path, points } = useMemo(() => {
    const values = [startingCash, ...data.map((d) => d.running)];
    const max = Math.max(...values);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const W = 600, H = 200, padY = 20, padX = 20;
    const stepX = (W - padX * 2) / Math.max(1, data.length);
    const pts = data.map((d, i) => {
      const x = padX + i * stepX + stepX / 2;
      const y = H - padY - ((d.running - min) / range) * (H - padY * 2);
      return { x, y, d };
    });
    const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    return { max, min, path, points: pts, W, H };
  }, [data, startingCash]);

  const W = 600, H = 220;
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[720px]">
        <defs>
          <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(37 99 235)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(37 99 235)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Zero line */}
        {min < 0 ? (
          <line x1="20" x2={W - 20} y1={H - 20 - ((0 - min) / (max - min || 1)) * (H - 40)} y2={H - 20 - ((0 - min) / (max - min || 1)) * (H - 40)} stroke="rgb(239 68 68 / 0.4)" strokeDasharray="4 4" />
        ) : null}
        {/* Area fill */}
        {points.length > 0 ? (
          <path d={`${path} L ${points[points.length - 1]!.x} ${H - 20} L ${points[0]!.x} ${H - 20} Z`} fill="url(#cashGrad)" />
        ) : null}
        {/* Line */}
        <path d={path} fill="none" stroke="rgb(37 99 235)" strokeWidth="2" strokeLinejoin="round" />
        {/* Points + tooltips */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill={p.d.running < 0 ? "rgb(239 68 68)" : "rgb(37 99 235)"} />
            <title>{`${p.d.label}: ${formatMoney(p.d.running)}`}</title>
          </g>
        ))}
        {/* X-labels */}
        {points.filter((_, i) => i % 2 === 0).map((p, i) => (
          <text key={i} x={p.x} y={H - 4} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.5">{p.d.label}</text>
        ))}
      </svg>
    </div>
  );
}
