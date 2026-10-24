import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase, MEDIA_BUCKET } from '../../lib/supabase'
import { DEMO_ADS } from '../../lib/demoData'
import { listGroups } from '../../lib/groupsApi'
import { listAgreements } from '../../lib/clientsApi'
import { useAuth } from '../../context/AuthContext'
import type { Ad, Client, MediaType, TuktukGroup } from '../../types'

function guessMediaType(file: File): MediaType | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

/** Load an ad for a customer and choose which areas (groups of tuk-tuks) it plays in. */
export function AdForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [advertiserName, setAdvertiserName] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(8)
  const [isActive, setIsActive] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [existingAd, setExistingAd] = useState<Ad | null>(null)
  const [clientId, setClientId] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [groups, setGroups] = useState<TuktukGroup[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    Promise.all([listGroups(), listAgreements()])
      .then(([g, agreements]) => {
        setGroups(g)
        // Signed customers, newest first, each once.
        const seen = new Map<string, Client>()
        for (const a of agreements) if (!seen.has(a.client.id)) seen.set(a.client.id, a.client)
        setClients([...seen.values()])
      })
      .catch((err) => console.error('[AdForm] failed to load areas / customers', err))
  }, [])

  useEffect(() => {
    if (!id) return
    const load = async () => {
      if (!isSupabaseConfigured) {
        const demoAd = DEMO_ADS.find((a) => a.id === id)
        if (!demoAd) {
          setError('Demo ad not found')
          setLoading(false)
          return
        }
        setExistingAd(demoAd)
        setTitle(demoAd.title)
        setAdvertiserName(demoAd.advertiser_name ?? '')
        setDurationSeconds(demoAd.duration_seconds)
        setIsActive(demoAd.is_active)
        setStartDate(demoAd.start_date ?? '')
        setEndDate(demoAd.end_date ?? '')
        setLoading(false)
        return
      }
      const [{ data: ad, error: adErr }, { data: groupAssignments }] = await Promise.all([
        supabase.from('creatives').select('*').eq('id', id).single(),
        supabase.from('ad_group_assignments').select('group_id').eq('ad_id', id),
      ])
      if (adErr || !ad) {
        setError(adErr?.message ?? 'Ad not found')
        setLoading(false)
        return
      }
      setExistingAd(ad as Ad)
      setTitle(ad.title)
      setAdvertiserName(ad.advertiser_name ?? '')
      setDurationSeconds(ad.duration_seconds)
      setIsActive(ad.is_active)
      setStartDate(ad.start_date ?? '')
      setEndDate(ad.end_date ?? '')
      setClientId(ad.client_id ?? '')
      setSelectedGroups(new Set((groupAssignments ?? []).map((g) => g.group_id)))
      setLoading(false)
    }
    load()
  }, [id])

  const pickClient = (id: string) => {
    setClientId(id)
    const c = clients.find((x) => x.id === id)
    if (c) setAdvertiserName(c.company_name || c.legal_name)
  }

  const toggleGroup = (groupId: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setError(null)

    if (!isSupabaseConfigured) {
      setError('Demo mode — connect Supabase (see README) to actually save ads.')
      return
    }

    if (!isEdit && !file) {
      setError('Please choose an image or video file.')
      return
    }

    setSaving(true)
    try {
      let mediaPath = existingAd?.media_path ?? ''
      let mediaUrl = existingAd?.media_url ?? ''
      let mediaType: MediaType = existingAd?.media_type ?? 'image'

      if (file) {
        const type = guessMediaType(file)
        if (!type) throw new Error('File must be an image or video.')
        mediaType = type
        const ext = file.name.split('.').pop() || (type === 'image' ? 'jpg' : 'mp4')
        mediaPath = `${profile.id}/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .upload(mediaPath, file, { cacheControl: '31536000', upsert: false })
        if (uploadError) throw uploadError
        mediaUrl = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(mediaPath).data.publicUrl

        // Replacing the file on an existing ad — remove the old object.
        if (existingAd && existingAd.media_path && existingAd.media_path !== mediaPath) {
          await supabase.storage.from(MEDIA_BUCKET).remove([existingAd.media_path])
        }
      }

      const payload = {
        title,
        advertiser_name: advertiserName || null,
        media_path: mediaPath,
        media_url: mediaUrl,
        media_type: mediaType,
        duration_seconds: durationSeconds,
        is_active: isActive,
        start_date: startDate || null,
        end_date: endDate || null,
        client_id: clientId || null,
      }

      let adId = existingAd?.id
      if (isEdit && adId) {
        const { error: updateError } = await supabase
          .from('creatives')
          .update(payload)
          .eq('id', adId)
        if (updateError) throw updateError
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('creatives')
          .insert({ ...payload, customer_id: profile.id })
          .select()
          .single()
        if (insertError) throw insertError
        adId = inserted.id
      }

      if (!adId) throw new Error('Missing ad id after save.')

      // Sync area (group) assignments: remove unselected, add newly selected.
      const { data: currentGroups } = await supabase
        .from('ad_group_assignments')
        .select('id, group_id')
        .eq('ad_id', adId)

      const currentGroupIds = new Set((currentGroups ?? []).map((g) => g.group_id))
      const groupsToRemove = (currentGroups ?? [])
        .filter((g) => !selectedGroups.has(g.group_id))
        .map((g) => g.id)
      const groupsToAdd = Array.from(selectedGroups).filter((gid) => !currentGroupIds.has(gid))

      if (groupsToRemove.length) {
        const { error: delErr } = await supabase
          .from('ad_group_assignments')
          .delete()
          .in('id', groupsToRemove)
        if (delErr) throw delErr
      }
      if (groupsToAdd.length) {
        const { error: addErr } = await supabase
          .from('ad_group_assignments')
          .insert(groupsToAdd.map((group_id) => ({ ad_id: adId, group_id })))
        if (addErr) throw addErr
      }

      navigate('/admin/ads')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-zinc-500">Loading…</p>

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold text-white">
        {isEdit ? 'Edit ad' : 'Load new ad'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Title</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Customer</label>
          <select
            value={clientId}
            onChange={(e) => pickClient(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
          >
            <option value="">— Choose a signed customer —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || c.legal_name}
              </option>
            ))}
          </select>
          {!clientId && (
            <input
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              placeholder="…or type the advertiser's name"
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
            />
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            {isEdit ? 'Replace media (optional)' : 'Media file (image or video)'}
          </label>
          {existingAd && (
            <div className="mb-2 aspect-video w-48 overflow-hidden rounded-lg bg-black">
              {existingAd.media_type === 'video' ? (
                <video src={existingAd.media_url} className="h-full w-full object-cover" muted />
              ) : (
                <img src={existingAd.media_url} className="h-full w-full object-cover" alt="" />
              )}
            </div>
          )}
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-zinc-700"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Image duration (seconds)
            </label>
            <input
              type="number"
              min={2}
              max={120}
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
            />
            <p className="mt-1 text-xs text-zinc-500">Ignored for video — plays for its own length.</p>
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input
              id="active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="active" className="text-sm text-zinc-300">
              Active (eligible to play)
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Start date (optional)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              End date (optional)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-zinc-400">Show in areas</label>
          <p className="mb-2 text-xs text-zinc-500">
            Plays on every tuk-tuk in the ticked areas — including ones added to the area later.
          </p>
          {groups.length === 0 ? (
            <p className="text-sm text-zinc-500">No areas set up yet — a main admin adds them under Tuk-tuks & areas.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const isSelected = selectedGroups.has(g.id)
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      isSelected
                        ? 'border-brand-400 bg-brand-500/20 text-brand-200'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {isSelected ? '✓ ' : ''}
                    {g.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-on-accent hover:bg-brand-400 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Load ad'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/ads')}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
