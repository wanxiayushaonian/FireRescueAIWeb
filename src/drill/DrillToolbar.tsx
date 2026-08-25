'use client';

/**
 * DrillToolbar — 演练对抗大屏顶部控制条。
 *
 * 2026-08-24 清理死 UI：原「启动/暂停/变速/停止」按钮是旧 tick 引擎遗留（T+ 不走、
 * 暂停空操作），剧本下拉仅一个选项（21号楼，剧本机制已移除）——本工具条只保留
 * 模块标题 + 对抗舱运行状态展示（对抗中显示 T+ 真实运行秒数）。
 */

export interface DrillToolbarProps {
  /** 对抗舱是否运行中(状态徽标:对抗中/未开始)。 */
  readonly running: boolean;
  /** 对抗运行秒数(T+ 显示)。 */
  readonly tPlus: number;
}

export function DrillToolbar({ running, tPlus }: DrillToolbarProps) {
  return (
    <div className="flex items-center gap-3 border-b border-line bg-bg-panel/80 px-4 py-2.5 backdrop-blur-sm">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-text-1">演练对抗</span>
        <span className="text-text-3">·</span>
        <span className="text-xs text-text-2">乐盈广场21号楼 · 5层电气火灾</span>
      </div>

      {/* 右侧:对抗状态 + T+(真实运行秒数) */}
      <div className="ml-auto flex items-center gap-3">
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
            running
              ? 'bg-green/10 text-green'
              : 'bg-text-3/10 text-text-3'
          }`}
        >
          {running ? '对抗中' : '未开始'}
        </span>
        {running && (
          <span className="font-mono text-base font-bold text-cyan">
            T+{tPlus}
          </span>
        )}
      </div>
    </div>
  );
}

export default DrillToolbar;
