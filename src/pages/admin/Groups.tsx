import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { addGroup, deleteGroup, listGroups, renameGroup } from '../../lib/groupsApi'
import { useAuth } from '../../context/AuthContext'
import type { Tuktuk, TuktukGroup } from '../../types'

export function Groups() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [groups, setGroups] = useState<TuktukGroup[]>([])
  const [tuktuks, setTuktuks] = useState<Tuktuk[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [g, t] = await Promise.all([
        listGroups(),
        isSupabaseConfigured
          ? supabase
              .from('tuktuks')
              .select('*')
              .order('id')
              .then((r) => (r.data as Tuktuk[]) ?? [])
          : Promise.resolve([]),
      ])
      setGroups(g)
      setTuktuks(t)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const countFor = (groupId: string) => tuktuks.filter((t) => t.group_id === groupId).length

  const handleCreate = async () => {
    if (!newName.trim()) return
    setError(null)
    setCreating(true)
    try {
      await addGroup(newName.trim())
      setNewName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group.')
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return
    setError(null)
    try {
      await renameGroup(id, editingName.trim())
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename group.')
    }
  }

  const handleDelete = async (group: TuktukGroup) => {
    if (
      !confirm(
        `Delete group "${group.name}"? Tuk-tuks in it become ungrouped, and any ads live on this group stop playing on them.`,
      )
    )
      return
    setError(null)
    try {
      await deleteGroup(group.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group.')
    }
  }

  if (loading) return <p className="text-zinc-500">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold text-white">Tuk-tuk groups</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Group tuk-tuks by area (e.g. "Meyerton") so you can go live on a whole group at once
        instead of picking every tuk-tuk individually. Assign a tuk-tuk to a group from its detail
        page under Tuk-Tuks.
      </p>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {isAdmin && (
        <div className="mb-6 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New group name, e.g. Meyerton"
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
          >
            {creating ? 'Adding…' : '+ Add group'}
          </button>
        </div>
      )}

      {groups.length === 0 && <p className="text-sm text-zinc-500">No groups yet.</p>}

      <div className="space-y-2">
        {groups.map((group) => (
          <div
            key={group.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 p-3"
          >
            {editingId === group.id ? (
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename(group.id)}
                className="mr-2 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white outline-none focus:border-purple-400"
              />
            ) : (
              <div>
                <p className="text-sm font-medium text-white">{group.name}</p>
                <p className="text-xs text-zinc-500">{countFor(group.id)} tuk-tuk(s)</p>
              </div>
            )}

            {isAdmin && (
              <div className="flex gap-2">
                {editingId === group.id ? (
                  <button
                    onClick={() => handleRename(group.id)}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                  >
                    Save
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(group.id)
                      setEditingName(group.name)
                    }}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                  >
                    Rename
                  </button>
                )}
                <button
                  onClick={() => handleDelete(group)}
                  className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
