'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell, LabelList, ComposedChart, Line } from 'recharts'
import { useApp } from './Store'
import { supabase } from '@/lib/supabase'
import { isCompleted } from './Invoice'
import { TODAY, ONE, f2, f0, pc, fd, sum, sz, cost, price, qty, calc, unit, alerts, snapshot, costParts, jobNo, materialPlan, tolPct, COST_N, STAGES, mkStages, isDone, progress, overdue, phase, phaseTag, mkLine, lineH, lineLabel, prodOf, isFixed, typeGaps, typeMult, baseRates } from '@/lib/model'

const Head = ({ title, sub }) => {
  const { S, dispatch } = useApp()
  return (
    <div className="top">
      <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      <label>Signed in as
        <select value={S.user} onChange={(e) => dispatch({ type: 'user', user: e.target.value })}><option>Staff 1</option><option>Staff 2</option></select>
      </label>
    </div>
  )
}
const Table = ({ head, right = 99, children }) => (
  <div className="tw"><table>
    <thead><tr>{head.map((h, i) => <th key={h + i} className={i >= right ? 'r' : ''}>{h}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table></div>
)
const Tag = ({ o }) => { const { S } = useApp(); const p = phase(S, o); return <span className={'tag ' + phaseTag(p)}>{p}</span> }
const Num = ({ label, value, onSave, ro }) => (
  <label>{label}<input type="number" step="any" min="0" disabled={ro} defaultValue={value} key={value} onBlur={(e) => onSave(parseFloat(e.target.value) || 0)} /></label>
)

// Number box where blank means "use the default". The default is shown as the placeholder.
const Ov = ({ value, ph, onSave, ro, w = 84, label }) => (
  <input type="number" step="any" min="0" disabled={ro} defaultValue={value ?? ''} key={String(value ?? '')} placeholder={ph} aria-label={label} style={{ width: w, margin: '0 0 0 auto' }}
    onBlur={(e) => { const raw = e.target.value.trim(); if (raw === String(value ?? '')) return; if (raw === '') return onSave(''); const v = parseFloat(raw); if (v >= 0) onSave(v) }} />
)
const tidy = (n) => String(+(+n).toFixed(3))

function OrdersTable({ list }) {
  const { S } = useApp()
  return (
    <Table head={['Job card', 'Date', 'Due', 'Placed by', 'Entity', 'Shirts', 'Net total', 'Balance', 'Progress', 'Status', 'Invoice']} right={5}>
      {list.map((o) => { const c = calc(S, o), p = progress(o); return (
        <tr key={o.jc}><td><Link href={'/orders/' + o.jc}>{o.jc}</Link></td><td>{fd(o.date)}</td>
          <td style={overdue(o) ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{o.dueDate ? fd(o.dueDate) : '–'}</td><td>{o.placed}</td><td>{o.ent}</td>
          <td className="r">{c.q}</td><td className="r">{f2(c.net)}</td><td className="r">{f2(c.bal)}</td>
          <td style={{ minWidth: 90 }}><div className="mt" title={p + '%'}><div className="mb" style={{ width: p + '%' }} /></div></td><td><Tag o={o} /></td>
          <td>{isCompleted(S, o) ? <Link href={`/orders/${o.jc}/invoice`}>{o.inv}</Link> : '–'}</td></tr>
      ) })}
    </Table>
  )
}

const PBI = ['#01B8AA', '#374649', '#FD625E', '#F2C80F', '#5F6B6D', '#8AD4EB', '#A66999']
const AX = { tick: { fill: 'var(--mut)', fontSize: 12 }, axisLine: { stroke: 'var(--line)' }, tickLine: false }
const TT = { contentStyle: { background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: 6 }, cursor: { fill: 'rgba(128,128,128,.12)' } }
const LBL = { fill: 'var(--ink)', fontSize: 11 }
const Tile = ({ n, title, sub, children }) => (<section className={'pb-tile pb-c' + n}><h3>{title}</h3><div className="pb-sub">{sub || '\u00a0'}</div>{children}</section>)
const Kpi = ({ title, value, sub, n = 2 }) => (<section className={'pb-tile pb-kpi pb-c' + n}><h3>{title}</h3><div className="pb-sub">{sub || '\u00a0'}</div><div className="pb-big">{value}</div></section>)
const Funnel = ({ rows }) => { const mx = Math.max(...rows.map((r) => r.v), 1); return rows.map((r) => (
  <div className="pb-fun" key={r.k}><span>{r.k}</span><div className="mt"><div className="mb" style={{ width: (r.v ? Math.max(3, (r.v / mx) * 100) : 0) + '%' }} /></div><b>{r.v}</b></div>)) }

const RAINBOW = ['#E6007E', '#00A3E0', '#FFC20E', '#2BB673', '#7B4DFF', '#FF6B2C', '#14B8A6', '#EF4444', '#8B5CF6', '#0EA5E9', '#F59E0B', '#10B981', '#EC4899', '#6366F1']
const COL = { rev: '#00A3E0', cost: '#FF6B2C', gp: '#2BB673', net: '#7B4DFF', oh: '#FFC20E', spend: '#E6007E' }
const Kc = ({ title, value, sub, color, dark }) => (
  <section className="pb-tile pb-kpi pb-c2" style={{ background: color, borderColor: color, color: dark ? '#1A1A1A' : '#fff' }}>
    <h3>{title}</h3><div className="pb-sub" style={{ color: dark ? '#3A3000' : 'rgba(255,255,255,.88)' }}>{sub || '\u00a0'}</div>
    <div className="pb-big" style={{ fontSize: 26, fontWeight: 600 }}>{value}</div>
  </section>
)
const isoD = (d) => d.toISOString().slice(0, 10)
// Calendar weeks, Monday to Sunday, cut at the month ends so the weeks add up exactly to the month
function weeksOf(m) {
  const y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1, last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(), out = []
  let st = 1
  while (st <= last) {
    const dt = new Date(Date.UTC(y, mo, st)), dow = (dt.getUTCDay() + 6) % 7, en = Math.min(last, st + (6 - dow))
    out.push({ s: isoD(dt), e: isoD(new Date(Date.UTC(y, mo, en))), a: st, b: en })
    st = en + 1
  }
  return out
}
const kfmt = (v) => 'P' + (Math.abs(v) >= 1000 ? Math.round(v / 100) / 10 + 'k' : Math.round(v))

// ---- One-screen dashboard: every figure that drives a decision fits in the window, no scrolling ----
const pctD = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null)
const shiftDay = (d, n) => isoD(new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5))
const prevMonth = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1)).toISOString().slice(0, 7)
const short = (s, n) => { const t = String(s || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
// Keep the biggest n rows and fold the rest into "Other" so a legend never grows taller than its tile
const topN = (rows, n) => { const s = [...rows].sort((a, b) => b.v - a.v); return s.length <= n ? s : [...s.slice(0, n - 1), { k: 'Other', v: sum(s.slice(n - 1), (x) => x.v) }] }

const YT = ({ x, y, payload, w = 92, size = 12 }) => <text x={x - 4} y={y} dy={4} textAnchor="end" fill="var(--ink)" fontSize={size}>{short(payload.value, Math.floor((w - 6) / (size * 0.74)))}</text>
const jcTip = (l, p) => (p && p[0] && p[0].payload.jc ? p[0].payload.jc + ' · ' + l : l)
const Delta = ({ cur, prev, up = true, vs = 'before' }) => {
  const d = pctD(cur, prev)
  if (d == null || !Number.isFinite(d)) return <span className="dk-d">no earlier figure</span>
  if (Math.abs(d) < 0.5) return <span className="dk-d">level with {vs}</span>
  const good = d > 0 === up
  return <span className={'dk-d ' + (good ? 'gd' : 'bd')}>{d > 0 ? '▲' : '▼'} {Math.abs(d) >= 1000 ? '999+' : Math.abs(d).toFixed(0)}% vs {vs}</span>
}
const Kt = ({ title, value, sub, color, dark, cur, prev, up, vs }) => (
  <section className="dk" style={{ background: color, color: dark ? '#1A1A1A' : '#fff' }}>
    <div className="dk-t">{title}</div><div className="dk-v">{value}</div>
    <div className="dk-s">{prev === undefined ? sub : <Delta cur={cur} prev={prev} up={up} vs={vs} />}</div>
  </section>
)
const Pn = ({ n, title, sub, right, children }) => (
  <section className={'dp dp-c' + n}>
    <header><h3>{title}</h3>{right}<span className="dp-sub">{sub}</span></header>
    <div className="dp-body">{children}</div>
  </section>
)
const Nada = ({ t }) => <div className="dp-none">{t}</div>
const Leg = ({ rows, offset = 0 }) => (
  <div className="dp-leg">{rows.map((r, i) => <div key={r.k}><i style={{ background: RAINBOW[(i + offset) % RAINBOW.length] }} /><span>{r.k}</span><b>{kfmt(r.v)}</b></div>)}</div>
)
const Donut = ({ rows, offset = 0, total, label }) => {
  const t = topN(rows, 4)
  return (
    <div className="dp-donut">
      <div className="dp-dc">
        <ResponsiveContainer width="100%" height="100%"><PieChart>
          <Pie data={t} dataKey="v" nameKey="k" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
            {t.map((x, i) => <Cell key={x.k} fill={RAINBOW[(i + offset) % RAINBOW.length]} />)}</Pie>
          <Tooltip {...TT} formatter={(v) => f2(v)} /></PieChart></ResponsiveContainer>
        <div className="dp-mid"><b>{total}</b><span>{label}</span></div>
      </div>
      <Leg rows={t} offset={offset} />
    </div>
  )
}

const DASH_CSS = `
/* One-screen dashboard: the whole page is exactly the window height, so nothing needs scrolling */
.main.dashmain,.main:has(>.dash){padding:12px 16px;gap:0}
.dash{height:calc(100dvh - 24px);min-height:560px;display:grid;grid-template-rows:auto auto minmax(0,1fr) minmax(0,1fr);gap:10px}
.dash-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.dash-top h1{font-size:20px}
.dash-top .chip{min-height:34px;padding:0 12px;font-size:13px}
.dash-top select{min-height:34px;padding:4px 8px;font-size:13px}
.dash-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.dk{border-radius:10px;padding:8px 12px;min-width:0;display:flex;flex-direction:column;gap:1px}
.dk-t{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dk-v{font-size:clamp(19px,1.9vw,28px);font-weight:700;line-height:1.15;white-space:nowrap}
.dk-s,.dk-d{font-size:11.5px;opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dk-d.bd{background:rgba(0,0,0,.28);color:#fff;border-radius:8px;padding:0 6px;display:inline-block;max-width:100%}
.dash-row{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px;min-height:0}
.dp{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:9px 12px 8px;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.dp>header{display:flex;align-items:baseline;flex-wrap:wrap;gap:0 8px}
.dp h3{margin:0;font-size:14px;font-weight:700}
.dp-sub{flex-basis:100%;order:3;font-size:11.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
.dp>header .dp-tog{margin-left:auto}
.dp-body{flex:1;min-height:0;position:relative}
.dp-c2{grid-column:span 2}.dp-c3{grid-column:span 3}.dp-c6{grid-column:span 6}
.dp-none{height:100%;display:grid;place-items:center;text-align:center;color:var(--mut);font-size:13px;padding:0 8px}
.dp-tog{display:flex;background:var(--bg);border-radius:8px;padding:2px}
.dp-tog button{font:inherit;font-size:12px;font-weight:600;border:0;background:transparent;color:var(--mut);padding:3px 10px;border-radius:6px;cursor:pointer}
.dp-tog button.on{background:var(--card);color:var(--acc);box-shadow:0 1px 3px rgba(0,0,0,.15)}
.dp-act{height:100%;display:grid;grid-auto-rows:minmax(0,1fr);gap:4px}
.act{display:flex;align-items:center;justify-content:space-between;gap:8px;border-radius:8px;padding:0 10px;text-decoration:none;font-size:13px;font-weight:500;min-height:0;border-left:4px solid var(--line);background:var(--bg);color:var(--ink)}
.act b{font-size:17px}.act:hover{filter:brightness(.96)}
.act.bad{border-left-color:#C62828;background:#FDE8E8;color:#8E1B1B}.act.warn{border-left-color:#E08A00;background:#FFF1D6;color:#7A4A00}
.act.info{border-left-color:#00A3E0;background:#E1F4FC;color:#075A7A}.act.good{border-left-color:#2BB673;background:#DDF5E8;color:#14633C}
.act.zero{opacity:.55;color:var(--mut)}
.dp-donut{height:100%;display:flex;flex-direction:column;gap:4px}
.dp-dc{flex:1;min-height:0;position:relative}
.dp-mid{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;pointer-events:none;line-height:1.1}
.dp-mid b{display:block;font-size:clamp(13px,1.2vw,18px)}.dp-mid span{font-size:10.5px;color:var(--mut)}
.dp-leg{display:grid;gap:1px;font-size:11.5px}
.dp-leg div{display:flex;align-items:center;gap:5px;min-width:0}.dp-leg i{width:8px;height:8px;border-radius:2px;flex:none}
.dp-leg span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dp-leg b{font-weight:600}
.dp-be{height:100%;display:flex;flex-direction:column;gap:4px}.dp-bc{flex:1;min-height:0;position:relative}
.dp-verdict{font-size:12px;font-weight:600;text-align:center;border-radius:8px;padding:4px 6px}.dp-verdict.ok{background:#DDF5E8;color:#14633C}.dp-verdict.no{background:#FFF1D6;color:#7A4A00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .act.bad{background:#3A1717;color:#FF9B9B}:root:not([data-theme="light"]) .act.warn{background:#3A2A0E;color:#FFC870}:root:not([data-theme="light"]) .act.info{background:#0F2D3A;color:#7FD3F0}:root:not([data-theme="light"]) .act.good{background:#10301F;color:#6FD596}:root:not([data-theme="light"]) .dp-verdict.ok{background:#10301F;color:#6FD596}:root:not([data-theme="light"]) .dp-verdict.no{background:#3A2A0E;color:#FFC870}}
/* Phones and very short windows cannot fit everything at once, so they stack and scroll instead */
@media (max-width:1100px),(max-height:560px){
  .main.dashmain,.main:has(>.dash){padding:12px}.dash{height:auto;min-height:0;display:flex;flex-direction:column}
  .dash-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.dash-row{grid-template-columns:repeat(6,minmax(0,1fr))}
  .dp-c2{grid-column:span 3}.dp-c3,.dp-c6{grid-column:span 6}.dp{min-height:260px}.dp-donut,.dp-be{min-height:230px}
}
@media (max-width:560px){.dash-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.dp-c2{grid-column:span 6}}

.dp-bn{font-size:12px;color:var(--mut);line-height:1.35}.dp-bn b{color:var(--ink)}
`

export function Dashboard() {
  const { S } = useApp()
  const [m, setM] = useState(TODAY.slice(0, 7)), [wk, setWk] = useState(0), [tv, setTv] = useState(null)
  const D = useMemo(() => {
    const W = weeksOf(m), wi = wk > W.length ? 0 : wk
    const r0 = wi ? W[wi - 1].s : W[0].s, r1 = wi ? W[wi - 1].e : W[W.length - 1].e
    const inR = (d, a = r0, b = r1) => d >= a && d <= b
    const cm = new Map(S.orders.map((o) => [o, calc(S, o)])), C = (o) => cm.get(o)
    const pays = S.orders.flatMap((o) => o.pays.map((p) => ({ ...p, jc: o.jc })))
    const months = [...new Set([TODAY.slice(0, 7), m, ...S.orders.map((o) => o.date.slice(0, 7)), ...pays.map((p) => p.d.slice(0, 7)), ...S.over.map((x) => x.d.slice(0, 7))])].sort().reverse()

    // One function gives every headline figure for any date range, so "this period" and "before" are measured the same way
    const per = (a, b) => {
      const ord = S.orders.filter((o) => inR(o.date, a, b)), pys = pays.filter((p) => inR(p.d, a, b)), ovs = S.over.filter((x) => inR(x.d, a, b))
      const rev = sum(pys, (p) => p.amt), cs = sum(ord, (o) => C(o).cs), gp = sum(ord, (o) => C(o).gp), ov = sum(ovs, (x) => x.a)
      return { ord, pys, ovs, rev, cs, gp, ov, net: gp - ov, n: ord.length, shirts: sum(ord, qty) }
    }
    const cur = per(r0, r1)
    let prev
    if (wi) { const len = Math.round((new Date(r1) - new Date(r0)) / 864e5) + 1, p1 = shiftDay(r0, -1); prev = per(shiftDay(p1, -(len - 1)), p1) }
    else { const pw = weeksOf(prevMonth(m)); prev = per(pw[0].s, pw[pw.length - 1].e) }

    const wkData = W.map((w, i) => {
      const a = S.orders.filter((o) => inR(o.date, w.s, w.e)), g = sum(a, (o) => C(o).gp), o2 = sum(S.over.filter((x) => inR(x.d, w.s, w.e)), (x) => x.a)
      return { n: 'Wk ' + (i + 1), Revenue: sum(pays.filter((p) => inR(p.d, w.s, w.e)), (p) => p.amt), 'Production cost': sum(a, (o) => C(o).cs), 'Gross profit': g, 'Net profit': g - o2 }
    })
    const days = []
    for (let t = new Date(r0 + 'T00:00:00Z'); isoD(t) <= r1; t = new Date(t.getTime() + 864e5)) days.push(isoD(t))
    const dayData = days.map((d) => ({ n: String(+d.slice(8)), Revenue: sum(cur.pys.filter((p) => p.d === d), (p) => p.amt), 'Production cost': sum(cur.ord.filter((o) => o.date === d), (o) => C(o).cs), Overheads: sum(cur.ovs.filter((x) => x.d === d), (x) => x.a) }))

    const spend = cur.ord.map((o) => { const c = C(o); return { jc: o.jc, n: short(o.ent || o.placed, 16), 'Production cost': +c.cs.toFixed(2), 'Overhead share': cur.shirts ? +((cur.ov * c.q) / cur.shirts).toFixed(2) : 0 } })
      .sort((a, b) => b['Production cost'] + b['Overhead share'] - a['Production cost'] - a['Overhead share'])
    const comp = costParts(S, cur.ord).comp, split = COST_N.map((k, i) => ({ k, v: comp[i] })).filter((x) => x.v > 0)
    const en = {}; cur.pys.forEach((p) => { const k = p.ent || '–'; en[k] = (en[k] || 0) + p.amt })
    const payers = Object.entries(en).map(([k, v]) => ({ k, v }))

    // Break-even always looks at the whole month, because overheads are a monthly cost
    const mo = S.orders.filter((o) => inR(o.date, W[0].s, W[W.length - 1].e)), sold = sum(mo, qty), tgp = sum(mo, (o) => C(o).gp)
    const ovM = sum(S.over.filter((x) => inR(x.d, W[0].s, W[W.length - 1].e)), (x) => x.a)
    const avg = sold ? tgp / sold : sum(S.sizes, (z) => S.T[z.c][1] - cost(S, z)) / S.sizes.length, be = avg > 0 && ovM > 0 ? Math.ceil(ovM / avg) : 0

    // Money owed across all open orders, biggest first. Overdue ones are marked so they stand out
    const owingAll = S.orders.map((o) => ({ jc: o.jc, n: short(o.ent || o.placed, 16), Balance: +C(o).bal.toFixed(2), late: overdue(o) })).filter((x) => x.Balance > 0.005).sort((a, b) => b.Balance - a.Balance)
    const owed = sum(owingAll, (x) => x.Balance), owedLate = sum(owingAll.filter((x) => x.late), (x) => x.Balance)

    // Which products make money this period (before discounts)
    const pr = {}
    cur.ord.forEach((o) => { const q = C(o).q; o.lines.forEach((l) => { const u = unit(S, l, q), k = l.type || 'T-shirt'; pr[k] = pr[k] || { rev: 0, cost: 0 }; pr[k].rev += l.q * u.price; pr[k].cost += l.q * u.cost }) })
    const prod = Object.entries(pr).map(([k, v]) => ({ n: short(k, 14), Profit: +(v.rev - v.cost).toFixed(2), Margin: v.rev ? (v.rev - v.cost) / v.rev * 100 : 0 })).sort((a, b) => b.Profit - a.Profit)

    // What needs a decision today
    const cnt = { over: 0, wait: 0, art: 0, hold: 0, prod: 0, ready: 0 }
    S.orders.forEach((o) => { const p = phase(S, o); if (overdue(o)) cnt.over++; if (p.startsWith('Awaiting')) cnt.wait++; else if (p === 'Artwork pending') cnt.art++; else if (p === 'Quality hold') cnt.hold++; else if (p === 'In production') cnt.prod++; else if (p === 'Ready for collection') cnt.ready++ })
    return { W, wi, r0, r1, months, cur, prev, wkData, dayData, spend, split, payers, sold, be, ovM, avg, owingAll, owed, owedLate, prod, cnt, alerts: alerts(S).length }
  }, [S, m, wk])

  const { W, wi, months, cur, prev, cnt } = D
  const view = tv || (wi ? 'd' : 'w'), money = (v) => f2(v), vs = wi ? 'last period' : 'last month'
  const pick = (fn) => { fn(); setTv(null) }
  const attention = [
    ['Overdue orders', cnt.over, 'bad', '/orders?f=Overdue'], ['Awaiting deposit or payment', cnt.wait, 'warn', '/orders?f=' + encodeURIComponent('Awaiting deposit or payment')],
    ['Quality hold', cnt.hold, 'bad', '/orders?f=' + encodeURIComponent('Quality hold')], ['Artwork pending', cnt.art, 'warn', '/orders?f=' + encodeURIComponent('Artwork pending')],
    ['In production', cnt.prod, 'info', '/orders?f=' + encodeURIComponent('In production')], ['Ready for collection', cnt.ready, 'good', '/orders?f=' + encodeURIComponent('Ready for collection')],
    ['Pricing and metre alerts', D.alerts, 'warn', '/ai'],
  ]

  return (
    <>
    <style>{DASH_CSS}</style>
    <div className="dash">
      <div className="dash-top">
        <h1>Dashboard</h1>
        <div className="chips">
          <select aria-label="Month" value={m} onChange={(e) => pick(() => { setM(e.target.value); setWk(0) })} style={{ width: 'auto', marginTop: 0 }}>
            {months.map((x) => <option key={x} value={x}>{new Date(x + '-01T00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>)}
          </select>
          {['Whole month', ...W.map((w, i) => `Wk ${i + 1} · ${w.a}–${w.b}`)].map((x, i) => <button key={x} className={'chip' + (wi === i ? ' on' : '')} onClick={() => pick(() => setWk(i))}>{x}</button>)}
        </div>
      </div>

      <div className="dash-kpis">
        <Kt title="Revenue received" value={f0(cur.rev)} color={COL.rev} cur={cur.rev} prev={prev.rev} vs={vs} />
        <Kt title="Production cost" value={f0(cur.cs)} color="#D4460C" cur={cur.cs} prev={prev.cs} up={false} vs={vs} />
        <Kt title="Gross profit" value={f0(cur.gp)} color="#1B8A55" cur={cur.gp} prev={prev.gp} vs={vs} />
        <Kt title="Overheads" value={f0(cur.ov)} color={COL.oh} dark cur={cur.ov} prev={prev.ov} up={false} vs={vs} />
        <Kt title="Net profit" value={f0(cur.net)} color={cur.net < 0 ? '#C62828' : '#6A3FE0'} cur={cur.net} prev={prev.net} vs={vs} />
        <Kt title="Still owed to you" value={f0(D.owed)} color="#C4006C" sub={D.owedLate > 0 ? `${f0(D.owedLate)} is overdue` : `${D.owingAll.length} unpaid orders`} />
      </div>

      <div className="dash-row">
        <Pn n={6} title={view === 'w' ? 'Week by week' : 'Day by day'} sub={view === 'w' ? 'Revenue, cost and profit for each week' : 'Inside the selected period'}
          right={<div className="dp-tog"><button className={view === 'w' ? 'on' : ''} onClick={() => setTv('w')}>Weeks</button><button className={view === 'd' ? 'on' : ''} onClick={() => setTv('d')}>Days</button></div>}>
          <ResponsiveContainer width="100%" height="100%">
            {view === 'w' ? (
              <BarChart data={D.wkData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="n" {...AX} /><YAxis {...AX} width={46} tickFormatter={kfmt} /><Tooltip {...TT} formatter={money} /><Legend iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Revenue" fill={COL.rev} radius={[3, 3, 0, 0]} isAnimationActive={false} /><Bar dataKey="Production cost" fill={COL.cost} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Gross profit" fill={COL.gp} radius={[3, 3, 0, 0]} isAnimationActive={false} /><Bar dataKey="Net profit" fill={COL.net} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart>
            ) : (
              <BarChart data={D.dayData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="n" {...AX} interval={D.dayData.length > 16 ? 1 : 0} /><YAxis {...AX} width={46} tickFormatter={kfmt} /><Tooltip {...TT} formatter={money} labelFormatter={(l) => 'Day ' + l} /><Legend iconSize={9} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Revenue" fill={COL.rev} radius={[2, 2, 0, 0]} isAnimationActive={false} /><Bar dataKey="Production cost" fill={COL.cost} radius={[2, 2, 0, 0]} isAnimationActive={false} /><Bar dataKey="Overheads" fill={COL.oh} radius={[2, 2, 0, 0]} isAnimationActive={false} /></BarChart>
            )}
          </ResponsiveContainer>
        </Pn>

        <Pn n={3} title="Needs your attention" sub="Tap a row to open those orders">
          <div className="dp-act">
            {attention.map(([k, v, tone, href]) => (
              <Link key={k} href={href} className={'act ' + (v ? tone : 'zero')}><span>{k}</span><b>{v}</b></Link>
            ))}
          </div>
        </Pn>

        <Pn n={3} title="Who owes you" sub={D.owingAll.length ? `Top ${Math.min(7, D.owingAll.length)} of ${D.owingAll.length} · red = overdue` : 'All open invoices'}>
          {D.owingAll.length ? (
            <ResponsiveContainer width="100%" height="100%"><BarChart data={D.owingAll.slice(0, 7)} layout="vertical" margin={{ left: 0, right: 38, top: 2, bottom: 2 }}>
              <XAxis type="number" hide /><YAxis type="category" dataKey="n" {...AX} width={104} interval={0} tick={<YT w={104} />} />
              <Tooltip {...TT} formatter={money} labelFormatter={jcTip} />
              <Bar dataKey="Balance" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
                {D.owingAll.slice(0, 7).map((x) => <Cell key={x.jc} fill={x.late ? '#C62828' : COL.spend} />)}
                <LabelList dataKey="Balance" position="right" formatter={kfmt} style={LBL} /></Bar></BarChart></ResponsiveContainer>
          ) : <Nada t="All invoices are paid." />}
        </Pn>
      </div>

      <div className="dash-row">
        <Pn n={3} title="Spend per order" sub={D.spend.length > 8 ? `Biggest 8 of ${D.spend.length} · cost plus overhead share` : 'Production cost plus overhead share'}>
          {D.spend.length ? (
            <ResponsiveContainer width="100%" height="100%"><BarChart data={D.spend.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 8, top: 2, bottom: 2 }}>
              <XAxis type="number" {...AX} tickFormatter={kfmt} /><YAxis type="category" dataKey="n" {...AX} width={104} interval={0} tick={<YT w={104} size={11} />} /><Tooltip {...TT} formatter={money} labelFormatter={jcTip} />
              <Bar dataKey="Production cost" stackId="a" fill={COL.cost} maxBarSize={24} isAnimationActive={false} /><Bar dataKey="Overhead share" stackId="a" fill={COL.oh} maxBarSize={24} isAnimationActive={false} /></BarChart></ResponsiveContainer>
          ) : <Nada t="No orders received in this period." />}
        </Pn>
        <Pn n={2} title="Where cost goes" sub="This period">
          {D.split.length ? <Donut rows={D.split} total={kfmt(sum(D.split, (x) => x.v))} label="total cost" /> : <Nada t="No orders in this period." />}
        </Pn>
        <Pn n={2} title="Who paid" sub="Payments this period">
          {D.payers.length ? <Donut rows={D.payers} offset={1} total={kfmt(cur.rev)} label="received" /> : <Nada t="No payments in this period." />}
        </Pn>
        <Pn n={2} title="Break-even" sub="Whole month">
          {D.be ? (
            <div className="dp-be">
              <div className="dp-bn">Each shirt earns <b>{f0(D.avg)}</b> after cost. Overheads: <b>{f0(D.ovM)}</b></div>
              <div className="dp-bc"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ v: Math.min(D.sold, D.be) }, { v: Math.max(D.be - D.sold, 0) }]} dataKey="v" startAngle={180} endAngle={0} cy="92%" innerRadius="72%" outerRadius="100%" stroke="none" isAnimationActive={false}>
                <Cell fill={D.sold >= D.be ? COL.gp : COL.oh} /><Cell fill="var(--line)" /></Pie></PieChart></ResponsiveContainer>
                <div className="dp-mid" style={{ top: 'auto', bottom: 0 }}><b>{D.sold} / {D.be}</b><span>shirts</span></div></div>
              <div className={'dp-verdict ' + (D.sold >= D.be ? 'ok' : 'no')}>{D.sold >= D.be ? 'Overheads covered' : `${D.be - D.sold} more to cover overheads`}</div>
            </div>
          ) : <Nada t="Add this month's overheads to see break-even." />}
        </Pn>
        <Pn n={3} title="Profit by product" sub="Before discounts · red = under 20%">
          {D.prod.length ? (
            <ResponsiveContainer width="100%" height="100%"><BarChart data={D.prod.slice(0, 6)} layout="vertical" margin={{ left: 0, right: 72, top: 2, bottom: 2 }}>
              <XAxis type="number" hide /><YAxis type="category" dataKey="n" {...AX} width={100} interval={0} tick={<YT w={100} />} />
              <Tooltip {...TT} formatter={(v, k, p) => (k === 'Profit' ? `${money(v)} · margin ${p.payload.Margin.toFixed(0)}%` : v)} />
              <Bar dataKey="Profit" radius={[0, 4, 4, 0]} maxBarSize={26} isAnimationActive={false}>
                {D.prod.slice(0, 6).map((x) => <Cell key={x.n} fill={x.Margin < 20 ? '#C62828' : COL.gp} />)}
                <LabelList dataKey="Profit" position="right" formatter={(v) => kfmt(v)} content={({ x, y, width, height, value, index }) => (
                  <text x={x + width + 5} y={y + height / 2 + 4} fill="var(--ink)" fontSize={11}>{kfmt(value)} · {D.prod[index].Margin.toFixed(0)}%</text>)} /></Bar></BarChart></ResponsiveContainer>
          ) : <Nada t="No orders in this period." />}
        </Pn>
      </div>
    </div>
    </>
  )
}

const FILTERS = ['All', 'Overdue', 'Awaiting deposit or payment', 'Artwork pending', 'In production', 'Quality hold', 'Ready for collection', 'Completed']

export function Orders() {
  const { S } = useApp(), [q, setQ] = useState(''), [f, setF] = useState('All')
  useEffect(() => { const x = new URLSearchParams(window.location.search).get('f'); if (x && FILTERS.includes(x)) setF(x) }, [])
  const hit = (o) => [o.jc, o.qt, o.inv, o.ent, o.placed, o.phone].some((v) => (v || '').toLowerCase().includes(q.trim().toLowerCase()))
  const ok = (o) => { const p = phase(S, o); return f === 'All' || (f === 'Overdue' ? overdue(o) : f === 'Awaiting deposit or payment' ? p.startsWith('Awaiting') : p === f) }
  const list = [...S.orders].reverse().filter((o) => hit(o) && ok(o))
  return (
    <>
      <Head title="Orders" sub="Search by job card, quotation, invoice, customer, company or phone." />
      <div className="card">
        <label>Search<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job card, customer, phone…" /></label>
        <div className="chips" style={{ margin: '12px 0' }}>{FILTERS.map((x) => <button key={x} className={'chip' + (f === x ? ' on' : '')} onClick={() => setF(x)}>{x}</button>)}</div>
        {list.length ? <OrdersTable list={list} /> : <p className="sub">{S.orders.length ? 'No orders match.' : 'No orders yet. Register the first order to get its job card number.'}</p>}
        <p><Link className="btn" href="/new" style={{ display: 'inline-flex', alignItems: 'center', color: '#fff', textDecoration: 'none' }}>New order</Link></p>
      </div>
    </>
  )
}

const MaterialPlan = ({ lines, title = 'Materials and production cost', order, jc }) => {
  const { S } = useApp()
  const m = materialPlan(S, lines, order)
  return (
    <div className="card"><h2>{title}</h2>
      {m.shirts ? (
        <>
          <Table head={['Item', 'Colour', 'Fabric', 'Sizes', 'Pieces', 'Pattern (m)', 'With tolerance (m)', 'Material cost', 'Production cost']} right={4}>
            {m.rows.map((g) => (
              <tr key={g.type + '|' + g.colour + '|' + g.fabric}><td>{g.type || 'T-shirt'}</td><td>{g.colour}</td><td>{g.fabric || '–'}</td><td>{g.sizeText}</td><td className="r">{g.shirts}</td>
                <td className="r">{g.metres.toFixed(2)}</td><td className="r">{g.allow.toFixed(2)}</td><td className="r">{f2(g.fabricCost)}</td><td className="r">{f2(g.cost)}</td></tr>
            ))}
          </Table>
          <div className="tot"><span>Pattern metres (theoretical)</span><span>{m.metres.toFixed(2)} m</span></div>
          <div className="tot"><span>{m.tol > 0 ? `Metre tolerance, ${m.tol}%` : 'Metre tolerance'}</span><span>{m.tol > 0 ? `+${(m.allow - m.metres).toFixed(2)} m` : 'None applied'}</span></div>
          <div className="tot big"><span>Fabric to allow for</span><span>{m.allow.toFixed(2)} m</span></div>
          {m.actual !== null && <div className="tot"><span>Actual metres printed</span><span>{m.actual.toFixed(2)} m</span></div>}
          <div className="tot"><span>Material, {m.metres.toFixed(2)} m (average {f2(m.metres ? m.parts.fabric / m.metres : 0)} per m)</span><span>{f2(m.parts.fabric)}</span></div>
          <div className="tot"><span>Printing (average {f2(m.metres ? m.parts.print / m.metres : 0)} per m)</span><span>{f2(m.parts.print)}</span></div>
          <div className="tot"><span>Pressing (average {f2(m.metres ? m.parts.press / m.metres : 0)} per m)</span><span>{f2(m.parts.press)}</span></div>
          <div className="tot"><span>Making, {m.shirts} pieces (average {f2(m.shirts ? m.parts.sew / m.shirts : 0)} each)</span><span>{f2(m.parts.sew)}</span></div>
          <div className="tot big"><span>Production cost</span><span>{f2(m.total)}</span></div>
          <div className="tot"><span>Average per piece</span><span>{f2(m.avg)}</span></div>
          <p className="sub">Metres per piece come from the size's pattern height for sized items, or the set metres for hats and banners, times the quantity. {m.tol > 0 ? `The ${m.tol}% metre tolerance is the extra fabric to allow for layout waste. The cost above is on pattern metres; if the full tolerance is used it rises to ${f2(m.tolTotal)}. ` : 'No metre tolerance was costed into this job. '}Change the tolerance in Costing and prices. Rework is costed separately.</p>
          {jc && <p className="sub">Once the job is cut, enter the metres actually used on the <Link href="/variance">Metre variance</Link> page.</p>}
        </>
      ) : <p className="sub">Add items with a quantity to see the material needed and the cost of production.</p>}
    </div>
  )
}

const LIST_HINT = 'Black T-shirts: 5 x M, 10 x L, 2 x XL\nRoyal blue golf shirt - 3 medium, 4 large\nKids 7-8 white x 6'

export function NewOrder() {
  const { S, dispatch } = useApp(), router = useRouter(), nid = useRef(0)
  const mk = (o) => ({ id: ++nid.current, s: '', q: 1, type: '', colour: '', fabric: '', desc: '', m: '', fabricRate: '', sewRate: '', unitPrice: '', ...o })
  const [d, setD] = useState({ by: '', placed: '', ent: '', phone: '', dueDate: '', dt: '%', dv: 0, dr: '' }), [lines, setLines] = useState([])
  const [tab, setTab] = useState('add'), [f, setF] = useState({ type: '', s: S.sizes[0].n, q: 1, colour: '', fabric: '', desc: '' })
  const [txt, setTxt] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [warns, setWarns] = useState([]), [perr, setPerr] = useState('')
  const [err, setErr] = useState(''), [tried, setTried] = useState(false)
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value })
  const setF1 = (k) => (e) => setF({ ...f, [k]: e.target.value })
  // Metres typed per piece are entered in metres; the model keeps them in mm.
  const norm = (l) => ({ ...l, h: parseFloat(l.m) > 0 ? parseFloat(l.m) * 1000 : '' })
  const good = lines.filter((l) => sz(S, l.s) && l.q > 0).map(norm), bad = lines.length - good.length
  // Cost and price every line the way it will be saved, so this page shows the same figures as the job card.
  const qn = sum(good, (l) => l.q), built = good.map((l) => mkLine(S, l, qn))
  const c = calc(S, { lines: built, dt: d.dt, dv: d.dv, pays: [] }), q = c.q, mp = materialPlan(S, built)
  const pd = prodOf(S, f.type), gaps = pd ? typeGaps(S, pd) : []
  const staffOk = d.by.trim().length >= 2
  const known = [...new Set(S.orders.map((o) => o.by).filter(Boolean))]
  const colours = [...new Set(lines.map((l) => l.colour).filter(Boolean))]
  const ix = (n) => { const i = S.sizes.findIndex((z) => z.n === n); return i < 0 ? 999 : i }
  const sortLines = (a) => [...a].sort((x, y) => ix(x.s) - ix(y.s) || x.colour.localeCompare(y.colour) || x.desc.localeCompare(y.desc))

  // Different sizes, colours and descriptions all live in the same order. Identical lines are added together.
  const add = () => {
    const n = Math.floor(+f.q)
    if (!(n > 0)) return setErr('Quantity must be at least 1.')
    const colour = f.colour.trim(), fabric = f.fabric.trim(), desc = f.desc.trim(), lc = (v) => (v || '').toLowerCase()
    const s = isFixed(prodOf(S, f.type)) ? ONE : f.s
    const same = (l) => l.type === f.type && l.s === s && lc(l.colour) === lc(colour) && lc(l.fabric) === lc(fabric) && lc(l.desc) === lc(desc) && !l.unitPrice && !l.m && !l.fabricRate && !l.sewRate
    setErr('')
    setLines((ls) => (ls.some(same) ? ls.map((l) => (same(l) ? { ...l, q: l.q + n } : l)) : [...ls, mk({ type: f.type, s, q: n, colour, fabric, desc })]))
    setF({ ...f, q: 1, desc: '' })
  }
  const edit = (id, k, v) => setLines((ls) => ls.map((l) => {
    if (l.id !== id) return l
    const n = { ...l, [k]: v, src: undefined }
    if (k === 'type') { // a new product starts from its own defaults
      n.m = ''; n.fabricRate = ''; n.sewRate = ''; n.unitPrice = ''
      if (isFixed(prodOf(S, v))) n.s = ONE; else if (n.s === ONE) n.s = S.sizes[0].n
    }
    return n
  }))
  const drop = (id) => setLines((ls) => ls.filter((l) => l.id !== id))

  // Manual override: paste a list, the AI reads sizes, colours and garments, and the lines are sorted by size then colour.
  const readList = async () => {
    if (!txt.trim()) return setPerr('Paste the order list first.')
    if (!supabase) return setPerr('Reading a list needs the cloud connection and sign-in. Add the items by hand in the Add items tab.')
    setBusy(true); setPerr(''); setMsg(''); setWarns([])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Please sign in again.')
      const res = await fetch('/api/documents/parse-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ text: txt, sizes: S.sizes.map((z) => z.n) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not read the list.')
      const read = j.lines.map((l) => mk({ s: l.size, q: l.qty, colour: l.colour || '', fabric: l.fabric || '', desc: l.description || '', unitPrice: l.unit_price ?? '', src: 'list' }))
      setLines((ls) => { const m = [...ls.filter((l) => l.src !== 'list'), ...read]; return j.lines.some((l) => l.named) ? m : sortLines(m) })
      setWarns(j.warnings || [])
      setMsg(`${read.length} lines read (${sum(read, (l) => l.q)} shirts). Check them in the order items below before you register.`)
    } catch (e) { setPerr(e.message) }
    setBusy(false)
  }

  const reg = () => {
    setTried(true)
    if (!staffOk) return setErr('Enter the name of the staff member taking this order.')
    if (!lines.length) return setErr('Add at least one item.')
    if (bad) return setErr(`${bad} item line${bad > 1 ? 's need' : ' needs'} a size and a quantity of at least 1.`)
    if (!d.placed.trim() || !d.ent.trim()) return setErr('Enter who placed the order and their entity or company.')
    if (+d.dv > 0 && !d.dr.trim()) return setErr('Enter a reason for the discount.')
    const np = built.find((l) => !(l.unitPrice > 0)), nm = built.find((l) => !(lineH(S, l) > 0))
    if (np) return setErr(`${lineLabel(np) || np.type || 'An item'} has no selling price. Type one in its Unit price box, or set it for ${np.type || 'the item'} on the Costing page.`)
    if (nm) return setErr(`${lineLabel(nm) || nm.type || 'An item'} has no metres per piece. Type them in its Metres per piece box, or set them on the Costing page.`)
    setErr('')
    const jc = jobNo(S); dispatch({ type: 'register', d: { ...d, by: d.by.trim() }, lines: good }); router.push('/orders/' + jc)
  }
  const cell = { margin: 0, minWidth: 0 }
  return (
    <>
      <Head title="New order" sub="Register the order to get its job card, quotation and invoice numbers." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card"><h2>Order details</h2>
          <div className="fm">
            <label>Job card number<input value={jobNo(S)} readOnly aria-readonly="true" /><span className="sub">Generated automatically. The quotation and invoice numbers follow it.</span></label>
            <label>Staff member taking the order (required)
              <input list="staff-names" value={d.by} onChange={set('by')} placeholder="Full name" required aria-required="true" aria-invalid={tried && !staffOk} autoComplete="off" />
              <datalist id="staff-names">{known.map((n) => <option key={n} value={n} />)}</datalist>
              {tried && !staffOk && <span className="note w" style={{ display: 'block', marginTop: 4 }}>Enter the name of the staff member taking this order.</span>}
            </label>
            <label>Placed by<input value={d.placed} onChange={set('placed')} placeholder="Person's name" /></label>
            <label>Entity or company<input value={d.ent} onChange={set('ent')} placeholder="Company name" /></label>
            <label>Phone<input type="tel" value={d.phone} onChange={set('phone')} /></label>
            <label>Due date<input type="date" value={d.dueDate} onChange={set('dueDate')} /></label>
          </div>
          <h2 style={{ marginTop: 18 }}>Discount</h2>
          <div className="fm">
            <label>Type<select value={d.dt} onChange={set('dt')}><option value="%">Percent</option><option value="P">Amount in P</option></select></label>
            <label>Value<input type="number" min="0" value={d.dv} onChange={set('dv')} /></label>
            <label>Reason<input value={d.dr} onChange={set('dr')} /></label>
          </div>
        </div>

        <div className="card"><h2>Order items</h2>
          <div className="chips" role="tablist" aria-label="How to add items">
            <button role="tab" aria-selected={tab === 'add'} className={'chip' + (tab === 'add' ? ' on' : '')} onClick={() => setTab('add')}>Add items</button>
            <button role="tab" aria-selected={tab === 'list'} className={'chip' + (tab === 'list' ? ' on' : '')} onClick={() => setTab('list')}>Manual override (paste list)</button>
          </div>
          {tab === 'add' ? (
            <div style={{ marginTop: 12 }}>
              <div className="fm">
                <label>Category<select value={f.type} onChange={setF1('type')}><option value="">T-shirt</option>{S.types.map((p) => <option key={p.n} value={p.n}>{p.n}{typeGaps(S, p).length ? ' (needs setup)' : ''}</option>)}</select></label>
                {!isFixed(pd) && <label>Size<select value={f.s} onChange={setF1('s')}>{S.sizes.map((z) => <option key={z.n}>{z.n}</option>)}</select></label>}
                <label>Quantity<input type="number" min="1" value={f.q} onChange={setF1('q')} /></label>
                <label>Colour<input list="order-colours" value={f.colour} onChange={setF1('colour')} placeholder="e.g. Black" /><datalist id="order-colours">{colours.map((x) => <option key={x} value={x} />)}</datalist></label>
                <label>Fabric (optional)<input value={f.fabric} onChange={setF1('fabric')} placeholder="e.g. Cotton" /></label>
                <label>Description<input value={f.desc} onChange={setF1('desc')} placeholder="e.g. Logo on chest, name on back" /></label>
                <button className="btn" onClick={add}>Add to order</button>
              </div>
              {gaps.length > 0 && <div className="note w">{pd.n} still needs: {gaps.join(', ')}. Set {gaps.length > 1 ? 'them' : 'it'} on the <Link href="/costing">Costing page</Link>, or type the figures on the order line below.</div>}
              <p className="sub">Add as many items as you need. Each line keeps its own category, size, colour and description, so one order can mix products and designs. Material price per metre, making fee, metres per piece and unit price can be typed on each line below; leave a box blank to use the default shown in it.</p>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <label>Paste the order list
                <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={8} placeholder={LIST_HINT} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 10, font: 'inherit', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--card)', color: 'var(--ink)' }} />
              </label>
              <p><button className="btn" onClick={readList} disabled={busy || !txt.trim()}>{busy ? 'Reading the list…' : 'Read list and add to order'}</button></p>
              <p className="sub">The AI picks out sizes, colours and garments and sorts them by size, then colour. Reading again replaces lines from the earlier read that you have not edited.</p>
              {perr && <div className="note w">{perr}</div>}
              {msg && <div className="note">{msg}</div>}
              {warns.length > 0 && <div className="note w"><b>Check these:</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{warns.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
            </div>
          )}

          <h2 style={{ marginTop: 18 }}>Items in this order</h2>
          {lines.length ? (
            <>
              <Table head={['Category', 'Size', 'Qty', 'Colour', 'Fabric', 'Description', 'Metres per piece', 'Material per m', 'Making fee', 'Unit price', 'Line total', '']} right={99}>
                {lines.map((l) => { const okL = sz(S, l.s) && l.q > 0, bl = okL ? mkLine(S, norm(l), qn) : null, u = bl ? unit(S, bl, qn) : null, dr = baseRates(S, l.type), fx = isFixed(prodOf(S, l.type)); return (
                  <tr key={l.id}>
                    <td><select style={{ ...cell, minWidth: 130 }} value={l.type} aria-label="Category" onChange={(e) => edit(l.id, 'type', e.target.value)}><option value="">T-shirt</option>{S.types.map((p) => <option key={p.n} value={p.n}>{p.n}</option>)}</select></td>
                    <td>{fx ? '–' : <select style={cell} value={l.s} aria-label="Size" aria-invalid={!sz(S, l.s)} onChange={(e) => edit(l.id, 's', e.target.value)}>{!sz(S, l.s) && <option value="">Choose size</option>}{S.sizes.map((z) => <option key={z.n}>{z.n}</option>)}</select>}</td>
                    <td style={{ width: 90 }}><input style={cell} type="number" min="1" value={l.q} aria-label="Quantity" onFocus={(e) => e.target.select()} onChange={(e) => edit(l.id, 'q', Math.max(0, Math.floor(+e.target.value) || 0))} /></td>
                    <td><input style={{ ...cell, minWidth: 110 }} value={l.colour} aria-label="Colour" list="order-colours" onChange={(e) => edit(l.id, 'colour', e.target.value)} /></td>
                    <td><input style={{ ...cell, minWidth: 100 }} value={l.fabric} aria-label="Fabric" onChange={(e) => edit(l.id, 'fabric', e.target.value)} /></td>
                    <td><input style={{ ...cell, minWidth: 200 }} value={l.desc} aria-label="Description" placeholder="Description" onChange={(e) => edit(l.id, 'desc', e.target.value)} /></td>
                    <td><input style={{ ...cell, width: 96 }} type="number" step="any" min="0" value={l.m} aria-label="Metres per piece" placeholder={okL ? tidy(lineH(S, { s: l.s, type: l.type }) / 1000) : ''} onChange={(e) => edit(l.id, 'm', e.target.value)} /></td>
                    <td><input style={{ ...cell, width: 90 }} type="number" step="any" min="0" value={l.fabricRate} aria-label="Material price per metre" placeholder={tidy(dr.fabric)} onChange={(e) => edit(l.id, 'fabricRate', e.target.value)} /></td>
                    <td><input style={{ ...cell, width: 90 }} type="number" step="any" min="0" value={l.sewRate} aria-label="Making fee per piece" placeholder={tidy(dr.sew)} onChange={(e) => edit(l.id, 'sewRate', e.target.value)} /></td>
                    <td><input style={{ ...cell, width: 90 }} type="number" step="any" min="0" value={l.unitPrice} aria-label="Unit price" placeholder={okL ? tidy(price(S, sz(S, l.s), qn, l.type)) : ''} onChange={(e) => edit(l.id, 'unitPrice', e.target.value)} /></td>
                    <td className="r">{u ? f2(l.q * u.price) : '–'}</td>
                    <td><button className="btn o" onClick={() => drop(l.id)} aria-label={'Remove ' + (l.type || l.s || 'item')}>Remove</button></td>
                  </tr>) })}
              </Table>
              {bad > 0 && <div className="note w">{bad} line{bad > 1 ? 's need' : ' needs'} a size and a quantity of at least 1 before the order can be registered.</div>}
              <p><button className="btn o" onClick={() => setLines(sortLines(lines))}>Sort by size and colour</button></p>
            </>
          ) : <p className="sub">No items yet. Add them one by one, or paste a list in the Manual override tab.</p>}
        </div>

        <div className="grid">
          <MaterialPlan lines={built} />
          <div className="card"><h2>Pricing and payment</h2>
            <div className={'note' + (q && q < S.thr ? ' w' : '')}>{q ? (q < S.thr ? `${q} items, under ${S.thr}: higher prices apply and the full amount is paid before production.` : `${q} items: ${S.thr}+ prices apply and a ${S.dep}% deposit is paid before production.`) : 'Add items to see prices.'}</div>
            <div className="tot"><span>Subtotal</span><span>{f2(c.sub)}</span></div>
            <div className="tot"><span>Discount</span><span>−{f2(c.d)}</span></div>
            <div className="tot big"><span>Net total</span><span>{f2(c.net)}</span></div>
            <div className="tot"><span>Payment required before production</span><span>{f2(c.req)}</span></div>
            {mp.shirts > 0 && <div className="tot"><span>Fabric to cut ({mp.metres.toFixed(2)} m pattern{tolPct(S) > 0 ? ` + ${tolPct(S)}% tolerance` : ''})</span><span>{mp.allow.toFixed(2)} m</span></div>}
            <div className="tot"><span>Production cost, on pattern metres</span><span>{f2(c.cs)}</span></div>
            {c.net > 0 && <div className="tot"><span>Expected margin</span><span>{pc(c.gp / c.net)}</span></div>}
            {c.net > 0 && c.net < c.cs && <div className="note w">The net total is below production cost.</div>}
            {err && <div className="note w" role="alert">{err}</div>}
            <p><button className="btn" onClick={reg}>Register job card</button></p>
          </div>
        </div>
      </div>
    </>
  )
}

const ST_TAG = { pending: '', active: 'b', done: 'g', skipped: '' }
const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

function Production({ o, c }) {
  const st = o.stages && o.stages.length ? o.stages : mkStages(), rw = st.filter((s) => s.rw), pr = progress({ stages: st })
  return (
    <div className="card"><h2>Production stages</h2>
      {!o.prod ? <div className="note w">Stages unlock once the required payment is recorded and the job is moved to production.</div> : (
        <>
          <div className="mt"><div className="mb" style={{ width: pr + '%' }} /></div>
          <div className="sub" style={{ margin: '6px 0 10px' }}>{st.filter(isDone).length} of {st.length} stages approved{rw.length ? ` · ${rw.length} rework, ${f2(rw.reduce((t, s) => t + (+(s.rw.act ?? s.rw.est) || 0), 0))}` : ''}</div>
          <div className="log">{st.map((s) => <div key={s.k}>{s.k}<span>{s.st}{s.appr ? ' · approved by ' + s.appr.by : ''}</span></div>)}</div>
        </>)}
      {o.closed ? <div className="note">Closed {when(o.closed.at)}. Revenue {f2(o.closed.revenue)}, total cost {f2(o.closed.cost)}, actual profit {f2(o.closed.profit)} ({o.closed.revenue ? pc(o.closed.profit / o.closed.revenue) : '–'}).</div> : null}
      {o.prod && <p><Link className="btn" href={'/orders/' + o.jc + '/production'} style={{ display: 'inline-flex', alignItems: 'center', color: '#fff', textDecoration: 'none' }}>Open production stages</Link></p>}
    </div>
  )
}

export function Job() {
  const { jc } = useParams(), { S, dispatch, superAdmin } = useApp(), router = useRouter(), [p, setP] = useState({ amt: '', by: '', ent: '', d: TODAY }), [err, setErr] = useState(''), [del, setDel] = useState({ open: false, reason: '', typed: '' })
  const o = S.orders.find((x) => x.jc === decodeURIComponent(jc))
  if (!o) return (<><Head title="Job card not found" /><Link href="/orders">Back to orders</Link></>)
  const c = calc(S, o), pr = progress(o)
  const pay = () => {
    if (!(+p.amt > 0)) return setErr('Enter an amount.')
    if (+p.amt > c.bal + 0.005) return setErr(`The amount is more than the remaining balance of ${f2(c.bal)}.`)
    setErr(''); dispatch({ type: 'pay', jc: o.jc, amt: +p.amt, by: p.by || o.placed, ent: p.ent || o.ent, d: p.d }); setP({ ...p, amt: '' })
  }
  const canDelete = superAdmin && del.reason.trim().length >= 3 && del.typed.trim() === o.jc
  const remove = () => { if (!canDelete) return; dispatch({ type: 'delOrder', jc: o.jc, reason: del.reason }); router.push('/orders') }
  return (
    <>
      <div className="top"><div><h1>Job card {o.jc}</h1><div className="chips" style={{ marginTop: 8 }}><span className="tag b">{o.qt}</span><span className="tag b">{o.inv}</span><Tag o={o} />{overdue(o) && <span className="tag a">Overdue</span>}</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn o" href={`/orders/${o.jc}/quotation`}>View quotation</Link>
          {isCompleted(S, o) && <Link className="btn" href={`/orders/${o.jc}/invoice`}>View invoice</Link>}
          <button className="btn o" onClick={() => window.print()}>Print job card</button>
        </div></div>
      {o.stages && o.stages.length > 0 && <div><div className="mt"><div className="mb" style={{ width: pr + '%' }} /></div><div className="sub">{pr}% of production stages complete</div></div>}
      <div className="grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card"><h2>Order details</h2>
            <div className="kp">{[['Order date', fd(o.date)], ['Due date', o.dueDate ? fd(o.dueDate) : '–'], ['Received by', o.by], ['Placed by', o.placed], ['Entity', o.ent], ['Phone', o.phone || '–']].map(([l, v]) => <div key={l}><div className="sub">{l}</div>{v}</div>)}</div></div>
          <div className="card"><h2>Order lines</h2>
            <Table head={['Item', 'Size', 'Colour', 'Description', 'Qty', 'Unit price', 'Unit cost', 'Line total']} right={4}>
              {o.lines.map((l, i) => { const u = unit(S, l, c.q); return <tr key={i}><td>{l.type || 'T-shirt'}</td><td>{l.s === ONE ? '–' : l.s}</td><td>{l.colour || '–'}</td><td>{[l.fabric, l.desc].filter(Boolean).join(' · ') || '–'}</td><td className="r">{l.q}</td><td className="r">{f2(u.price)}</td><td className="r">{f2(u.cost)}</td><td className="r">{f2(l.q * u.price)}</td></tr> })}
            </Table>
            <div className="tot"><span>Subtotal</span><span>{f2(c.sub)}</span></div>
            <div className="tot"><span>Discount{o.dv ? ': ' + o.dr : ''}</span><span>−{f2(c.d)}</span></div>
            <div className="tot big"><span>Net total</span><span>{f2(c.net)}</span></div>
            <div className="tot"><span>Production cost</span><span>{f2(c.cs)}</span></div>
            <div className="tot"><span>Gross profit</span><span>{f2(c.gp)}</span></div></div>
          <MaterialPlan lines={o.lines} title="Materials required" order={o} jc={o.jc} />
          <Production o={o} c={c} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card"><h2>Payments</h2>
            <Table head={['Date', 'Paid by', 'Entity', 'Amount']} right={3}>{o.pays.map((x, i) => <tr key={i}><td>{fd(x.d)}</td><td>{x.by}</td><td>{x.ent}</td><td className="r">{f2(x.amt)}</td></tr>)}</Table>
            <div className="tot"><span>Total paid</span><span>{f2(c.paid)}</span></div>
            <div className="tot big"><span>Remaining balance</span><span>{f2(c.bal)}</span></div>
            <div className={'note' + (c.ok ? '' : ' w')}>{c.q < S.thr ? 'Full payment is required before production.' : S.dep + '% deposit is required before production.'} Required: {f2(c.req)}. {c.ok ? 'Requirement met.' : 'Not yet met.'}</div>
            <div className="fm">
              <label>Amount<input type="number" min="1" value={p.amt} onChange={(e) => setP({ ...p, amt: e.target.value })} /></label>
              <label>Paid by<input value={p.by || o.placed} onChange={(e) => setP({ ...p, by: e.target.value })} /></label>
              <label>Entity<input value={p.ent || o.ent} onChange={(e) => setP({ ...p, ent: e.target.value })} /></label>
              <label>Date<input type="date" value={p.d} onChange={(e) => setP({ ...p, d: e.target.value })} /></label>
            </div>
            {err && <div className="note w">{err}</div>}
            <p><button className="btn o" onClick={pay}>Record payment</button>{' '}
              <button className="btn" disabled={!c.ok || o.prod} onClick={() => dispatch({ type: 'produce', jc: o.jc })}>{o.prod ? 'In production' : 'Move to production'}</button></p></div>
          <div className="card"><h2>Audit trail</h2>
            <div className="log">{S.audit.filter((a) => a.o === o.jc).reverse().map((a, i) => <div key={i}>{a.t}<span>{a.ts} · {a.u}</span></div>)}</div></div>
          {superAdmin && (
            <div className="card"><h2>Delete job card</h2>
              <p className="sub">Only a super admin sees this. Deleting removes {o.jc}, its quotation and invoice, {o.pays.length} recorded payment(s) ({f2(c.paid)}) and any rework cost entries. The job number is never reused, and the deletion is written to the audit log.</p>
              {!del.open
                ? <button className="btn o" onClick={() => setDel({ ...del, open: true })}>Delete this job card</button>
                : <>
                  <div className="note w">This cannot be undone. {c.paid > 0 ? `${f2(c.paid)} has been paid on this job. ` : ''}{o.closed ? 'This job is already closed. ' : o.prod ? 'This job is in production. ' : ''}Consider downloading a backup from the Data and backups page first.</div>
                  <div className="fm">
                    <label>Reason for deleting<input value={del.reason} onChange={(e) => setDel({ ...del, reason: e.target.value })} placeholder="e.g. Duplicate order, test entry" /></label>
                    <label>Type {o.jc} to confirm<input value={del.typed} onChange={(e) => setDel({ ...del, typed: e.target.value })} placeholder={o.jc} autoComplete="off" /></label>
                  </div>
                  <p><button className="btn" disabled={!canDelete} onClick={remove}>Delete permanently</button>{' '}<button className="btn o" onClick={() => setDel({ open: false, reason: '', typed: '' })}>Cancel</button></p>
                </>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export function Payments() {
  const { S } = useApp()
  const all = S.orders.flatMap((o) => o.pays.map((p) => ({ o, p }))).sort((a, b) => b.p.d.localeCompare(a.p.d))
  return (
    <>
      <Head title="Payments" />
      <div className="card"><Table head={['Date', 'Job card', 'Paid by', 'Entity', 'Amount']} right={4}>
        {all.map(({ o, p }, i) => <tr key={i}><td>{fd(p.d)}</td><td><Link href={'/orders/' + o.jc}>{o.jc}</Link></td><td>{p.by}</td><td>{p.ent}</td><td className="r">{f2(p.amt)}</td></tr>)}
      </Table></div>
    </>
  )
}

const NP0 = { n: '', mode: 'fixed', m: '', metres: '', fabric: '', print: '', press: '', sew: '', a0: '', a1: '', k0: '', k1: '' }

export function Costing() {
  const { S, dispatch, canEdit } = useApp(), [z, setZ] = useState({ n: '', c: 'adult', h: '' }), [np, setNp] = useState(NP0), [npErr, setNpErr] = useState('')
  const R = (k, label) => <Num ro={!canEdit} key={k} label={label} value={S.R[k]} onSave={(v) => v !== S.R[k] && dispatch({ type: 'rate', k, v })} />
  const T = (c, j, label) => <Num ro={!canEdit} key={c + j} label={label} value={S.T[c][j]} onSave={(v) => v !== S.T[c][j] && dispatch({ type: 'tier', c, j, v })} />
  const G = (k, label) => <Num ro={!canEdit} key={k} label={label} value={S[k]} onSave={(v) => v !== S[k] && dispatch({ type: 'setting', k, v })} />
  const used = new Set(S.orders.flatMap((o) => o.lines.map((l) => l.type)))
  const ref = S.sizes.find((x) => x.n === 'M') || S.sizes[0]
  const pcost = (p) => { const r = baseRates(S, p.n), m = isFixed(p) ? +p.metres || 0 : (ref.h / 1000) * typeMult(S, p.n); return m * (r.fabric + r.print + r.press) + r.sew }
  const setN = (k) => (e) => setNp({ ...np, [k]: e.target.value })
  const addProduct = () => {
    const n = np.n.trim(), fixed = np.mode === 'fixed'
    if (!n) return setNpErr('Enter a name for the product.')
    if (S.types.some((x) => x.n.toLowerCase() === n.toLowerCase())) return setNpErr(`${n} is already in the catalogue.`)
    if (fixed ? !(+np.metres > 0) : !(+np.m > 0)) return setNpErr(fixed ? 'Enter the metres of material one piece uses.' : 'Enter the fabric multiplier, for example 1.5 if it uses one and a half times the shirt length.')
    setNpErr('')
    dispatch({ type: 'addType', p: { n, mode: np.mode, m: np.m, metres: np.metres, fabric: np.fabric, print: np.print, press: np.press, sew: np.sew, price: { adult: [np.a0, np.a1], kids: [np.k0, np.k1] } } })
    setNp(NP0)
  }
  const legacy = (p) => !p.mode
  return (
    <>
      <Head title="Costing and prices" sub={canEdit ? 'Changes recalculate every cost and margin. Orders keep the prices and costs saved when they were registered.' : 'Only an admin can change prices, rates and deposit rules.'} />
      <div className="grid">
        <div className="card"><h2>Default cost rates</h2><div className="fm">{R('print', 'Printing, per metre')}{R('fabric', 'Material, per metre')}{R('press', 'Pressing, per metre')}{R('sew', 'Making fee, per piece')}{G('tol', 'Metre tolerance, ±% (costed into new orders)')}</div>
          <p className="sub">Used by T-shirts and by any product below that leaves a box blank.</p></div>
        <div className="card"><h2>T-shirt prices and payment rules</h2><div className="fm">
          {T('adult', 0, `Adult, under ${S.thr}`)}{T('adult', 1, `Adult, ${S.thr}+`)}{T('kids', 0, `Kids, under ${S.thr}`)}{T('kids', 1, `Kids, ${S.thr}+`)}
          {G('thr', 'Bulk threshold, pieces')}{G('dep', 'Deposit for bulk orders, %')}</div></div>
      </div>

      <div className="card"><h2>Products: material and making cost</h2>
        <p className="sub">Type the material price per metre and the other costs for each product. Leave a box blank to use the default shown in it. Fixed products use a set number of metres per piece (hats, banners). Sized products use the size's pattern height times a multiplier (dress, track suit).</p>
        <Table head={['Product', 'Method', 'Metres per piece / multiplier', 'Material, per metre', 'Printing, per metre', 'Pressing, per metre', 'Making fee, per piece', 'Cost per piece', '']} right={2}>
          {S.types.map((p, i) => { const gaps = typeGaps(S, p); return (
            <tr key={p.n}>
              <td>{p.n}{gaps.length > 0 && <span className="tag a" style={{ marginLeft: 8 }}>Needs {gaps.join(', ')}</span>}</td>
              <td>{isFixed(p) ? 'Fixed metres' : legacy(p) ? 'T-shirt' : 'Sized'}</td>
              <td className="r">{isFixed(p)
                ? <Ov ro={!canEdit} label={'Metres per piece for ' + p.n} value={p.metres} ph="e.g. 0.1" onSave={(v) => v !== '' && dispatch({ type: 'typeRate', i, k: 'metres', v })} />
                : <Ov ro={!canEdit} label={'Fabric multiplier for ' + p.n} value={p.m} ph="1" onSave={(v) => v !== '' && dispatch({ type: 'typeMult', i, v })} />}</td>
              {['fabric', 'print', 'press', 'sew'].map((k) => <td className="r" key={k}><Ov ro={!canEdit} label={`${k} for ${p.n}`} value={p[k]} ph={tidy(S.R[k])} onSave={(v) => dispatch({ type: 'typeRate', i, k, v })} /></td>)}
              <td className="r">{isFixed(p) ? f2(pcost(p)) : `${ref.n}: ${f2(pcost(p))}`}</td>
              <td><button className="btn o" disabled={!canEdit || used.has(p.n)} title={used.has(p.n) ? 'An order uses this product, so it cannot be removed.' : ''} onClick={() => dispatch({ type: 'delType', i })} aria-label={'Remove ' + p.n}>Remove</button></td>
            </tr>) })}
        </Table>
      </div>

      <div className="card"><h2>Products: selling prices</h2>
        <p className="sub">Type the selling price by hand. Fixed products have one price (standard); sized products have an adult and a kids price. The first price applies under {S.thr} pieces in an order, the second at {S.thr}+; if you leave the {S.thr}+ price blank the standard price is used. T-shirt types use the T-shirt prices above.</p>
        <Table head={['Product', `Standard / adult, under ${S.thr}`, `Standard / adult, ${S.thr}+`, `Kids, under ${S.thr}`, `Kids, ${S.thr}+`, 'Margin at the first price']} right={1}>
          {S.types.map((p, i) => { const pr = p.price || {}, a = pr.adult || ['', ''], k = pr.kids || ['', ''], c = pcost(p), first = a[0] !== '' ? a[0] : a[1], m = first !== '' && +first > 0 ? (+first - c) / +first : null; return (
            <tr key={p.n}>
              <td>{p.n}</td>
              {legacy(p)
                ? <td colSpan={4} className="sub">Uses the T-shirt prices above</td>
                : <>
                  <td className="r"><Ov ro={!canEdit} label={`Price of ${p.n}, under ${S.thr}`} value={a[0]} ph="Not set" onSave={(v) => dispatch({ type: 'typePrice', i, c: 'adult', j: 0, v })} /></td>
                  <td className="r"><Ov ro={!canEdit} label={`Price of ${p.n}, ${S.thr}+`} value={a[1]} ph="Same" onSave={(v) => dispatch({ type: 'typePrice', i, c: 'adult', j: 1, v })} /></td>
                  <td className="r">{isFixed(p) ? '–' : <Ov ro={!canEdit} label={`Kids price of ${p.n}, under ${S.thr}`} value={k[0]} ph="Not set" onSave={(v) => dispatch({ type: 'typePrice', i, c: 'kids', j: 0, v })} />}</td>
                  <td className="r">{isFixed(p) ? '–' : <Ov ro={!canEdit} label={`Kids price of ${p.n}, ${S.thr}+`} value={k[1]} ph="Same" onSave={(v) => dispatch({ type: 'typePrice', i, c: 'kids', j: 1, v })} />}</td>
                </>}
              <td className="r">{legacy(p) ? '–' : m === null ? 'Set a price' : pc(m)}</td>
            </tr>) })}
        </Table>
      </div>

      <div className="card"><h2>Add a product</h2>
        <div className="fm">
          <label>Name<input value={np.n} onChange={setN('n')} placeholder="e.g. Banner - Roll-up" /></label>
          <label>Method<select value={np.mode} onChange={setN('mode')}><option value="fixed">Fixed metres per piece (hat, banner)</option><option value="sized">Sized by pattern height (dress, track suit)</option></select></label>
          {np.mode === 'fixed'
            ? <label>Metres per piece<input type="number" step="any" min="0" value={np.metres} onChange={setN('metres')} placeholder="e.g. 0.1 or 2" /></label>
            : <label>Fabric multiplier<input type="number" step="any" min="0" value={np.m} onChange={setN('m')} placeholder="e.g. 1.5" /></label>}
          <label>Material, per metre<input type="number" step="any" min="0" value={np.fabric} onChange={setN('fabric')} placeholder={'Default ' + tidy(S.R.fabric)} /></label>
          <label>Printing, per metre<input type="number" step="any" min="0" value={np.print} onChange={setN('print')} placeholder={'Default ' + tidy(S.R.print)} /></label>
          <label>Pressing, per metre<input type="number" step="any" min="0" value={np.press} onChange={setN('press')} placeholder={'Default ' + tidy(S.R.press)} /></label>
          <label>Making fee, per piece<input type="number" step="any" min="0" value={np.sew} onChange={setN('sew')} placeholder={'Default ' + tidy(S.R.sew)} /></label>
          <label>{np.mode === 'fixed' ? 'Selling price' : 'Adult price'}, under {S.thr}<input type="number" step="any" min="0" value={np.a0} onChange={setN('a0')} /></label>
          <label>{np.mode === 'fixed' ? 'Selling price' : 'Adult price'}, {S.thr}+ (optional)<input type="number" step="any" min="0" value={np.a1} onChange={setN('a1')} /></label>
          {np.mode === 'sized' && <label>Kids price, under {S.thr}<input type="number" step="any" min="0" value={np.k0} onChange={setN('k0')} /></label>}
          {np.mode === 'sized' && <label>Kids price, {S.thr}+ (optional)<input type="number" step="any" min="0" value={np.k1} onChange={setN('k1')} /></label>}
          <button className="btn" disabled={!canEdit} onClick={addProduct}>Add product</button>
        </div>
        {npErr && <div className="note w" role="alert">{npErr}</div>}
        <p className="sub">Prices and rates can be changed later in the tables above, and any price can still be typed per order line on the New order page.</p>
      </div>

      <div className="card"><h2>Sizes</h2>
        <Table head={['Size', 'Category', 'Pattern height, mm', 'Metres per shirt', 'Metres with tolerance', 'Cost per shirt']} right={2}>
          {S.sizes.map((x, i) => (
            <tr key={x.n}><td>{x.n}{x.e ? <span className="sub"> estimate</span> : null}</td><td>{x.c}</td>
              <td className="r"><input type="number" defaultValue={x.h} key={x.h} aria-label={'Height of ' + x.n} disabled={!canEdit} style={{ width: 110, margin: '0 0 0 auto' }}
                onBlur={(e) => { const v = parseFloat(e.target.value); if (v > 0 && v !== x.h) dispatch({ type: 'height', i, v }) }} /></td>
              <td className="r">{(x.h / 1000).toFixed(3)}</td><td className="r">{((x.h / 1000) * (1 + tolPct(S) / 100)).toFixed(3)}</td><td className="r">{f2(cost(S, x))}</td></tr>))}
        </Table>
        <h2 style={{ marginTop: 18 }}>Add a size</h2>
        <div className="fm">
          <label>Name<input value={z.n} onChange={(e) => setZ({ ...z, n: e.target.value })} /></label>
          <label>Category<select value={z.c} onChange={(e) => setZ({ ...z, c: e.target.value })}><option>adult</option><option>kids</option></select></label>
          <label>Pattern height, mm<input type="number" value={z.h} onChange={(e) => setZ({ ...z, h: e.target.value })} /></label>
          <button className="btn" disabled={!canEdit} onClick={() => { if (z.n.trim() && +z.h > 0) { dispatch({ type: 'addSize', size: { n: z.n.trim(), c: z.c, h: +z.h } }); setZ({ n: '', c: 'adult', h: '' }) } }}>Add size</button>
        </div>
      </div>
    </>
  )
}

export function Overheads() {
  const { S, dispatch } = useApp(), [x, setX] = useState({ n: '', a: '', d: TODAY })
  return (
    <>
      <Head title="Overheads" sub="Daily or monthly fixed costs used for break-even and net profit." />
      <div className="card"><h2>Add an overhead</h2>
        <div className="fm">
          <label>Item<input value={x.n} onChange={(e) => setX({ ...x, n: e.target.value })} placeholder="e.g. Rent" /></label>
          <label>Amount (P)<input type="number" min="0" value={x.a} onChange={(e) => setX({ ...x, a: e.target.value })} /></label>
          <label>Date<input type="date" value={x.d} onChange={(e) => setX({ ...x, d: e.target.value })} /></label>
          <button className="btn" onClick={() => { if (x.n.trim() && +x.a > 0 && x.d) { dispatch({ type: 'addOver', n: x.n.trim(), a: +x.a, d: x.d }); setX({ ...x, n: '', a: '' }) } }}>Add overhead</button>
        </div></div>
      <div className="card">{S.over.length ? (
        <Table head={['Date', 'Item', 'Amount', '']} right={2}>
          {S.over.map((v, i) => ({ v, i })).sort((a, b) => b.v.d.localeCompare(a.v.d)).map(({ v, i }) => (
            <tr key={i}><td>{fd(v.d)}</td><td>{v.n}</td><td className="r">{f2(v.a)}</td><td><button className="btn o" onClick={() => dispatch({ type: 'delOver', i })}>Remove</button></td></tr>))}
        </Table>) : <p className="sub">No overheads recorded yet.</p>}</div>
    </>
  )
}

export function Audit() {
  const { S } = useApp()
  return (
    <>
      <Head title="Audit log" sub="Every change with who made it and when. The database keeps a separate append-only copy." />
      <div className="card"><Table head={['When', 'Who', 'Job card', 'What happened']}>
        {S.audit.map((a, i) => <tr key={i}><td>{a.ts}</td><td>{a.u}</td><td>{a.o}</td><td style={{ whiteSpace: 'normal' }}>{a.t}</td></tr>)}
      </Table></div>
    </>
  )
}

const QUICK = ['Which jobs are least profitable and why?', 'Which cost category is driving our production cost?', 'Which orders are waiting on a deposit or payment?', 'What price would give a 30% gross margin on each size?', 'Can we accept another order of 100 shirts without delaying current jobs?']

export function Assistant() {
  const { S, session } = useApp(), [q, setQ] = useState(''), [ans, setAns] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const al = alerts(S), ok = !!(supabase && session)
  const ask = async () => {
    if (!q.trim()) return setErr('Type or choose a question first.')
    setBusy(true); setErr(''); setAns('')
    const { data, error } = await supabase.functions.invoke('ask-luna', { body: { question: q.trim(), snapshot: snapshot(S) } })
    let msg = error?.message || data?.error || 'no answer returned'
    if (error?.context?.json) { try { msg = (await error.context.json()).error || msg } catch {} }
    if (error || !data?.answer) setErr('The assistant could not answer: ' + msg)
    else setAns(data.answer)
    setBusy(false)
  }
  return (
    <>
      <Head title="AI assistant" sub="The app calculates every figure; the assistant explains them and suggests actions. It cannot change any records." />
      <div className="card"><h2>Alerts from your recorded data</h2>
        {al.length ? al.map((a) => <div className="note w" key={a}>{a}</div>) : <p className="sub">No alerts right now.</p>}</div>
      <div className="card"><h2>Ask the assistant</h2>
        {!ok && <div className="note w">Sign in with Supabase first. The assistant runs through your secure backend, so the AI key never reaches the browser.</div>}
        <label>Quick question<select value="" onChange={(e) => setQ(e.target.value)}><option value="">Choose a question</option>{QUICK.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label style={{ marginTop: 10 }}>Your question
          <textarea value={q} maxLength={500} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', minHeight: 90, font: 'inherit', padding: '8px 10px', marginTop: 4, boxSizing: 'border-box', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--card)', color: 'var(--ink)' }} /></label>
        <p><button className="btn" disabled={!ok || busy} onClick={ask}>{busy ? 'Thinking…' : 'Ask'}</button></p>
        {err && <div className="note w">{err}</div>}
        {ans && <div className="note" style={{ whiteSpace: 'pre-wrap' }}>{ans}</div>}
        <details><summary>Data sent to the assistant</summary><pre style={{ overflow: 'auto', fontSize: 12 }}>{JSON.stringify(snapshot(S), null, 1)}</pre></details></div>
    </>
  )
}

const csv = (rows) => rows.map((r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')
const save = (name, text, type = 'text/csv') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href) }

export function Data() {
  const { S, dispatch } = useApp(), [msg, setMsg] = useState('')
  const stamp = TODAY
  const orders = () => save(`orders-${stamp}.csv`, csv([['Job card', 'Quotation', 'Invoice', 'Date', 'Due', 'Received by', 'Placed by', 'Entity', 'Phone', 'Shirts', 'Net total', 'Production cost', 'Paid', 'Balance', 'Status'],
    ...S.orders.map((o) => { const c = calc(S, o); return [o.jc, o.qt, o.inv, o.date, o.dueDate, o.by, o.placed, o.ent, o.phone, c.q, c.net.toFixed(2), c.cs.toFixed(2), c.paid.toFixed(2), c.bal.toFixed(2), phase(S, o)] })]))
  const pays = () => save(`payments-${stamp}.csv`, csv([['Job card', 'Date', 'Paid by', 'Entity', 'Amount'], ...S.orders.flatMap((o) => o.pays.map((p) => [o.jc, p.d, p.by, p.ent, p.amt.toFixed(2)]))]))
  const audit = () => save(`audit-${stamp}.csv`, csv([['When', 'Who', 'Job card', 'What happened'], ...S.audit.map((a) => [a.ts, a.u, a.o, a.t])]))
  const restore = (e) => {
    const f = e.target.files[0]; if (!f) return
    f.text().then((t) => {
      try {
        const j = JSON.parse(t)
        if (!Array.isArray(j.orders) || !j.R || !Array.isArray(j.sizes)) throw new Error('This is not an Anlix tracker backup.')
        if (!confirm('Replace all current data with this backup?')) return
        dispatch({ type: 'load', state: j }); setMsg('Backup restored.')
      } catch (x) { setMsg('Could not restore: ' + x.message) }
    })
    e.target.value = ''
  }
  return (
    <>
      <Head title="Data and backups" sub="Download your records, or restore from a backup file." />
      <div className="card"><h2>Backup</h2>
        <p className="sub">The backup holds everything: orders, payments, prices, overheads and the audit log. Keep a copy somewhere safe, and test a restore now and then.</p>
        <p><button className="btn" onClick={() => save(`anlix-backup-${stamp}.json`, JSON.stringify(S, null, 1), 'application/json')}>Download backup</button></p>
        <label>Restore from backup<input type="file" accept="application/json,.json" onChange={restore} /></label>
        {msg && <div className="note">{msg}</div>}</div>
      <div className="card"><h2>Export to Excel (CSV)</h2>
        <div className="chips"><button className="btn o" onClick={orders}>Orders</button><button className="btn o" onClick={pays}>Payments</button><button className="btn o" onClick={audit}>Audit log</button></div></div>
    </>
  )
}

export { Invoice, Quotation } from './Invoice'
