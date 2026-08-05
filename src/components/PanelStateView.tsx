import { motion } from 'framer-motion';
import type { FetchState } from '@/mock/types';

export default function PanelStateView({
  state,
  onRetry,
  skeletonRows = 10,
}: {
  state: Exclude<FetchState, 'ok'>;
  onRetry?: () => void;
  skeletonRows?: number;
}) {
  if (state === 'loading') {
    return (
      <div className="flex h-full flex-col gap-2 p-4">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-md bg-bg-panel-2" style={{ opacity: 1 - i * 0.06 }} />
        ))}
        <div className="mt-2 text-center text-[13px] text-text-3">数据加载中…</div>
      </div>
    );
  }
  const isEmpty = state === 'empty';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center gap-3 p-6"
    >
      <img src={isEmpty ? '/empty-box.svg' : '/error-radar.svg'} alt="" className="h-[90px] w-[120px] opacity-80" />
      <div className="text-[13px] text-text-2">
        {isEmpty ? '暂无数据，请调整筛选条件' : '数据请求失败，请检查网络后重试'}
      </div>
      {!isEmpty && onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md border border-cyan/50 px-4 py-1.5 text-[13px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_8px_rgba(34,211,238,.3)]"
        >
          重试
        </button>
      )}
    </motion.div>
  );
}
