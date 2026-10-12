import { tuktukName, type Tuktuk } from '../types'

interface Props {
  tuktuks: Tuktuk[]
  selected: Set<number>
  onToggle: (id: number) => void
}

export function TuktukPicker({ tuktuks, selected, onToggle }: Props) {
  if (tuktuks.length === 0) {
    return <p className="text-sm text-zinc-500">No tuk-tuks in the fleet yet.</p>
  }

  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {tuktuks.map((t) => {
        const isSelected = selected.has(t.id)
        const disabled = !t.active
        return (
          <button
            key={t.id}
            type="button"
            disabled={disabled}
            title={disabled ? `${tuktukName(t)} is inactive` : tuktukName(t)}
            onClick={() => onToggle(t.id)}
            className={`rounded-lg border px-2 py-3 text-sm font-medium transition ${
              disabled
                ? 'cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600'
                : isSelected
                  ? 'border-purple-400 bg-purple-500/20 text-purple-200'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            #{t.id}
          </button>
        )
      })}
    </div>
  )
}
