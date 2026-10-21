export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number | undefined
  hint?: string
  tone?: 'good' | 'warn'
}) {
  const color = tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-amber-300' : 'text-white'
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value ?? '—'}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

export const LEAD_STATUS_STYLES: Record<string, string> = {
  new: 'bg-sky-500/15 text-sky-300',
  contacted: 'bg-indigo-500/15 text-indigo-300',
  meeting: 'bg-purple-500/15 text-purple-300',
  proposal: 'bg-amber-500/15 text-amber-300',
  won: 'bg-green-500/15 text-green-300',
  lost: 'bg-zinc-700/50 text-zinc-400',
}
