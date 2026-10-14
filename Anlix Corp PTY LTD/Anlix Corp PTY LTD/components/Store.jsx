'use client'
import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { initial, reduce } from '@/lib/model'
import { supabase } from '@/lib/supabase'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)
const KEY = 'anlix-tracker-next'

export function Provider({ children }) {
  const [S, dispatch] = useReducer(reduce, null, initial)
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(supabase ? null : 'admin')
  const [sync, setSync] = useState(supabase ? 'Signed out' : 'Local only')
  const pulled = useRef(false)
  const timer = useRef()

  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) dispatch({ type: 'load', state: JSON.parse(s) }) } catch {}
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
      pulled.current = !error
      setSync(error ? 'Could not load shared data: ' + error.message : 'Synced')
    })
  }, [session])

  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(KEY, JSON.stringify(S)) } catch {}
    if (!supabase || !session || !pulled.current) return
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSync('Saving…')
      const { error } = await supabase.from('anlix_app_state').upsert(
        { id: 1, state: S, updated_at: new Date().toISOString(), updated_by: session.user.id }, { onConflict: 'id' })
      setSync(error ? 'Save failed: ' + error.message : 'Synced')
    }, 1500)
  }, [S])

  return <Ctx.Provider value={{ S, dispatch, ready, session, sync, role, canEdit: role === 'admin', cloud: !!supabase }}>{children}</Ctx.Provider>
}
