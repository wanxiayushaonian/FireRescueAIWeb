// 模块级错误边界:某个模块渲染崩溃时降级为占位卡,其余模块与 3D 背景不受影响。
// 接线点在 App.tsx 模块内容层(key={module} 切换即复位);注意内容层常态是
// pointer-events-none(非 overview),fallback 必须自带 pointer-events-auto 才可点重试。
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  readonly moduleName: string;
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 留痕到控制台(含组件栈),便于演示事故后定位;不复抛避免再触发上层白屏
    console.error(`[error-boundary] ${this.props.moduleName} 渲染异常`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="pointer-events-auto grid h-full place-items-center p-6">
        <div className="rounded-xl border border-line bg-bg-panel/85 px-8 py-6 text-center shadow-xl">
          <div className="mb-1 text-base font-bold text-text-1">{this.props.moduleName}模块临时异常</div>
          <div className="mb-4 max-w-sm text-sm text-text-2">
            本模块渲染出错,已隔离不影响其他功能。切换模块或点击重试可恢复。
            <span className="mt-1 block font-mono text-[11px] text-text-3">{String(error?.message ?? error)}</span>
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-lg bg-gradient-to-r from-cyan to-blue px-4 py-1.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
          >
            重试
          </button>
        </div>
      </div>
    );
  }
}
