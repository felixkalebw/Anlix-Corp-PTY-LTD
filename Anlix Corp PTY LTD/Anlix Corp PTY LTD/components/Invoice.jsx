'use client'
import { Fragment, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useApp } from './Store'
import { TODAY, ONE, calc, unit, phase, lineNoun } from '@/lib/model'

// Payment details printed on every invoice and quotation
export const PAYMENT = ['MyZaka: 76675006', 'Smega: 73397584', 'Account name (MyZaka and Smega): Andrew Kale', 'Or E-wallet: 76 675 006']

const P = (n) => 'P' + (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const D = (s) => {
  if (!s) return ''
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s)
  return isNaN(d) ? String(s) : d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'long' }) + ' ' + d.getFullYear()
}

// An order is a GPO order when it carries the gpo flag (set on the New order screen).
// Until the flag is stored, a company or customer name containing "GPO" is also treated as one.
export const isGpo = (o) => !!o.gpo || /\bGPO\b/i.test(`${o.ent || ''} ${o.placed || ''}`)

// The invoice is only produced once the job card is completed.
export const isCompleted = (S, o) => !!o.closed || phase(S, o) === 'Completed'

export function invoiceStatus(o, c) {
  const paid = Math.min(Math.max(c.paid, 0), c.net)
  const bal = c.net - paid
  const last = [...(o.pays || [])].map((p) => p.d).sort().pop() || ''
  if (c.net > 0 && bal <= 0.005) return { label: 'FULLY PAID', full: true, paid, bal: 0, last, note: `Payment of ${P(paid)} received in full${last ? ' on ' + D(last) : ''}.`, tail: 'This invoice is settled in full.' }
  if (paid <= 0.005 && isGpo(o)) return { label: 'FULL AMOUNT OUTSTANDING', paid: 0, bal, last: '', note: `GPO order: payment of ${P(bal)} is pending.`, tail: `Full amount of ${P(bal)} is still outstanding.` }
  if (paid <= 0.005) return { label: 'BALANCE DUE', paid: 0, bal, last: '', note: 'No payment has been received yet.', tail: `Full amount of ${P(bal)} is still outstanding.` }
  return { label: 'BALANCE DUE', paid, bal, last, note: `Part payment of ${P(paid)} received${last ? ' on ' + D(last) : ''}.`, tail: `Remaining balance of ${P(bal)} is still outstanding.` }
}

const Logo = () => (
  <img src="/logo.png" alt="Anlix Corp logo" width="270" height="99" style={{ display: 'block', width: 270, height: 'auto' }} />
)
const Stamp = () => (
  <img src="/stamp.png" alt="Anlix Corp stamp" width="190" height="190" style={{ display: 'block', width: 190, height: 190, transform: 'rotate(-6deg)' }} />
)

const CSS = `
.inv-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.inv-wrap{position:relative;margin:0 auto}
.inv-sheet{width:794px;min-height:1123px;background:#fff;color:#000;padding:60px 60px 34px;display:flex;flex-direction:column;box-shadow:0 2px 14px rgba(0,0,0,.18);transform-origin:top left;position:absolute;top:0;left:0;font-family:Helvetica,Arial,sans-serif;line-height:1.4}
.inv-sheet *{box-sizing:border-box}
.inv-top{display:flex;justify-content:space-between;align-items:flex-start}
.inv-title{font-size:42px;font-weight:700;letter-spacing:-.5px;margin-top:6px}
.inv-meta{display:flex;justify-content:space-between;margin-top:34px;font-size:13.5px;line-height:1.55}
.inv-meta dl{margin:0;display:grid;grid-template-columns:auto auto;gap:0 14px}
.inv-meta dt{font-weight:700}.inv-meta dd{margin:0}
.inv-bill{margin-top:34px;border-bottom:1px solid #000;padding-bottom:6px;font-weight:700;font-size:12.5px}
.inv-to{margin-top:12px;font-size:13.5px;line-height:1.55}
.inv-sheet table{width:100%;border-collapse:collapse;margin-top:36px;font-size:13.5px}
.inv-sheet th{background:#000;color:#fff;text-align:left;padding:9px 12px}
.inv-sheet td{padding:10px 12px;border-bottom:1px solid #000;color:#000}
.inv-sheet th:nth-child(n+2),.inv-sheet td:nth-child(n+2){text-align:right}
.inv-tot{margin:14px 0 0 auto;width:290px;font-size:13.5px}
.inv-tot div{display:flex;justify-content:space-between;padding:3px 12px}
.inv-tot .bal{border-top:1px solid #000;margin-top:8px;padding-top:9px;font-weight:700}
.inv-notes{margin-top:44px;font-size:13.5px;line-height:1.6}
.inv-stamp{display:flex;justify-content:flex-end;margin-top:14px;padding-right:16px}
.inv-pay{margin-top:22px;font-size:13.5px;line-height:1.6}
.inv-foot{margin-top:auto;border-top:1px solid #000;padding-top:9px;text-align:center;font-size:10.5px}
@media print{
 .inv-sheet img{-webkit-print-color-adjust:exact;print-color-adjust:exact}
 @page{size:A4;margin:0}
 body *{visibility:hidden}
 .inv-wrap,.inv-wrap *{visibility:visible}
 .inv-wrap{position:absolute!important;left:0;top:0;width:210mm!important;height:auto!important}
 .inv-sheet{box-shadow:none;transform:none!important;width:210mm;min-height:297mm;position:relative}
}`

