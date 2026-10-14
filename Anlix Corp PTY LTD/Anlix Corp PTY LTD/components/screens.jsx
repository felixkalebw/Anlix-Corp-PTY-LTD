'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell, LabelList, ComposedChart, Line } from 'recharts'
import { useApp } from './Store'
import { supabase } from '@/lib/supabase'
import { TODAY, f2, f0, pc, fd, sum, sz, cost, price, qty, calc, unit, alerts, snapshot, costParts, jobNo, materialPlan, COST_N, STAGES, mkStages, isDone, progress, overdue, phase, phaseTag } from '@/lib/model'

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

function OrdersTable({ list }) {
  const { S } = useApp()
  return (
    <Table head={['Job card', 'Date', 'Due', 'Placed by', 'Entity', 'Shirts', 'Net total', 'Balance', 'Progress', 'Status']} right={5}>
      {list.map((o) => { const c = calc(S, o), p = progress(o); return (
        <tr key={o.jc}><td><Link href={'/orders/' + o.jc}>{o.jc}</Link></td><td>{fd(o.date)}</td>
          <td style={overdue(o) ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{o.dueDate ? fd(o.dueDate) : '–'}</td><td>{o.placed}</td><td>{o.ent}</td>
          <td className="r">{c.q}</td><td className="r">{f2(c.net)}</td><td className="r">{f2(c.bal)}</td>
          <td style={{ minWidth: 90 }}><div className="mt" title={p + '%'}><div className="mb" style={{ width: p + '%' }} /></div></td><td><Tag o={o} /></td></tr>
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

export function Dashboard() {
  const { S } = useApp()
  const [m, setM] = useState(TODAY.slice(0, 7)), [wk, setWk] = useState(0)
  const W = weeksOf(m), wi = wk > W.length ? 0 : wk
  const r0 = wi ? W[wi - 1].s : W[0].s, r1 = wi ? W[wi - 1].e : W[W.length - 1].e
  const inR = (d, a = r0, b = r1) => d >= a && d <= b
  const pays = S.orders.flatMap((o) => o.pays.map((p) => ({ ...p, jc: o.jc })))
  const months = [...new Set([TODAY.slice(0, 7), m, ...S.orders.map((o) => o.date.slice(0, 7)), ...pays.map((p) => p.d.slice(0, 7)), ...S.over.map((x) => x.d.slice(0, 7))])].sort().reverse()

  // This period only: revenue by payment date, orders by the date they were received, overheads by their own date
  const ord = S.orders.filter((o) => inR(o.date)), pys = pays.filter((p) => inR(p.d)), ovs = S.over.filter((x) => inR(x.d))
  const rev = sum(pys, (p) => p.amt), cs = sum(ord, (o) => calc(S, o).cs), gp = sum(ord, (o) => calc(S, o).gp), ov = sum(ovs, (x) => x.a), net = gp - ov
  const n = ord.length, shirts = sum(ord, qty)

  const wkData = W.map((w, i) => {
    const a = S.orders.filter((o) => inR(o.date, w.s, w.e)), g = sum(a, (o) => calc(S, o).gp), o2 = sum(S.over.filter((x) => inR(x.d, w.s, w.e)), (x) => x.a)
    return { n: 'Wk ' + (i + 1), Revenue: sum(pays.filter((p) => inR(p.d, w.s, w.e)), (p) => p.amt), 'Production cost': sum(a, (o) => calc(S, o).cs), 'Gross profit': g, 'Net profit': g - o2 }
  })
  const days = []
  for (let t = new Date(r0 + 'T00:00:00Z'); isoD(t) <= r1; t = new Date(t.getTime() + 864e5)) days.push(isoD(t))
  const dayData = days.map((d) => ({ n: String(+d.slice(8)), Revenue: sum(pys.filter((p) => p.d === d), (p) => p.amt), 'Production cost': sum(ord.filter((o) => o.date === d), (o) => calc(S, o).cs), Overheads: sum(ovs.filter((x) => x.d === d), (x) => x.a) }))
  const po = ord.map((o) => { const c = calc(S, o); return { n: o.jc.slice(-4) + ' ' + String(o.ent).slice(0, 12), 'Production cost': +c.cs.toFixed(2), 'Overhead share': shirts ? +((ov * c.q) / shirts).toFixed(2) : 0 } })
  const comp = costParts(S, ord).comp, split = COST_N.map((k, i) => ({ k, v: comp[i] })).filter((x) => x.v > 0)
  const en = {}; pys.forEach((p) => { const k = p.ent || '–'; en[k] = (en[k] || 0) + p.amt })
  const payers = Object.entries(en).map(([k, v]) => ({ k, v }))
  const mo = S.orders.filter((o) => inR(o.date, W[0].s, W[W.length - 1].e)), sold = sum(mo, qty), tgp = sum(mo, (o) => calc(S, o).gp)
  const ovM = sum(S.over.filter((x) => inR(x.d, W[0].s, W[W.length - 1].e)), (x) => x.a)
  const avg = sold ? tgp / sold : sum(S.sizes, (z) => S.T[z.c][1] - cost(S, z)) / S.sizes.length, be = avg > 0 && ovM > 0 ? Math.ceil(ovM / avg) : 0
  const sizeData = S.sizes.map((z) => { const c = cost(S, z), p = S.T[z.c][1]; return { n: z.n, Cost: +c.toFixed(2), Margin: +(((p - c) / p) * 100).toFixed(1) } })
  const owing = S.orders.map((o) => ({ n: o.jc.slice(-4) + ' ' + String(o.ent).slice(0, 12), Balance: +calc(S, o).bal.toFixed(2) })).filter((x) => x.Balance > 0.005)
  const empty = (t) => <p className="sub">{t}</p>
  const money = (v) => f2(v)

  return (
    <>
      <Head title="Dashboard" sub="Weekly, daily and per-order figures" />
      <div className="chips">
        <select aria-label="Month" value={m} onChange={(e) => { setM(e.target.value); setWk(0) }} style={{ width: 'auto', marginTop: 0 }}>
          {months.map((x) => <option key={x} value={x}>{new Date(x + '-01T00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>)}
        </select>
        {['Whole month', ...W.map((w, i) => `Wk ${i + 1} · ${w.a}–${w.b}`)].map((x, i) => <button key={x} className={'chip' + (wi === i ? ' on' : '')} onClick={() => setWk(i)}>{x}</button>)}
      </div>
      <div className="pb-tiles">
        <Kc title="Revenue received" sub="Payments dated in this period" value={money(rev)} color={COL.rev} />
        <Kc title="Production cost" sub={`${n} orders received`} value={money(cs)} color="#D4460C" />
        <Kc title="Gross profit" sub="Same orders" value={money(gp)} color="#1B8A55" />
        <Kc title="Overheads" sub="Dated in this period" value={money(ov)} color={COL.oh} dark />
        <Kc title="Net profit" sub="After overheads" value={money(net)} color={net < 0 ? '#C62828' : '#6A3FE0'} />
        <Kc title="Spend per order" sub={`${shirts} shirts`} value={money(n ? (cs + ov) / n : 0)} color="#C4006C" />

        <Tile n={12} title="Week by week" sub="Revenue, production cost, gross profit and net profit for each week of the month">
          <ResponsiveContainer width="100%" height={300}><BarChart data={wkData} margin={{ top: 10 }}><CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="n" {...AX} /><YAxis {...AX} width={52} tickFormatter={kfmt} /><Tooltip {...TT} formatter={money} /><Legend iconSize={10} />
            <Bar dataKey="Revenue" fill={COL.rev} radius={[4, 4, 0, 0]} /><Bar dataKey="Production cost" fill={COL.cost} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gross profit" fill={COL.gp} radius={[4, 4, 0, 0]} /><Bar dataKey="Net profit" fill={COL.net} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Tile>
        <Tile n={12} title="Day by day" sub="Inside the selected period">
          <ResponsiveContainer width="100%" height={260}><BarChart data={dayData} margin={{ top: 10 }}><CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="n" {...AX} interval={0} /><YAxis {...AX} width={52} tickFormatter={kfmt} /><Tooltip {...TT} formatter={money} labelFormatter={(l) => 'Day ' + l} /><Legend iconSize={10} />
            <Bar dataKey="Revenue" fill={COL.rev} radius={[3, 3, 0, 0]} /><Bar dataKey="Production cost" fill={COL.cost} radius={[3, 3, 0, 0]} /><Bar dataKey="Overheads" fill={COL.oh} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></Tile>

        <Tile n={5} title="Spend per order" sub="Production cost plus the order's share of overheads">
          {po.length ? <ResponsiveContainer width="100%" height={Math.max(220, po.length * 38 + 60)}><BarChart data={po} layout="vertical" margin={{ right: 16 }}>
            <XAxis type="number" {...AX} tickFormatter={kfmt} /><YAxis type="category" dataKey="n" {...AX} width={110} interval={0} /><Tooltip {...TT} formatter={money} /><Legend iconSize={10} />
            <Bar dataKey="Production cost" stackId="a" fill={COL.cost} /><Bar dataKey="Overhead share" stackId="a" fill={COL.oh} /></BarChart></ResponsiveContainer> : empty('No orders received in this period.')}</Tile>
        <Tile n={3} title="Where production cost goes" sub="This period">
          {split.length ? <ResponsiveContainer width="100%" height={250}><PieChart><Pie data={split} dataKey="v" nameKey="k" innerRadius={48} outerRadius={80} paddingAngle={2}>
            {split.map((x, i) => <Cell key={x.k} fill={RAINBOW[i % RAINBOW.length]} />)}</Pie><Tooltip {...TT} formatter={money} /><Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer> : empty('No orders in this period.')}</Tile>
        <Tile n={4} title="Revenue by payer" sub="Payments in this period">
          {payers.length ? <ResponsiveContainer width="100%" height={250}><PieChart><Pie data={payers} dataKey="v" nameKey="k" innerRadius={48} outerRadius={80} paddingAngle={2}>
            {payers.map((x, i) => <Cell key={x.k} fill={RAINBOW[(i + 1) % RAINBOW.length]} />)}</Pie><Tooltip {...TT} formatter={money} /><Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer> : empty('No payments in this period.')}</Tile>

        <Tile n={3} title="Break-even" sub="Whole month, overheads included">
          {be ? (<div style={{ position: 'relative' }}>
            <ResponsiveContainer width="100%" height={170}><PieChart><Pie data={[{ v: Math.min(sold, be) }, { v: Math.max(be - sold, 0) }]} dataKey="v" startAngle={180} endAngle={0} cy="90%" innerRadius="75%" outerRadius="105%" stroke="none">
              <Cell fill={COL.gp} /><Cell fill="var(--line)" /></Pie></PieChart></ResponsiveContainer>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 4, textAlign: 'center' }}><b style={{ fontSize: 24 }}>{sold} / {be}</b><div className="sub">shirts sold</div></div></div>) : empty('Add overheads for this month to see break-even.')}</Tile>
        <Tile n={5} title="Cost per shirt and margin by size" sub="Margin at the quantity price">
          <ResponsiveContainer width="100%" height={260}><ComposedChart data={sizeData}><CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="n" {...AX} interval={0} angle={-35} textAnchor="end" height={54} /><YAxis yAxisId="l" {...AX} width={46} tickFormatter={kfmt} /><YAxis yAxisId="r" orientation="right" {...AX} width={40} unit="%" />
            <Tooltip {...TT} formatter={(v, name) => (name === 'Margin' ? v + '%' : money(v))} /><Legend iconSize={10} />
            <Bar yAxisId="l" dataKey="Cost" radius={[4, 4, 0, 0]}>{sizeData.map((x, i) => <Cell key={x.n} fill={RAINBOW[i % RAINBOW.length]} />)}</Bar>
            <Line yAxisId="r" dataKey="Margin" stroke="#E6007E" strokeWidth={2.5} dot={{ r: 4, fill: '#E6007E' }} /></ComposedChart></ResponsiveContainer></Tile>
        <Tile n={4} title="Outstanding balances" sub="All open invoices">
          {owing.length ? <ResponsiveContainer width="100%" height={Math.max(220, owing.length * 38 + 50)}><BarChart data={owing} layout="vertical" margin={{ right: 16 }}>
            <XAxis type="number" {...AX} tickFormatter={kfmt} /><YAxis type="category" dataKey="n" {...AX} width={110} interval={0} /><Tooltip {...TT} formatter={money} />
            <Bar dataKey="Balance" radius={[0, 4, 4, 0]}>{owing.map((x, i) => <Cell key={x.n} fill={RAINBOW[i % RAINBOW.length]} />)}</Bar></BarChart></ResponsiveContainer> : empty('All invoices are paid.')}</Tile>
      </div>
    </>
  )
}

const FILTERS = ['All', 'Overdue', 'Awaiting deposit or payment', 'Artwork pending', 'In production', 'Quality hold', 'Ready for collection', 'Completed']

export function Orders() {
  const { S } = useApp(), [q, setQ] = useState(''), [f, setF] = useState('All')
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

const MaterialPlan = ({ lines, title = 'Materials and production cost' }) => {
  const { S } = useApp()
  const m = materialPlan(S, lines)
  return (
    <div className="card"><h2>{title}</h2>
      {m.shirts ? (
        <>
          <Table head={['Colour', 'Fabric', 'Sizes', 'Shirts', 'Fabric (m)', 'Fabric cost', 'Production cost']} right={3}>
            {m.rows.map((g) => (
              <tr key={g.colour + '|' + g.fabric}><td>{g.colour}</td><td>{g.fabric || '–'}</td><td>{g.sizeText}</td><td className="r">{g.shirts}</td>
                <td className="r">{g.metres.toFixed(2)}</td><td className="r">{f2(g.fabricCost)}</td><td className="r">{f2(g.cost)}</td></tr>
            ))}
          </Table>
          <div className="tot"><span>Fabric, {m.metres.toFixed(2)} m at {f2(S.R.fabric)} per m</span><span>{f2(m.parts.fabric)}</span></div>
          <div className="tot"><span>Printing, at {f2(S.R.print)} per m</span><span>{f2(m.parts.print)}</span></div>
          <div className="tot"><span>Pressing, at {f2(S.R.press)} per m</span><span>{f2(m.parts.press)}</span></div>
          <div className="tot"><span>Sewing, {m.shirts} shirts at {f2(S.R.sew)}</span><span>{f2(m.parts.sew)}</span></div>
          <div className="tot big"><span>Production cost</span><span>{f2(m.total)}</span></div>
          <div className="tot"><span>Average per shirt</span><span>{f2(m.avg)}</span></div>
          <p className="sub">Fabric length is pattern height × quantity, at the rates in Costing and prices. No allowance is made for cutting waste or rework.</p>
        </>
      ) : <p className="sub">Add items with a valid size and quantity to see the fabric needed and the cost of production.</p>}
    </div>
  )
}

const LIST_HINT = 'Black T-shirts: 5 x M, 10 x L, 2 x XL\nRoyal blue golf shirt - 3 medium, 4 large\nKids 7-8 white x 6'

export function NewOrder() {
  const { S, dispatch } = useApp(), router = useRouter(), nid = useRef(0)
  const mk = (o) => ({ id: ++nid.current, s: '', q: 1, colour: '', fabric: '', desc: '', ...o })
  // CHANGED: added gpo: false at the end of this state object
  const [d, setD] = useState({ by: '', placed: '', ent: '', phone: '', dueDate: '', dt: '%', dv: 0, dr: '', gpo: false }), [lines, setLines] = useState([])
  const [tab, setTab] = useState('add'), [f, setF] = useState({ s: S.sizes[0].n, q: 1, colour: '', fabric: '', desc: '' })
  const [txt, setTxt] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [warns, setWarns] = useState([]), [perr, setPerr] = useState('')
  const [err, setErr] = useState(''), [tried, setTried] = useState(false)
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value })
  const setF1 = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const good = lines.filter((l) => sz(S, l.s) && l.q > 0), bad = lines.length - good.length
  const c = calc(S, { lines: good, dt: d.dt, dv: d.dv, pays: [] }), q = c.q
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
    const same = (l) => l.s === f.s && lc(l.colour) === lc(colour) && lc(l.fabric) === lc(fabric) && lc(l.desc) === lc(desc) && !l.unitPrice
    setErr('')
    setLines((ls) => (ls.some(same) ? ls.map((l) => (same(l) ? { ...l, q: l.q + n } : l)) : [...ls, mk({ s: f.s, q: n, colour, fabric, desc })]))
    setF({ ...f, q: 1, desc: '' })
  }
  const edit = (id, k, v) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, [k]: v, src: undefined } : l)))
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
            {/* ADDED: GPO checkbox */}
            <label style={{ flexDirection: 'row', display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={d.gpo} onChange={(e) => setD({ ...d, gpo: e.target.checked })} /> GPO order (payment is made after delivery)</label>
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
                <label>Size<select value={f.s} onChange={setF1('s')}>{S.sizes.map((z) => <option key={z.n}>{z.n}</option>)}</select></label>
                <label>Quantity<input type="number" min="1" value={f.q} onChange={setF1('q')} /></label>
                <label>Colour<input list="order-colours" value={f.colour} onChange={setF1('colour')} placeholder="e.g. Black" /><datalist id="order-colours">{colours.map((x) => <option key={x} value={x} />)}</datalist></label>
                <label>Fabric (optional)<input value={f.fabric} onChange={setF1('fabric')} placeholder="e.g. Cotton" /></label>
                <label>Description<input value={f.desc} onChange={setF1('desc')} placeholder="e.g. Logo on chest, name on back" /></label>
                <button className="btn" onClick={add}>Add to order</button>
              </div>
              <p className="sub">Add as many sizes as you need. Each line keeps its own colour and description, so one order can mix sizes and designs.</p>
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
              <Table head={['Size', 'Qty', 'Colour', 'Fabric', 'Description', 'Unit price', 'Line total', '']} right={99}>
                {lines.map((l) => { const okL = sz(S, l.s) && l.q > 0, u = okL ? unit(S, l, q) : null; return (
                  <tr key={l.id}>
                    <td><select style={cell} value={l.s} aria-label="Size" aria-invalid={!sz(S, l.s)} onChange={(e) => edit(l.id, 's', e.target.value)}>{!sz(S, l.s) && <option value="">Choose size</option>}{S.sizes.map((z) => <option key={z.n}>{z.n}</option>)}</select></td>
                    <td style={{ width: 90 }}><input style={cell} type="number" min="1" value={l.q} aria-label="Quantity" onFocus={(e) => e.target.select()} onChange={(e) => edit(l.id, 'q', Math.max(0, Math.floor(+e.target.value) || 0))} /></td>
                    <td><input style={{ ...cell, minWidth: 110 }} value={l.colour} aria-label="Colour" list="order-colours" onChange={(e) => edit(l.id, 'colour', e.target.value)} /></td>
                    <td><input style={{ ...cell, minWidth: 100 }} value={l.fabric} aria-label="Fabric" onChange={(e) => edit(l.id, 'fabric', e.target.value)} /></td>
                    <td><input style={{ ...cell, minWidth: 200 }} value={l.desc} aria-label="Description" placeholder="Description" onChange={(e) => edit(l.id, 'desc', e.target.value)} /></td>
                    <td className="r">{u ? f2(u.price) : '–'}</td><td className="r">{u ? f2(l.q * u.price) : '–'}</td>
                    <td><button className="btn o" onClick={() => drop(l.id)} aria-label={'Remove ' + (l.s || 'item')}>Remove</button></td>
                  </tr>) })}
              </Table>
              {bad > 0 && <div className="note w">{bad} line{bad > 1 ? 's need' : ' needs'} a size and a quantity of at least 1 before the order can be registered.</div>}
              <p><button className="btn o" onClick={() => setLines(sortLines(lines))}>Sort by size and colour</button></p>
            </>
          ) : <p className="sub">No items yet. Add them one by one, or paste a list in the Manual override tab.</p>}
        </div>

        <div className="grid">
          <MaterialPlan lines={good} />
          <div className="card"><h2>Pricing and payment</h2>
            <div className={'note' + (q && q < S.thr ? ' w' : '')}>{q ? (q < S.thr ? `${q} shirts, under ${S.thr}: higher prices apply and the full amount is paid before production.` : `${q} shirts: ${S.thr}+ prices apply and a ${S.dep}% deposit is paid before production.`) : 'Add items to see prices.'}</div>
            <div className="tot"><span>Subtotal</span><span>{f2(c.sub)}</span></div>
            <div className="tot"><span>Discount</span><span>−{f2(c.d)}</span></div>
            <div className="tot big"><span>Net total</span><span>{f2(c.net)}</span></div>
            <div className="tot"><span>Payment required before production</span><span>{f2(c.req)}</span></div>
            <div className="tot"><span>Production cost</span><span>{f2(c.cs)}</span></div>
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
      {!o.prod ? <div className="note w">Stages unlock once
