'use client'
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { initial, reduce } from '@/lib/model'
import { supabase } from '@/lib/supabase'
import { useAuth, CACHE_KEY } from './AuthProvider'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function Provider({ children }) {
  const [S, rawDispatch] = useReducer(reduce, null, initial)
  const auth = useAuth()
  const superAdmin = !!auth && auth.role === 'super_admin'
  // Deleting a job card is for the super admin only. Anyone else's delete request is dropped here.
  const dispatch = useCallback((a) => { if (a && a.type === 'delOrder' && !superAdmin) return; rawDispatch(a && a.type === 'delOrder' ? { ...a, by: (auth.user && auth.user.email) || a.by } : a) }, [superAdmin, auth])
  const who = (auth && auth.user && ((auth.user.user_metadata && auth.user.user_metadata.full_name) || auth.user.email)) || 'Unknown user'
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(supabase ? null : 'admin')
  const [sync, setSync] = useState(supabase ? 'Signed out' : 'Local only')
  const pulled = useRef(false)
  const timer = useRef()

  useEffect(() => {
    // Signed-in (cloud) mode keeps nothing in this browser: the shared database is the only copy.
    // Local-only mode has no server, so it still saves to this browser.
    try {
      if (supabase) localStorage.removeItem(CACHE_KEY)
      else { const s = localStorage.getItem(CACHE_KEY); if (s) dispatch({ type: 'load', state: JSON.parse(s) }) }
    } catch {}
    setReady(true)
  }, [])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) { pulled.current = false; return }
    supabase.from('staff_members').select('role').eq('user_id', session.user.id).maybeSingle().then(({ data }) => setRole(data?.role || 'viewer'))
    supabase.from('anlix_app_state').select('state').eq('id', 1).maybeSingle().then(({ data, error }) => {
      if (data?.state) dispatch({ type: 'load', state: data.state })
      // The name on every audit entry is the person who is really signed in, not a name picked from a list.
      dispatch({ type: 'user', user: who })
      pulled.current = !error
      setSync(error ? 'Could not load shared data: ' + error.message : 'Synced')
    })
  }, [session])

  useEffect(() => {
    if (!ready) return
    if (!supabase) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(S)) } catch {} return }
    if (!session || !pulled.current) return
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSync('Saving…')
      const { error } = await supabase.from('anlix_app_state').upsert(
        { id: 1, state: S, updated_at: new Date().toISOString(), updated_by: session.user.id }, { onConflict: 'id' })
      setSync(error ? 'Save failed: ' + error.message : 'Synced')
    }, 1500)
  }, [S])

  return <Ctx.Provider value={{ S, dispatch, ready, session, sync, role, canEdit: role === 'admin', superAdmin, cloud: !!supabase }}>{children}</Ctx.Provider>
}
