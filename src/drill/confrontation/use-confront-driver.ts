// 对抗舱 driver hook:订阅 store 并在 running + seedReady 时启动注入/调整调度。
// 特情节奏为串行链:上一条特情与 Commander 调整落定后再调度下一条 ——
// 一次性并行调度会让 plannedTotal 条特情挤在同一时间窗内爆发(一波流)。
import { useEffect, useRef } from 'react';
import { ConfrontDriver, type ConfrontAppIds } from './confront-driver';
import { ConfrontAdapter } from './confront-adapter';
import {
  appendAdjust,
  appendInject,
  getConfrontationState,
  setDeployLines,
  setThinking,
  startAgentActivity,
  updateAgentActivity,
  finishAgentActivity,
  subscribeConfrontation,
  type ConfrontationState,
} from './confront-store';
import type { ConfrontAgentProgressEvent } from './confront-adapter';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';

export interface UseConfrontDriverOpts {
  readonly adapter: ConfrontAdapter;
  readonly appIds: ConfrontAppIds;
  readonly buildingId: string;
  readonly sceneId: string;
  readonly drillId: string;
  /** 特情注入时的 3D 联动(Panel 提供:location 楼层聚焦 + 飞向;缺省无联动)。 */
  readonly onInjectScene?: (evt: { emergency: string; location?: string }) => void;
}

