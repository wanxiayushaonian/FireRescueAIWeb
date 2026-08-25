// P0 人工决策闭环 · 人工改派编辑工作台。
// 打开时机:对抗卡「人工改派」点击;保存 → 独立 manual 决策事件,成为后续轮次有效部署基线。
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, X } from 'lucide-react';

export interface ManualDecisionDraft {
  readonly lines: string[];
  readonly note: string;
}

export function ManualDecisionDialog({
  seq,
  specialText,
  agentLines,
  onSave,
  onCancel,
}: {
  /** 被改派调整对应的特情轮次 */
  readonly seq: number;
  /** 特情原文(上下文提示) */
  readonly specialText: string;
  /** Commander 建议条目(作为草稿起点:可保留/编辑/删除) */
  readonly agentLines: readonly string[];
  readonly onSave: (draft: ManualDecisionDraft) => void;
  readonly onCancel: () => void;
}) {
  const [lines, setLines] = useState<string[]>([...agentLines]);
  const [note, setNote] = useState('');
  const trimmed = lines.map((l) => l.trim());
  const valid = trimmed.some((l) => l.length > 0);

  const setLine = (i: number, v: string) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? v : l)));
  const removeLine = (i: number) =>
    setLines((prev) => prev.filter((_, idx) => idx !== i));

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-6">
      <div className="flex max-h-[84vh] w-[620px] flex-col rounded-xl border border-line bg-bg-panel shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="text-[14px] font-bold text-text-1">人工改派 · 特情 #{seq}</span>
          <span className="rounded border border-amber/50 px-1.5 py-px text-[11px] text-amber">人工决策将成为后续轮次部署基线</span>
          <button
            onClick={onCancel}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded text-text-3 transition hover:bg-bg-panel-2 hover:text-text-1"
            title="取消"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-3 rounded-lg border border-orange/40 bg-orange/5 p-2.5 text-[12px] leading-5 text-text-2">
            <span className="text-orange">特情：</span>{specialText}
          </div>

          <div className="mb-1 text-[12px] font-bold text-text-2">
            决策条目（可编辑/删除/新增；力量、路线、战术直接写在条目里）
          </div>
          <div className="flex flex-col gap-2">
            {lines.map((line, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="mt-2 text-cyan">·</span>
                <textarea
                  value={line}
                  onChange={(e) => setLine(i, e.target.value)}
                  rows={2}
                  className="min-h-[52px] flex-1 resize-y rounded-md border border-line bg-bg-panel-2 px-2 py-1.5 text-[13px] leading-5 text-text-1 outline-none transition focus:border-cyan/60"
                />
                <button
                  onClick={() => removeLine(i)}
                  className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-3 transition hover:bg-red/10 hover:text-red"
                  title="删除该条目(保存前可取消整个改派)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setLines((prev) => [...prev, ''])}
            className="mt-2 flex h-7 items-center gap-1 rounded-md border border-dashed border-line px-2 text-[12px] text-text-3 transition hover:border-cyan/50 hover:text-cyan"
          >
            <Plus className="h-3 w-3" />新增条目
          </button>

          <div className="mb-1 mt-4 text-[12px] font-bold text-text-2">处置原因（评估与复盘展示）</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="为什么这样改派：如现场力量状态、水源条件、安全边界……"
            className="w-full resize-y rounded-md border border-line bg-bg-panel-2 px-2 py-1.5 text-[13px] leading-5 text-text-1 outline-none transition placeholder:text-text-3 focus:border-cyan/60"
          />
        </div>

        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <button
            onClick={onCancel}
            className="h-8 rounded-md border border-line px-3 text-[13px] text-text-2 transition hover:border-line-glow hover:text-cyan"
          >
            取消
          </button>
          <button
            disabled={!valid}
            onClick={() => onSave({ lines: trimmed.filter((l) => l.length > 0), note: note.trim() })}
            className="h-8 rounded-md bg-amber/90 px-4 text-[13px] font-bold text-bg-deep transition hover:bg-amber disabled:cursor-not-allowed disabled:opacity-40"
            title={valid ? '保存人工决策' : '至少保留一条有效决策条目'}
          >
            保存人工决策
          </button>
          <span className="ml-auto text-[11px] text-text-3">保存后指挥官后续调整将以此为基线</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
