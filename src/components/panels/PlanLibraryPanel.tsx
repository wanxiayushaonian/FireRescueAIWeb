// 预案库面板：演练评估归档 / 对抗评估归档 / 改进措施回流统一可查可回放，
// 打通「归档物无处可查」业务断点（演练对抗模块第三个面板）。
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Archive, ChevronDown, FileText, Swords, Recycle, X, RotateCcw, Stamp, Database, CheckCircle2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FetchState } from '@/mock/types';
import { confirmImprovement, fetchLibrary, getLibrary, subscribeLibrary } from '@/mock/planLibrary';
import type { LibraryItem, LibraryKind, LibraryStatus } from '@/mock/planLibrary';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';
import PanelStateView from '@/components/PanelStateView';
import DemoTag from '@/components/DemoTag';

const KIND_META: Record<LibraryKind, { icon: LucideIcon; badge: string; bar: string }> = {
  演练预案: { icon: FileText, badge: 'border-violet/60 bg-violet/10 text-violet', bar: 'bg-violet' },
  对抗评估: { icon: Swords, badge: 'border-orange/60 bg-orange/10 text-orange', bar: 'bg-orange' },
  改进措施: { icon: Recycle, badge: 'border-green/60 bg-green/10 text-green', bar: 'bg-green' },
};

const STATUS_CLS: Record<LibraryStatus, string> = {
  已归档: 'border-green/60 bg-green/10 text-green',
  需修订: 'border-red/60 bg-red/10 text-red',
  待落地: 'border-amber/70 bg-amber/10 text-amber',
  已落地: 'border-cyan/60 bg-cyan/10 text-cyan',
};

const FILTERS: Array<'全部' | LibraryKind> = ['全部', '演练预案', '对抗评估', '改进措施'];

/** 改进措施「确认落地」操作（列表项 / 详情共用） */
function handleConfirm(id: string) {
  const updated = confirmImprovement(id);
  if (updated) showToast('改进措施已确认落地，关联预案版本 +1 · 演示数据');
}

function ItemCard({ item, onOpen }: { item: LibraryItem; onOpen: (it: LibraryItem) => void }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  return (
    <motion.button
      layout="position"
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      onClick={() => onOpen(item)}
      className="relative w-full overflow-hidden rounded-lg border border-line bg-bg-panel-2/50 p-2.5 text-left transition hover:border-line-glow"
    >
      <span className={`absolute left-0 top-0 h-full w-[3px] ${meta.bar}`} />
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-text-2" />
        <span className={`rounded border px-1.5 py-px text-[11px] leading-4 ${meta.badge}`}>{item.kind}</span>
        {item.kind === '演练预案' && (
          <span className="rounded border border-violet/50 bg-violet/10 px-1 py-px font-num text-[10px] leading-3.5 text-violet">
            v{item.version ?? 1}
          </span>
        )}
        <span className={`ml-auto flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] leading-4 ${STATUS_CLS[item.status]}`}>
          {item.status === '已归档' && <Stamp className="h-3 w-3" />}
          {item.status}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-text-1">{item.title}</p>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-3">
        {item.score !== undefined && (
          <span className="font-num text-[12px] font-bold text-cyan">{item.score} 分</span>
        )}
        {item.buildingName && <span>{item.buildingName}</span>}
        <span className="ml-auto font-mono">{item.archivedAt}</span>
      </div>
      <p className="mt-1 line-clamp-1 text-[12px] leading-5 text-text-2">{item.summary[0]}</p>
      {item.kind === '改进措施' && (
        <div className="mt-1.5 flex justify-end">
          {item.status === '待落地' ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleConfirm(item.id);
              }}
              className="flex cursor-pointer items-center gap-1 rounded-md border border-green/60 px-2 py-1 text-[12px] text-green transition hover:bg-green/10"
            >
              <CheckCircle2 className="h-3 w-3" />
              确认落地
            </span>
          ) : item.status === '已落地' ? (
            <span className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-text-3">
              <CheckCircle2 className="h-3 w-3" />
              已落地
            </span>
          ) : null}
        </div>
      )}
    </motion.button>
  );
}