const TOOL_LABELS: Record<string, string> = {
  resolve_operational_context: '统一作战上下文',
  query_building_profile: '建筑档案',
  query_key_parts: '重点部位',
  query_facilities: '消防设施台账',
  query_scene_facilities: '3D场景设施',
  reconcile_building_facilities: '设施跨源对账',
  query_operational_plan: '正式作战预案',
  query_force_availability: '真实可用力量',
  query_water_sources: '周边消防水源',
  analyze_response: '到场响应分析',
  query_knowledge: '历史预案知识',
  inject_event: '特情注入',
  report_decision: '指挥决策上报',
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

function showProgress(event: ConfrontAgentProgressEvent): void {
  if (event.type === 'connected') {
    updateAgentActivity({ phase: '已连接真实智能体，正在读取业务数据' });
  } else if (event.type === 'tool-call') {
    updateAgentActivity({
      phase: `正在调用：${toolLabel(event.toolName)}`,
      toolName: event.toolName,
      toolStatus: 'calling',
    });
  } else if (event.type === 'tool-result') {
    updateAgentActivity({
      phase: `${toolLabel(event.toolName)}已返回，继续研判`,
      toolName: event.toolName,
      toolStatus: 'done',
    });
  } else {
    updateAgentActivity({ phase: '数据核对完成，正在组织最终输出' });
  }
}

export function useConfrontationDriver(opts: UseConfrontDriverOpts): void {
  const driverRef = useRef<ConfrontDriver | null>(null);
  const confRef = useRef<ConfrontationState>(getConfrontationState());

  useEffect(() => {
    const unsub = subscribeConfrontation((s) => {
      confRef.current = s;
      // 评估/退出一旦把状态切离 running，立即清理注入链定时器。
      // 不依赖 React render 后的另一个 effect，避免“评估完成后又追加特情”。
      if (s.status !== 'running' && driverRef.current) {
        driverRef.current.clearAll();
        driverRef.current = null;
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const s = confRef.current;
    if (!s.active || s.status !== 'running' || s.seedLoading || !s.seedScenario || driverRef.current) return;

    const driver = new ConfrontDriver({
      adapter: opts.adapter,
      appIds: opts.appIds,
      buildingId: opts.buildingId,
      sceneId: opts.sceneId,
      drillId: opts.drillId,
      seed: s.seedScenario,
      events: s.events,
      getState: () => {
        const current = confRef.current;
        return { events: current.events, situation: current.situation, deploy: current.deploy };
      },
    });
    driverRef.current = driver;

    const elapsedNow = (): number => {
      const startedAt = confRef.current.startedAt;
      return startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
    };

    const startPlanAndSchedule = () => {
      // 串行注入链:round N 落定(注入成功/失败)后 15-25s 排 round N+1
      const runInjectRound = (round: number): void => {
        if (round >= s.plannedTotal) return;
        // Driver 内部统一控制 6~15s 间隔；此处不再叠加第二层等待。
        const scheduleNext = (): void => runInjectRound(round + 1);
        driver.scheduleInject(round, {
          onThinking: (v) => setThinking(v),
          onStart: () => startAgentActivity(
            'adversary',
            opts.appIds.adversary,
            `导调对手正在研判第 ${round + 1} 轮特情`,
          ),
          onProgress: showProgress,
          onInject: (evt) => {
            if (confRef.current.status !== 'running') return; // 过期 Agent 回包不得污染已结束演练
            finishAgentActivity('success', `第 ${round + 1} 轮特情已通过多样性校验`);
            appendInject({
              specialType: evt.specialType,
              emergency: evt.emergency,
              location: evt.location,
              delta: evt.delta,
              tSec: elapsedNow(),
            });
            // 3D 联动:特情楼层聚焦 + 飞向(场景日志同步记录;此前中文 target 的
            // highlight 动作会被执行器按"非 id"跳过,属空转)
            addSceneAction({
              action: 'highlight',
              target: `特情位置:${evt.location ?? confRef.current.seedScenario?.floor ?? '未知'}`,
              source: '智能体',
            });
            opts.onInjectScene?.(evt);
            driver.scheduleAdjustment(evt.emergency, {
              onStart: () => startAgentActivity(
                'commander',
                opts.appIds.commander,
                `现场总指挥正在响应第 ${round + 1} 轮特情`,
              ),
              onProgress: showProgress,
              onAdjust: (out) => {
                if (confRef.current.status !== 'running') return;
                finishAgentActivity('success', `第 ${round + 1} 轮动态调整已形成`);
                appendAdjust({
                  seq: confRef.current.events.filter((e) => e.kind === 'inject').length,
                  adjustments: out.adjustments,
                  evidence: out.evidence,
                  tSec: elapsedNow(),
                });
                scheduleNext();
              },
              onAdjustFail: () => {
                finishAgentActivity('error', '现场总指挥未返回合法调整，已记录降级');
                scheduleNext();
              },
            });
          },
          onInjectFail: (reason) => {
            if (confRef.current.status !== 'running') return;
            finishAgentActivity('error', reason || '导调对手未返回合法特情');
            showToast(reason ? `特情已拒绝:${reason}` : '特情注入失败，继续对抗');
            scheduleNext();
          },
        });
      };

      // 初始部署完成后再进入第一轮导调，避免 Planner 与 Adversary 并发造成“后台无反馈”。
      if (s.deploy?.length) {
        // 一级预案输出已通过共享作战会话形成有效基线；不重复请求 Planner。
        runInjectRound(0);
        return;
      }
      driver.startInitialPlan({
        onStart: () => startAgentActivity(
          'planner',
          opts.appIds.planner,
          '预案规划员正在读取21号楼作战数据',
        ),
        onProgress: showProgress,
        onPlan: (lines) => {
          finishAgentActivity('success', '初始部署已生成，等待导调检验');
          // 真实部署进卡流(初步部署卡优先显示;agent 未回时 UI 回落静态摘要)
          setDeployLines(lines);
          addSceneAction({
            action: 'showRoute',
            target: `初步部署:${lines[0] ?? '到场处置'}`,
            params: { kind: 'plan', lines },
            source: '预案引擎',
          });
          runInjectRound(0);
        },
        onFail: () => {
          finishAgentActivity('error', '预案规划员未返回合法部署，已使用默认部署');
          showToast('初步部署生成失败，使用默认部署');
          runInjectRound(0);
        },
      });
    };

    startPlanAndSchedule();

    return () => {
      driver.clearAll();
      driverRef.current = null;
    };
  }, [opts.adapter, opts.appIds.adversary, opts.appIds.commander, opts.appIds.planner, opts.buildingId, opts.sceneId, opts.drillId, opts.onInjectScene]);

}
