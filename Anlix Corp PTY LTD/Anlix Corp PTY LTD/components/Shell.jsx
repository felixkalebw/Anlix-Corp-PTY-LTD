'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useApp } from './Store'
import { supabase } from '@/lib/supabase'

const NAV = [['/', 'Dashboard'], ['/orders', 'Orders'], ['/new', 'New order'], ['/payments', 'Payments'], ['/costing', 'Costing and prices'], ['/overheads', 'Overheads'], ['/audit', 'Audit log'], ['/ai', 'AI assistant']]

function SignIn() {
  const [email, setEmail] = useState(''), [pass, setPass] = useState(''), [err, setErr] = useState('')
  const go = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
    if (error) setErr(error.message)
  }
  return (
    <main className="main" style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1>Anlix Corp tracker</h1>
      <form className="card" onSubmit={go}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label style={{ marginTop: 10 }}>Password<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required /></label>
        {err && <div className="note w">{err}</div>}
        <p><button className="btn" type="submit">Sign in</button></p>
      </form>
    </main>
  )
}

export default function Shell({ children }) {
  const { cloud, session, sync, ready } = useApp()
  const path = usePathname()
  if (cloud && !session) return <SignIn />
  return (
    <div className="app">
      <nav className="side" aria-label="Main">
        <div className="brand">Anlix Corp</div>
        {NAV.map(([h, t]) => (
          <Link key={h} href={h} className={'nv' + (path === h || (h === '/orders' && path.startsWith('/orders/')) ? ' on' : '')}>{t}</Link>
        ))}
        <div className="sub" style={{ padding: '12px', color: 'var(--sink)' }}>{sync}</div>
        {cloud && session && <button className="nv" onClick={() => supabase.auth.signOut()}>Sign out</button>}
      </nav>
      <main className="main">{ready && children}</main>
    </div>
  )
}
