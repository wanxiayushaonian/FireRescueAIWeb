/** 处置流程演示运行门控:演示期间暂停 use-scene-bridge 的自动 flyTo,避免与剧本视角争夺。 */
let active = false;

export function setDisposalDemoActive(v: boolean): void {
  active = v;
}

export function isDisposalDemoActive(): boolean {
  return active;
}
