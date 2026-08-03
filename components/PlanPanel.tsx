'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { sceneSdk } from '@/lib/scene-sdk';
import { getPlans, type PlanSource } from '@/lib/plan-data';
import {
  PLAN_STATUS_LABELS,
  PLAN_STATUS_THEME,
  type EmergencyPlan,
  type PlanStep,
} from '@/lib/plan-mock-data';

const EXECUTE_DELAY_MS = 600;

function usePlanExecution() {
  const [executingPlanId, setExecutingPlanId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const stopRef = useRef(false);

  const resetHighlights = useCallback(async () => {
    try {
      const sdk = sceneSdk();
      highlightedIds.forEach((id) => sdk.cancelHeighLight(id));
    } catch {
      // ignore
    }
    setHighlightedIds(new Set());
  }, [highlightedIds]);

  const addHighlights = useCallback((ids: string[]) => {
    setHighlightedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const executePlan = useCallback(
    async (plan: EmergencyPlan) => {
      if (executingPlanId) return;
      stopRef.current = false;
      setExecutingPlanId(plan.id);
      setCurrentStep(0);
      await resetHighlights();

      try {
        const sdk = sceneSdk();
        const allStoryIds = plan.storyIds;
        const allRouteIds = plan.routeIds;

        if (allStoryIds.length > 0) {
          await sdk.setScene({ stories: allStoryIds, mode: '3D' });
        }

        if (allRouteIds.length > 0) {
          await sdk.virtualRouteSetVisible(allRouteIds, true);
        }

        for (let i = 0; i < plan.steps.length; i += 1) {
          if (stopRef.current) break;
          const step = plan.steps[i];
          setCurrentStep(step.step);

          if (step.storyIds && step.storyIds.length > 0) {
            await sdk.setScene({ stories: step.storyIds, mode: '3D' });
          }

          if (step.routeIds && step.routeIds.length > 0) {
            await sdk.virtualRouteSetVisible(step.routeIds, true);
          }

          if (step.deviceIds && step.deviceIds.length > 0) {
            const ids = step.deviceIds;
            // 只飞向本步第一个设备，其余并行高亮，避免逐个设备连续跳视角
            await sdk.fly(ids[0]);
            await Promise.allSettled(ids.map((deviceId) => sdk.heighLight(deviceId, '#f59e0b')));
            addHighlights(ids);
          }

          if (i < plan.steps.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, EXECUTE_DELAY_MS));
          }
        }
      } catch (err) {
        console.error('执行预案失败', err);
      } finally {
        setExecutingPlanId(null);
        setCurrentStep(0);
        stopRef.current = false;
      }
    },
    [executingPlanId, resetHighlights, addHighlights]
  );

  const stopExecution = useCallback(() => {
    stopRef.current = true;
  }, []);

  return {
    executingPlanId,
    currentStep,
    highlightedIds,
    executePlan,
    stopExecution,
    resetHighlights,
  };
}

export function PlanPanel() {
  const [plans, setPlans] = useState<EmergencyPlan[]>([]);
  const [source, setSource] = useState<PlanSource>('mock');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getPlans();
        if (cancelled) return;
        setPlans(result.plans);
        setSource(result.source);
        setSelectedPlanId((prev) => prev ?? result.plans[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '预案加载失败');
          setPlans([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? plans[0],
    [plans, selectedPlanId]
  );

  const { executingPlanId, currentStep, highlightedIds, executePlan, stopExecution, resetHighlights } =
    usePlanExecution();

  const isExecuting = executingPlanId === selectedPlan?.id;
  const totalSteps = selectedPlan?.steps.length ?? 0;
  const progress = isExecuting && totalSteps > 0 ? Math.min(1, (currentStep ?? 0) / totalSteps) : 0;

  return (
    <div id="panel-emergency-plan">
      <PanelShell
        name="emergency-plan"
        title="应急预案"
        description="展示应急预案列表和详情，点击执行后自动切换楼层、显示路线并定位高亮关键设备。"
        position="top-right"
        defaultOpen={true}
        width={420}
      >
        <div className="plan-panel">
          {loading ? (
            <div className="plan-state">
              <span className="plan-state-spinner" />
              <span>正在加载预案…</span>
            </div>
          ) : loadError ? (
            <div className="plan-state plan-state--error">
              <div className="plan-state-title">预案加载失败</div>
              <div className="plan-state-msg">{loadError}</div>
            </div>
          ) : plans.length === 0 ? (
            <div className="plan-state">
              <div className="plan-state-title">暂无预案</div>
              <div className="plan-state-msg">当前没有可执行的应急预案，请在后台配置后刷新</div>
            </div>
          ) : (
            <>
              <section className="plan-section">
                <div className="plan-section-title">预案列表</div>
                <div className="plan-list">
                  {plans.map((plan) => {
                    const theme = PLAN_STATUS_THEME[plan.status];
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        className={`plan-card ${selectedPlan?.id === plan.id ? 'is-active' : ''}`}
                        onClick={() => setSelectedPlanId(plan.id)}
                      >
                        <div className="plan-card-header">
                          <span className="plan-card-name">{plan.name}</span>
                          <span
                            className="plan-card-status"
                            style={{ color: theme.color, background: theme.bg }}
                          >
                            {PLAN_STATUS_LABELS[plan.status]}
                          </span>
                        </div>
                        <div className="plan-card-meta">
                          适用：{plan.applicableStories} · 步骤：{plan.steps.length} · 路线：
                          {plan.routeIds.length} · 设备：{plan.deviceIds.length}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {selectedPlan && (
                <section className="plan-detail">
                  <div className="plan-detail-head">
                    <div>
                      <div className="plan-detail-title">{selectedPlan.name}</div>
                      <div className="plan-detail-type">{selectedPlan.type}</div>
                    </div>
                    {source === 'mock' && (
                      <span
                        className="plan-demo-badge"
                        title="当前数据为演示用模拟数据，接入真实接口后自动替换"
                      >
                        演示数据
                      </span>
                    )}
                  </div>
                  <div className="plan-detail-desc">{selectedPlan.description}</div>

                  <div className="plan-tag-row">
                    <span className="plan-tag">楼层：{selectedPlan.applicableStories}</span>
                    {selectedPlan.routeIds.map((routeId) => (
                      <span key={routeId} className="plan-tag plan-tag--route">
                        路线：{routeId}
                      </span>
                    ))}
                    {selectedPlan.deviceIds.slice(0, 3).map((deviceId) => (
                      <span key={deviceId} className="plan-tag plan-tag--device">
                        设备：{deviceId.slice(-8)}
                      </span>
                    ))}
                    {selectedPlan.deviceIds.length > 3 && (
                      <span className="plan-tag plan-tag--device">
                        +{selectedPlan.deviceIds.length - 3}
                      </span>
                    )}
                  </div>

                  {isExecuting && (
                    <div className="plan-progress">
                      <div className="plan-progress-track">
                        <div className="plan-progress-bar" style={{ width: `${progress * 100}%` }} />
                      </div>
                      <div className="plan-progress-label">
                        正在执行步骤 {currentStep} / {totalSteps}
                      </div>
                    </div>
                  )}

                  <div className="plan-section-title">执行步骤</div>
                  <div className="plan-step-list">
                    {selectedPlan.steps.map((step) => (
                      <StepItem
                        key={step.step}
                        step={step}
                        active={isExecuting && currentStep === step.step}
                        done={isExecuting && step.step < (currentStep ?? 0)}
                      />
                    ))}
                  </div>

                  <div className="plan-actions">
                    <button
                      type="button"
                      className="plan-btn plan-btn--primary"
                      disabled={isExecuting}
                      onClick={() => executePlan(selectedPlan)}
                    >
                      {isExecuting ? `执行中（步骤 ${currentStep}）…` : '执行预案'}
                    </button>
                    {isExecuting && (
                      <button type="button" className="plan-btn plan-btn--stop" onClick={stopExecution}>
                        停止执行
                      </button>
                    )}
                    <button
                      type="button"
                      className="plan-btn plan-btn--default"
                      onClick={resetHighlights}
                      disabled={highlightedIds.size === 0}
                    >
                      取消高亮
                    </button>
                  </div>
                  <div className="plan-hint">执行后将切换楼层、显示路线并定位设备；可随时停止</div>
                </section>
              )}
            </>
          )}
        </div>
      </PanelShell>
    </div>
  );
}

function StepItem({ step, active, done }: { step: PlanStep; active: boolean; done: boolean }) {
  return (
    <div className={`plan-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
      <span className={`plan-step-index ${done ? 'is-done' : ''}`}>
        {done ? '✓' : step.step}
      </span>
      <span className="plan-step-content">{step.description}</span>
    </div>
  );
}
