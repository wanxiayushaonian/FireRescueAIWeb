export default function DemoTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber/70 px-1.5 py-px text-[11px] leading-4 text-amber select-none ${className}`}
    >
      演示数据
    </span>
  );
}
