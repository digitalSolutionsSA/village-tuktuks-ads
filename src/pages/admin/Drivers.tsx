import { useEffect, useState } from 'react'
import {
  addDriver,
  deleteDriver,
  listDrivers,
  listRecentSessions,
  setDriverActive,
  setDriverPin,
  setDriverTuktuk,
} from '../../lib/driversApi'
import { listTuktuks } from '../../lib/tuktuksApi'
import { useAuth } from '../../context/AuthContext'
import type { Driver, DriverSession, Tuktuk } from '../../types'

export function Drivers() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [tuktuks, setTuktuks] = useState<Tuktuk[]>([])
  const [sessions, setSessions] = useState<DriverSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newUsername, setNewUsername] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newTuktukId, setNewTuktukId] = useState<'' | number>('')
  const [creating, setCreating] = useState(false)

  const [resettingId, setResettingId] = useState<string | null>(null)
  const [resetPin, setResetPin] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [d, t, s] = await Promise.all([listDrivers(), listTuktuks(), listRecentSessions()])
      setDrivers(d)
      setTuktuks(t)
      setSessions(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drivers.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const tuktukLabel = (id: number | null) =>
    id === null ? 'Any tuk-tuk' : (tuktuks.find((t) => t.id === id)?.label ?? `Tuk-Tuk #${id}`)

  const handleCreate = async () => {
    if (!newUsername.trim() || newPin.length !== 6) return
    setError(null)
    setCreating(true)
    try {
      await addDriver(newUsername.trim(), newPin, newTuktukId === '' ? null : newTuktukId)
      setNewUsername('')
      setNewPin('')
      setNewTuktukId('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add driver.')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (driver: Driver) => {
    setError(null)
    setBusyId(driver.id)
    try {
      await setDriverActive(driver.id, !driver.active)
      setDrivers((prev) =>
        prev.map((d) => (d.id === driver.id ? { ...d, active: !driver.active } : d)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update driver.')
    } finally {
      setBusyId(null)
    }
  }

  const handleAssignTuktuk = async (driver: Driver, tuktukId: number | null) => {
    setError(null)
    setBusyId(driver.id)
    try {
      await setDriverTuktuk(driver.id, tuktukId)
      setDrivers((prev) => prev.map((d) => (d.id === driver.id ? { ...d, tuktuk_id: tuktukId } : d)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tuk-tuk assignment.')
    } finally {
      setBusyId(null)
    }
  }

  const handleResetPin = async (driver: Driver) => {
    if (resetPin.length !== 6) return
    setError(null)
    setBusyId(driver.id)
    try {
      await setDriverPin(driver.id, resetPin)
      setResettingId(null)
      setResetPin('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset PIN.')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (driver: Driver) => {
    if (!confirm(`Remove driver "${driver.username}"? They won't be able to sign in anymore.`))
      return
    setError(null)
    setBusyId(driver.id)
    try {
      await deleteDriver(driver.id)
      setDrivers((prev) => prev.filter((d) => d.id !== driver.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove driver.')
    } finally {
      setBusyId(null)
    }
  }

  if (!isAdmin) {
    return <p className="text-zinc-500">Only admins can manage drivers.</p>
  }

  if (loading) return <p className="text-zinc-500">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold text-white">Drivers</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Each driver signs in with their own username + 6-digit PIN. Assign a driver to a specific
        tuk-tuk and their PIN only works on that tablet — leave it as "Any tuk-tuk" for a relief
        driver who covers multiple. Deactivate a driver to instantly block their PIN everywhere.
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <input
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="Driver name, e.g. Johan"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
        />
        <input
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="6-digit PIN"
          className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-white outline-none focus:border-purple-400"
        />
        <select
          value={newTuktukId}
          onChange={(e) => setNewTuktukId(e.target.value === '' ? '' : Number(e.target.value))}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
        >
          <option value="">Any tuk-tuk</option>
          {tuktuks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} only
            </option>
          ))}
        </select>
        <button
          onClick={handleCreate}
          disabled={creating || !newUsername.trim() || newPin.length !== 6}
          className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
        >
          {creating ? 'Adding…' : '+ Add'}
        </button>
      </div>

      {drivers.length === 0 && <p className="text-sm text-zinc-500">No drivers yet.</p>}

      <div className="space-y-2">
        {drivers.map((driver) => {
          const busy = busyId === driver.id
          return (
            <div
              key={driver.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-white">{driver.username}</p>
                  <p className="text-xs text-zinc-500">
                    {driver.active ? 'Active' : 'Deactivated'} · {tuktukLabel(driver.tuktuk_id)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={driver.tuktuk_id ?? ''}
                    disabled={busy}
                    onChange={(e) =>
                      handleAssignTuktuk(driver, e.target.value === '' ? null : Number(e.target.value))
                    }
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white outline-none focus:border-purple-400 disabled:opacity-50"
                  >
                    <option value="">Any tuk-tuk</option>
                    {tuktuks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} only
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      setResettingId(resettingId === driver.id ? null : driver.id)
                      setResetPin('')
                    }}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                  >
                    Reset PIN
                  </button>
                  <button
                    onClick={() => handleToggleActive(driver)}
                    disabled={busy}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {driver.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(driver)}
                    disabled={busy}
                    className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {resettingId === driver.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    autoFocus
                    value={resetPin}
                    onChange={(e) => setResetPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    placeholder="New 6-digit PIN"
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-white outline-none focus:border-purple-400"
                  />
                  <button
                    onClick={() => handleResetPin(driver)}
                    disabled={busy || resetPin.length !== 6}
                    className="rounded-lg bg-purple-500 px-3 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-medium text-zinc-300">Recent activity</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-zinc-500">No sign-ins yet.</p>
      ) : (
        <div className="space-y-1">
          {sessions.map((s) => (
            <p key={s.id} className="text-xs text-zinc-500">
              <span className="text-zinc-300">{s.driver_username}</span>{' '}
              {s.action === 'sign_in' ? 'signed in on' : 'signed out on'}{' '}
              <span className="text-zinc-300">{s.tuktuk_label}</span> ·{' '}
              {new Date(s.created_at).toLocaleString()}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
