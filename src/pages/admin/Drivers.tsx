import { useEffect, useState } from 'react'
import {
  addDriver,
  deleteDriver,
  listDrivers,
  listRecentSessions,
  setDriverActive,
  setDriverPin,
} from '../../lib/driversApi'
import { useAuth } from '../../context/AuthContext'
import type { Driver, DriverSession } from '../../types'

export function Drivers() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [sessions, setSessions] = useState<DriverSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newUsername, setNewUsername] = useState('')
  const [newPin, setNewPin] = useState('')
  const [creating, setCreating] = useState(false)

  const [resettingId, setResettingId] = useState<string | null>(null)
  const [resetPin, setResetPin] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [d, s] = await Promise.all([listDrivers(), listRecentSessions()])
      setDrivers(d)
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

  const handleCreate = async () => {
    if (!newUsername.trim() || newPin.length !== 6) return
    setError(null)
    setCreating(true)
    try {
      await addDriver(newUsername.trim(), newPin)
      setNewUsername('')
      setNewPin('')
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
        Each driver signs in on any tablet with their own username + 6-digit PIN — no shared
        code. Deactivate a driver to instantly block their PIN everywhere without affecting anyone
        else.
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      <div className="mb-6 flex gap-2">
        <input
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="Driver name, e.g. Mark"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
        />
        <input
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          placeholder="6-digit PIN"
          className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-white outline-none focus:border-purple-400"
        />
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
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{driver.username}</p>
                  <p className="text-xs text-zinc-500">{driver.active ? 'Active' : 'Deactivated'}</p>
                </div>
                <div className="flex gap-2">
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
