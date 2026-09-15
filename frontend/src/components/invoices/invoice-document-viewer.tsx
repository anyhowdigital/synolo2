"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const A4_PX = 794; // 210mm @96dpi

/** Αποδίδει το Α4 παραστατικό σε πραγματικές διαστάσεις και το σμικρύνει ώστε να χωρά σε στενές οθόνες. */
export function InvoiceDocumentViewer({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const available = wrapRef.current?.clientWidth ?? A4_PX;
      const s = Math.min(1, available / A4_PX);
      setScale(s);
      const h = docRef.current?.offsetHeight;
      if (h) setHeight(h * s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (docRef.current) ro.observe(docRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="min-w-0 overflow-hidden" data-testid="invoice-document-viewer">
      <div style={height ? { height } : undefined} className="print:!h-auto">
        <div ref={docRef} className="print:!w-auto print:!transform-none" style={{ width: A4_PX, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
