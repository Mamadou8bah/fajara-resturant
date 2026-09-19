export function StatusChip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info';
}) {
  const tones = {
    neutral: 'bg-[#E8DFD0] text-ink',
    success: 'bg-[#DCEBE4] text-ready',
    warn: 'bg-[#F5E8C8] text-ink',
    danger: 'bg-[#F3D9CE] text-cta',
    info: 'bg-[#E8DFD0] text-sidebar',
  };

  return (
    <span
      className={`inline-flex min-h-[28px] items-center rounded-md px-2 text-xs font-semibold ${tones[tone]}`}
    >
      {label}
    </span>
  );
}