// One line per item, size and colour: quantity only, no player names or numbers
function groupLines(S, o, c) {
  const ix = (n) => { const i = S.sizes.findIndex((z) => z.n === n); return i < 0 ? 999 : i }
  const map = new Map()
  o.lines.forEach((l) => {
    const u = unit(S, l, c.q), col = String(l.colour || '').trim()
    const noun = lineNoun(S, l), key = [col.toLowerCase(), noun, l.s, u.price].join('|')
    const g = map.get(key) || { col, noun, s: l.s === ONE ? '' : l.s, p: u.price, q: 0 }
    g.q += +l.q || 0
    map.set(key, g)
  })
  return [...map.values()]
    .sort((a, b) => ix(a.s) - ix(b.s) || a.col.localeCompare(b.col))
    .map((g) => ({ d: [g.col, g.noun, g.s ? `(${g.s})` : ''].filter(Boolean).join(' '), q: g.q, p: g.p, a: g.q * g.p }))
}

// The one template used by both the invoice and the quotation
function Sheet({ title, sub, back, meta, to, rows, totals, notes }) {
  const wrap = useRef(null), sheet = useRef(null)
  const [k, setK] = useState({ s: 1, h: 1123 })
  useEffect(() => {
    const fit = () => {
      if (!wrap.current?.parentElement || !sheet.current) return
      const s = Math.min(1, wrap.current.parentElement.clientWidth / 794)
      const h = sheet.current.offsetHeight * s
      setK((p) => (Math.abs(p.s - s) < 0.001 && Math.abs(p.h - h) < 1 ? p : { s, h }))
    }
    fit(); addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  })
  return (
    <>
      <style>{CSS}</style>
      <div className="inv-bar">
        <div><h1 style={{ margin: 0 }}>{title.page}</h1><div className="sub">{sub}</div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{back}<button className="btn" onClick={() => window.print()}>Print or save as PDF</button></div>
      </div>
      <div className="inv-wrap" ref={wrap} style={{ width: 794 * k.s, height: k.h }}>
        <div className="inv-sheet" ref={sheet} style={{ transform: `scale(${k.s})` }}>
          <div className="inv-top"><Logo /><div className="inv-title">{title.sheet}</div></div>
          <div className="inv-meta">
            <div><strong>Anlix Corp (Pty) Ltd</strong><br />Tlokweng, Gaborone, Botswana<br />Tel: 76 675 006<br />Email: anlixbw@gmail.com</div>
            <dl>{meta.map(([a, b, bold]) => <Fragment key={a}><dt>{a}</dt><dd>{bold ? <strong>{b}</strong> : b}</dd></Fragment>)}</dl>
          </div>
          <div className="inv-bill">{to.label}</div>
          <div className="inv-to"><strong>{to.name}</strong><br />{to.ent}{to.phone ? <><br />Tel: {to.phone}</> : null}</div>
          <table>
            <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{r.d}</td><td>{r.q}</td><td>{P(r.p)}</td><td>{P(r.a)}</td></tr>)}</tbody>
          </table>
          <div className="inv-tot">{totals.map(([a, b, cls]) => <div key={a} className={cls || ''}><span>{a}</span><span>{b}</span></div>)}</div>
          <div className="inv-notes">{notes}</div>
          <div className="inv-pay"><strong>Payment details</strong>{PAYMENT.map((l) => <div key={l}>{l}</div>)}</div>
          <div className="inv-stamp"><Stamp /></div>
          <div className="inv-foot">Anlix Corp (Pty) Ltd &nbsp;|&nbsp; anlixbw@gmail.com &nbsp;|&nbsp; 76 675 006</div>
        </div>
      </div>
    </>
  )
}

