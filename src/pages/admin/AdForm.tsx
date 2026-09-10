import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { isSupabaseConfigured, supabase, MEDIA_BUCKET } from '../../lib/supabase'
import { DEMO_ADS, demoTuktukIdsForAd } from '../../lib/demoData'
import { listTuktuks } from '../../lib/tuktuksApi'
import { listGroups } from '../../lib/groupsApi'
import { useAuth } from '../../context/AuthContext'
import { TuktukPicker } from '../../components/TuktukPicker'
import type { Ad, MediaType, Tuktuk, TuktukGroup } from '../../types'

function guessMediaType(file: File): MediaType | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

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
  const [selectedTuktuks, setSelectedTuktuks] = useState<Set<number>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [tuktuks, setTuktuks] = useState<Tuktuk[]>([])
  const [groups, setGroups] = useState<TuktukGroup[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(isEdit)

  useEffect(() => {
    if (!isEdit) return
    Promise.all([listTuktuks(), listGroups()])
      .then(([t, g]) => {
        setTuktuks(t)
        setGroups(g)
      })
      .catch((err) => console.error('[AdForm] failed to load fleet', err))
  }, [isEdit])

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
        setSelectedTuktuks(new Set(demoTuktukIdsForAd(demoAd.id)))
        setLoading(false)
        return
      }
      const [{ data: ad, error: adErr }, { data: assignments }, { data: groupAssignments }] =
        await Promise.all([
          supabase.from('creatives').select('*').eq('id', id).single(),
          supabase.from('ad_assignments').select('tuktuk_id').eq('ad_id', id),
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
      setSelectedTuktuks(new Set((assignments ?? []).map((a) => a.tuktuk_id)))
      setSelectedGroups(new Set((groupAssignments ?? []).map((g) => g.group_id)))
      setLoading(false)
    }
    load()
  }, [id])

  const toggleTuktuk = (tuktukId: number) => {
    setSelectedTuktuks((prev) => {
      const next = new Set(prev)
      if (next.has(tuktukId)) next.delete(tuktukId)
      else next.add(tuktukId)
      return next
    })
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

      // Sync individual tuk-tuk assignments: remove unselected, add newly selected.
      const { data: current } = await supabase
        .from('ad_assignments')
        .select('id, tuktuk_id')
        .eq('ad_id', adId)

      const currentIds = new Set((current ?? []).map((a) => a.tuktuk_id))
      const toRemove = (current ?? [])
        .filter((a) => !selectedTuktuks.has(a.tuktuk_id))
        .map((a) => a.id)
      const toAdd = Array.from(selectedTuktuks).filter((tuktukId) => !currentIds.has(tuktukId))

      if (toRemove.length) {
        const { error: delErr } = await supabase.from('ad_assignments').delete().in('id', toRemove)
        if (delErr) throw delErr
      }
      if (toAdd.length) {
        const { error: addErr } = await supabase
          .from('ad_assignments')
          .insert(toAdd.map((tuktuk_id) => ({ ad_id: adId, tuktuk_id })))
        if (addErr) throw addErr
      }

      // Sync group assignments the same way.
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
        {isEdit ? 'Edit ad' : 'Upload new ad'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">Title</label>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Advertiser / customer name (optional)
          </label>
          <input
            value={advertiserName}
            onChange={(e) => setAdvertiserName(e.target.value)}
            placeholder="Who this ad is for, e.g. Mama Thandi's Kitchen"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
          />
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
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
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
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
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
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-400"
            />
          </div>
        </div>

        {isEdit && (
          <>
            {groups.length > 0 && (
              <div>
                <label className="mb-2 block text-xs font-medium text-zinc-400">
                  Go live on groups
                </label>
                <p className="mb-2 text-xs text-zinc-500">
                  Every tuk-tuk currently in a ticked group shows this ad — including ones added to
                  the group later.
                </p>
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
                            ? 'border-purple-400 bg-purple-500/20 text-purple-200'
                            : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                        }`}
                      >
                        {g.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs font-medium text-zinc-400">
                Go live on individual tuk-tuks
              </label>
              <p className="mb-2 text-xs text-zinc-500">
                Use this for one-off tuk-tuks outside any group. Inactive tuk-tuks can't be
                selected.
              </p>
              <TuktukPicker tuktuks={tuktuks} selected={selectedTuktuks} onToggle={toggleTuktuk} />
            </div>
          </>
        )}

        {!isEdit && (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
            This ad won't play anywhere yet — after uploading, open it from the Ads list to choose
            which tuk-tuks or groups it goes live on.
          </p>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-400 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Upload ad'}
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