function DetailDialog({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const handleReload = () => {
    window.dispatchEvent(new CustomEvent('library:reload-plan', { detail: { buildingName: item.buildingName } }));
    showToast(`已请求重新载入演练：${item.buildingName ?? item.title} · 演示数据`);
    onClose();
  };
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 12, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 12, opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[82dvh] w-[460px] flex-col overflow-hidden rounded-lg border border-violet/60 bg-bg-panel shadow-[0_0_32px_rgba(167,139,250,.15)]"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg-panel-2/60 px-3">
          <Icon className="h-4 w-4 text-violet" />
          <span className="text-[15px] font-bold text-text-1">归档详情</span>
          <span className={`rounded border px-1.5 py-px text-[11px] leading-4 ${meta.badge}`}>{item.kind}</span>
          {item.kind === '演练预案' && (
            <span className="rounded border border-violet/50 bg-violet/10 px-1 py-px font-num text-[11px] text-violet">
              v{item.version ?? 1}
            </span>
          )}
          <span className="ml-auto rounded-full border border-amber/70 px-1.5 py-px text-[11px] text-amber">演示数据</span>
          <button onClick={onClose} className="rounded p-1 text-text-3 transition hover:bg-red/20 hover:text-red">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <div>
            <div className="text-[15px] font-bold leading-6 text-text-1">{item.title}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-text-3">
              {item.score !== undefined && (
                <span className="font-num text-[14px] font-bold text-cyan">{item.score} / 100</span>
              )}
              {item.buildingName && <span>建筑：{item.buildingName}</span>}
              <span className="font-mono">归档时间 {item.archivedAt}</span>
              <span className={`flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] leading-4 ${STATUS_CLS[item.status]}`}>
                {item.status}
              </span>
            </div>
          </div>
          <ul className="space-y-1.5">
            {item.summary.map((s, i) => (
              <motion.li
                key={s}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: 0.08 * i }}
                className="flex gap-2 rounded-md border border-line bg-bg-panel-2/50 p-2 text-[13px] leading-5 text-text-2"
              >
                <span className="font-mono text-cyan">{String(i + 1).padStart(2, '0')}</span>
                {s}
              </motion.li>
            ))}
          </ul>
          {item.sourceDetail && <div className="text-[11px] text-text-3">{item.sourceDetail}</div>}
          {item.kind === '演练预案' && (
            <button
              onClick={handleReload}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-cyan/60 py-2 text-[13px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_10px_rgba(34,211,238,.35)]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重新载入演练
            </button>
          )}
          {item.kind === '改进措施' && (
            item.status === '待落地' ? (
              <button
                onClick={() => handleConfirm(item.id)}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-green/60 py-2 text-[13px] text-green transition hover:bg-green/10"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                确认落地（关联预案版本 +1）
              </button>
            ) : item.status === '已落地' ? (
              <div className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line py-2 text-[13px] text-text-3">
                <CheckCircle2 className="h-3.5 w-3.5" />
                已落地
              </div>
            ) : null
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PlanLibraryPanel() {
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [phase, setPhase] = useState<'loading' | 'ok' | 'error'>('loading');
  const [items, setItems] = useState<LibraryItem[]>(getLibrary());
  const [filter, setFilter] = useState<'全部' | LibraryKind>('全部');
  const [detail, setDetail] = useState<LibraryItem | null>(null);

  // 订阅库内新增（评估归档 / 回流实时入列）
  useEffect(() => subscribeLibrary(setItems), []);

  // 首屏拉取（300-800ms 延迟演示加载骨架）
  useEffect(() => {
    let alive = true;
    setPhase('loading');
    fetchLibrary()
      .then(() => { if (alive) setPhase('ok'); })
      .catch(() => { if (alive) setPhase('error'); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(
    () => (filter === '全部' ? items : items.filter((it) => it.kind === filter)),
    [items, filter],
  );

  const openDetail = (it: LibraryItem) => {
    setDetail(it);
    addSceneAction({ action: 'highlight', target: it.buildingName ?? it.title, source: '面板' });
  };

  const handleRetry = () => {
    setDemoState('loading');
    window.setTimeout(() => setDemoState('ok'), 800);
  };

  const renderBody = () => {
    if (demoState === 'loading' || phase === 'loading') {
      return <PanelStateView state="loading" skeletonRows={5} />;
    }
    if (demoState === 'error' || phase === 'error') {
      return <PanelStateView state="error" onRetry={handleRetry} skeletonRows={5} />;
    }
    if (demoState === 'empty' || filtered.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
          <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
          <div className="text-[13px] text-text-2">
            {demoState === 'empty' ? '预案库暂无归档条目' : '该分类下暂无归档条目'}
          </div>
          <div className="max-w-[280px] text-center text-[12px] text-text-3">
            完成预案评估归档、对抗评估或确认改进措施回流后，条目将自动入库
          </div>
          <DemoTag />
        </div>
      );
    }
    return (
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        <AnimatePresence initial={false}>
          {filtered.map((it) => <ItemCard key={it.id} item={it} onOpen={openDetail} />)}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* 身份条 + 状态演示 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-violet/5 px-3 py-2">
        <Database className="h-4 w-4 text-violet" />
        <span className="whitespace-nowrap text-[13px] font-bold text-violet">预案库</span>
        <span className="flex items-center gap-1 rounded-full border border-line px-1.5 py-px text-[11px] text-text-3">
          <Archive className="h-3 w-3" />
          {items.length} 条
        </span>
        <div className="relative ml-auto">
          <select
            value={demoState}
            onChange={(e) => setDemoState(e.target.value as FetchState)}
            title="状态演示"
            className="h-7 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-6 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
          >
            <option value="ok">状态演示：正常</option>
            <option value="loading">状态演示：加载中</option>
            <option value="empty">状态演示：空态</option>
            <option value="error">状态演示：失败</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-3" />
        </div>
      </div>

      {/* kind 筛选 chips */}
      <div className="flex shrink-0 gap-1.5 border-b border-line px-3 py-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
              filter === f
                ? 'border-cyan/60 bg-cyan/10 text-cyan shadow-[0_0_8px_rgba(34,211,238,.25)]'
                : 'border-line text-text-3 hover:text-text-2'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {renderBody()}

      {/* 归档详情 Dialog（从 items 派生，落地后即时刷新状态/版本） */}
      <AnimatePresence>
        {detail && (
          <DetailDialog
            item={items.find((it) => it.id === detail.id) ?? detail}
            onClose={() => setDetail(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