export function Invoice() {
  const { jc } = useParams()
  const { S } = useApp()
  const o = S.orders.find((x) => x.jc === decodeURIComponent(jc))
  if (!o) return (<div className="top"><h1>Job card not found</h1><Link href="/orders">Back to orders</Link></div>)
  const back = <Link href={'/orders/' + o.jc}>Back to job card {o.jc}</Link>
  if (!isCompleted(S, o)) return (
    <>
      <div className="top"><div><h1>Invoice {o.inv}</h1><div className="sub">Job card {o.jc}</div></div></div>
      <div className="card"><div className="note w">The invoice is produced when the job card is completed. This order is currently: {phase(S, o)}.</div><p>{back}</p></div>
    </>
  )
  const c = calc(S, o), st = invoiceStatus(o, c)
  const date = o.closed?.at ? String(o.closed.at).slice(0, 10) : TODAY
  const meta = [['Invoice No:', o.inv], ['Date:', D(date)]]
  if (st.paid > 0) meta.push([st.bal > 0 ? 'Part Paid:' : 'Paid:', D(st.last)])
  meta.push(['Job Card:', o.jc], ['Status:', st.label, true])
  const totals = [['Subtotal', P(c.sub)]]
  if (c.d > 0) totals.push(['Discount', '-' + P(c.d)], ['Net Total', P(c.net)])
  if (st.paid > 0) totals.push(['Amount Paid', '-' + P(st.paid)])
  totals.push(['Balance Due', P(st.bal), 'bal'])
  return (
    <Sheet title={{ page: 'Invoice ' + o.inv, sheet: 'INVOICE' }} sub={'Created from job card ' + o.jc} back={back}
      meta={meta} to={{ label: 'BILLED TO', name: o.placed, ent: o.ent, phone: o.phone }}
      rows={groupLines(S, o, c)} totals={totals}
      notes={<>{st.note}<br /><strong>{st.tail}</strong><br />Thank you for your business.</>} />
  )
}

// Quotation: same template, prices come from the tracker's size prices and the MOQ rule (S.thr)
export function Quotation() {
  const { jc } = useParams()
  const { S } = useApp()
  const o = S.orders.find((x) => x.jc === decodeURIComponent(jc))
  if (!o) return (<div className="top"><h1>Job card not found</h1><Link href="/orders">Back to orders</Link></div>)
  const c = calc(S, o)
  const back = <Link href={'/orders/' + o.jc}>Back to job card {o.jc}</Link>
  const totals = [['Subtotal', P(c.sub)]]
  if (c.d > 0) totals.push(['Discount', '-' + P(c.d)])
  totals.push(['Total', P(c.net), 'bal'])
  const terms = c.q < S.thr
    ? `Orders under ${S.thr} shirts are priced at the standard rate. Full payment of ${P(c.req)} is required before production.`
    : `Orders of ${S.thr} shirts or more are priced at the bulk rate. A ${S.dep}% deposit of ${P(c.req)} is required before production.`
  return (
    <Sheet title={{ page: 'Quotation ' + o.qt, sheet: 'QUOTATION' }} sub={'Job card ' + o.jc} back={back}
      meta={[['Quotation No:', o.qt], ['Date:', D(o.date)], ['Job Card:', o.jc], ['Total Shirts:', String(c.q)]]}
      to={{ label: 'PREPARED FOR', name: o.placed, ent: o.ent, phone: o.phone }}
      rows={groupLines(S, o, c)} totals={totals}
      notes={<>{terms}<br />Thank you for your business.</>} />
  )
}
