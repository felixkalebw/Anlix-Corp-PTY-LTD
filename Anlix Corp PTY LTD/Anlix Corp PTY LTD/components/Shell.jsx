'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useApp } from './Store'
import { useAuth } from './AuthProvider'

// [address, label, permission needed to see it]
const NAV = [
  ['/', 'Dashboard', 'reports.view'],
  ['/orders', 'Orders', 'orders.view'],
  ['/new', 'New order', 'orders.edit'],
  ['/payments', 'Payments', 'payments.view'],
  ['/documents', 'Quotations & invoices', 'documents.view'],
  ['/costing', 'Costing and prices', 'reports.view'],
  ['/overheads', 'Overheads', 'finance.view'],
  ['/audit', 'Audit log', 'audit.view'],
  ['/ai', 'AI assistant', 'ai.use'],
]

export default function Shell({ children }) {
  const { sync, ready } = useApp()
  const { user, access, can, signOut } = useAuth() // sign-in itself is handled by AuthProvider
  const path = usePathname()
  const isOn = (h) => (h === '/' ? path === '/' : path === h || path.startsWith(h + '/'))
  const need = (NAV.find(([h]) => isOn(h)) || [])[2]
  const blocked = need && !can(need)

  return (
    <div className="app">
      <nav className="side" aria-label="Main">
        <div className="brand">Anlix Corp</div>
        {NAV.filter(([, , perm]) => can(perm)).map(([h, t]) => (
          <Link key={h} href={h} className={'nv' + (isOn(h) ? ' on' : '')}>{t}</Link>
        ))}
        {can('staff.manage') && user && (
          <Link href="/admin/staff" className={'nv' + (path.startsWith('/admin') ? ' on' : '')}>Staff access</Link>
        )}
        <div className="sub" style={{ padding: '12px', color: 'var(--sink)' }}>
          {sync}
          {user && <div style={{ marginTop: 6 }}>{access?.full_name || user.email} · {access?.role}</div>}
        </div>
        {user && <button className="nv" onClick={signOut}>Sign out</button>}
      </nav>
      <main className="main">
        {blocked ? (
          <div className="card">
            <h1>No access</h1>
            <p>Your role doesn't include this page. Choose another one from the menu.</p>
          </div>
        ) : (
          ready && children
        )}
      </main>
    </div>
  )
}
