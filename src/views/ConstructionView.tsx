import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

export default function ConstructionView({
  moduleName,
  onBack,
}: {
  moduleName: string;
  onBack: () => void;
}) {
  return (
    <div className="scene-grid flex h-full w-full items-center justify-center bg-bg-grid">
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="flex w-[420px] flex-col items-center rounded-xl border border-line bg-bg-panel/90 p-8 text-center backdrop-blur-[8px]"
      >
        <div className="relative">
          <img src="/building-wireframe.svg" alt="" className="h-[160px] w-[256px]" />
          <span className="absolute -right-3 -top-2 animate-pulse rounded-full border border-amber/70 px-2 py-0.5 text-[11px] text-amber">
            建设中
          </span>
        </div>
        <div className="mt-4 text-[18px] font-bold text-text-1">{moduleName} 模块建设中</div>
        <div className="mt-1 text-[13px] text-text-2">该模块将在后续迭代开放，敬请期待</div>
        <button
          onClick={onBack}
          className="mt-5 flex items-center gap-1.5 rounded-md border border-cyan/50 px-4 py-1.5 text-[13px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_8px_rgba(34,211,238,.3)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回态势总览
        </button>
      </motion.div>
    </div>
  );
}
