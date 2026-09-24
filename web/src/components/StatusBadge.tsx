const CONFIG = {
  quote:       { label: 'Orçamento',    className: 'bg-purple-900/50 text-purple-300 ring-purple-500/30' },
  open:        { label: 'Aberta',       className: 'bg-green-900/50 text-green-400 ring-green-500/30' },
  in_progress: { label: 'Em andamento', className: 'bg-amber-900/50 text-amber-400 ring-amber-500/30' },
  closed:      { label: 'Encerrada',    className: 'bg-slate-700/60 text-slate-400 ring-slate-500/30' },
} as const

export default function StatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status as keyof typeof CONFIG] ?? CONFIG.closed
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
