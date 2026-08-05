import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

interface ToastItem { id: number; message: string }
let seq = 0;
const listeners = new Set<(t: ToastItem) => void>();

export function showToast(message: string) {
  seq += 1;
  const item = { id: seq, message };
  listeners.forEach((fn) => fn(item));
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => {
    const onPush = (t: ToastItem) => {
      setToasts((prev) => [...prev, t]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 2500);
    };
    listeners.add(onPush);
    return () => { listeners.delete(onPush); };
  }, []);
  return (
    <div className="pointer-events-none fixed right-4 top-[68px] z-[90] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto flex items-center gap-2 rounded-md border border-line bg-bg-panel-2/95 px-3 py-2 text-[13px] text-text-1 shadow-lg backdrop-blur"
          >
            <CheckCircle2 className="h-4 w-4 text-cyan" />
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
