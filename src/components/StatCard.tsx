import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

export default function StatCard({
  icon: Icon,
  label,
  value,
  delta,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  delta?: string;
}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const dur = 1000;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return (
    <motion.div
      whileHover={{ boxShadow: '0 0 0 1px rgba(34,211,238,.25), 0 0 16px rgba(34,211,238,.08)' }}
      className="relative rounded-lg border border-line bg-bg-panel-2/70 px-3 py-2.5 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-text-2">{label}</span>
        <Icon className="h-4 w-4 text-cyan/70" />
      </div>
      <div className="mt-0.5 font-num text-[28px] font-semibold leading-8 text-cyan">
        {display.toLocaleString('zh-CN')}
      </div>
      {delta && (
        <div className="absolute bottom-2 right-3 text-[11px] text-text-3">较昨日 {delta}</div>
      )}
    </motion.div>
  );
}
