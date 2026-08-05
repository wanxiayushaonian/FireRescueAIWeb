type Variant = 'normal' | 'warning' | 'offline' | 'cyan';

const MAP: Record<Variant, { dot: string; text: string }> = {
  normal: { dot: 'bg-green', text: 'text-green' },
  warning: { dot: 'bg-amber', text: 'text-amber' },
  offline: { dot: 'bg-red', text: 'text-red' },
  cyan: { dot: 'bg-cyan', text: 'text-cyan' },
};

export default function StatusBadge({
  label,
  variant = 'normal',
  pulse = false,
}: {
  label: string;
  variant?: Variant;
  pulse?: boolean;
}) {
  const m = MAP[variant];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] ${m.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot} ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

export function statusVariantOf(status: string): Variant {
  if (status === '告警' || status === '维保') return 'warning';
  if (status === '离线') return 'offline';
  return 'normal';
}
