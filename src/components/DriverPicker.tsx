import type { DriverName } from '../types'

interface Props {
  drivers: DriverName[] | null
  onSelect: (driver: DriverName) => void
}

export function DriverPicker({ drivers, onSelect }: Props) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-lg text-white">Who's driving?</p>

      {drivers === null && <p className="text-sm text-zinc-500">Loading drivers…</p>}
      {drivers !== null && drivers.length === 0 && (
        <p className="max-w-xs text-sm text-zinc-500">
          No drivers set up yet. Ask an admin to add one from the Drivers page.
        </p>
      )}

      <div className="flex max-w-md flex-wrap justify-center gap-3">
        {drivers?.map((d) => (
          <button
            key={d.id}
            onClick={() => onSelect(d)}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-6 py-4 text-lg font-medium text-white hover:border-purple-400"
          >
            {d.username}
          </button>
        ))}
      </div>
    </div>
  )
}
