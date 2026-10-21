import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { DEMO_PROFILE } from '../lib/demoData'
import { recordSignOut, sendHeartbeat } from '../lib/staffApi'
import type { Profile } from '../types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const HEARTBEAT_MS = 60_000

/** Where each role lands after signing in. */
export function homeFor(profile: Profile | null) {
  return profile?.role === 'sales' ? '/sales' : '/admin'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // No backend connected yet — run fully as a self-contained demo.
      setProfile(DEMO_PROFILE)
      return
    }
    if (!session) {
      setProfile(null)
      setProfileLoading(false)
      return
    }
    setProfileLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        setProfileLoading(false)
        if (error) {
          console.error('[Auth] failed to load profile', error)
          return
        }
        const p = data as Profile
        if (p.active === false) {
          // Deactivated from Admin → Sales team: drop the session.
          void supabase.auth.signOut()
          return
        }
        setProfile(p)
      })
  }, [session])

  // Staff heartbeat: powers "online now" and the online-hours log on Admin → Sales team.
  const isStaff = profile?.role === 'admin' || profile?.role === 'sales'
  useEffect(() => {
    if (!isSupabaseConfigured || !isStaff) return
    const beat = () => {
      if (document.visibilityState === 'visible') void sendHeartbeat()
    }
    beat()
    const timer = window.setInterval(beat, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', beat)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [isStaff, profile?.id])

  const signOut = async () => {
    await recordSignOut().catch(() => {})
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading: loading || profileLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
