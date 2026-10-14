'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell, LabelList } from 'recharts'
import { useApp } from './Store'
import { supabase } from '@/lib/supabase'
import { TODAY, f2, f0, pc, fd, sum, sz, cost, price, qty, calc, unit, alerts, snapshot, costParts, jobNo, COST_N, STAGES, mkStages, isDone, progress, overdue, phase, phaseTag } from '@/lib/model'

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

export function Dashboard() {
  const { S } = useApp()
  const [m, setM] = useState(TODAY.slice(0, 7)), [wk, setWk] = useState(0), [dr, setDr] = useState(null)
  const wkOf = (d) => Math.min(4, Math.ceil(+d.slice(8) / 7))
  const inP = (d) => d.startsWith(m) && (!wk || wkOf(d) === wk)
  const months = [...new Set([TODAY.slice(0, 7), ...S.orders.map((o) => o.date.slice(0, 7)), ...S.over.map((x) => x.d.slice(0, 7))])].sort().reverse()
  const ord = S.orders.filter((o) => inP(o.date)), mo = S.orders.filter((o) => o.date.startsWith(m))
  const pays = S.orders.flatMap((o) => o.pays).filter((p) => p.d.startsWith(m))
  const rev = sum(pays.filter((p) => inP(p.d)), (p) => p.amt), cs = sum(ord, (o) => calc(S, o).cs), gp = sum(ord, (o) => calc(S, o).gp)
  const ov = sum(S.over.filter((x) => inP(x.d)), (x) => x.a), ovM = sum(S.over.filter((x) => x.d.startsWith(m)), (x) => x.a)
  const shirts = sum(mo, qty), gpM = sum(mo, (o) => calc(S, o).gp), avg = shirts ? gpM / shirts : 0, be = avg > 0 && ovM > 0 ? Math.ceil(ovM / avg) : 0
  const out = S.orders.reduce((t, o) => t + Math.max(0, calc(S, o).bal), 0), nShirts = sum(ord, qty)
  const { jobs, comp } = costParts(S, ord), dir = sum(comp, (x) => x), full = dir + ov, top = comp.indexOf(Math.max(...comp))
  const WK = ['Days 1–7', 'Days 8–14', 'Days 15–21', 'Day 22 on']
  const wrev = WK.map((n, i) => ({ n, v: sum(pays.filter((p) => wkOf(p.d) === i + 1), (p) => p.amt) }))
  const wsh = WK.map((n, i) => { const os = mo.filter((o) => wkOf(o.date) === i + 1), by = (c) => sum(os, (o) => sum(o.lines.filter((l) => sz(S, l.s)?.c === c), (l) => l.q)); return { n, Adult: by('adult'), Kids: by('kids') } })
  const PH = ['Awaiting payment', 'Ready to start production', 'Artwork pending', 'In production', 'Quality hold', 'Ready for collection', 'Completed']
  const ph = (o) => { const p = phase(S, o); return p.startsWith('Awaiting') ? 'Awaiting payment' : p }
  const pipe = PH.map((k) => ({ k, v: ord.filter((o) => ph(o) === k).length }))
  const mix = [...months].sort().slice(-6).map((x) => { const cm = costParts(S, S.orders.filter((o) => o.date.startsWith(x))).comp
    return { n: new Date(x + '-01T00:00').toLocaleDateString('en-GB', { month: 'short' }), ...Object.fromEntries(COST_N.map((k, i) => [k, cm[i]])) } })
  const msz = S.sizes.map((z) => { const c = cost(S, z), a = S.T[z.c]; return { n: z.n, small: +(((a[0] - c) / a[0]) * 100).toFixed(1), bulk: +(((a[1] - c) / a[1]) * 100).toFixed(1) } })
  const byEnt = Object.entries(ord.reduce((t, o) => ({ ...t, [o.ent]: (t[o.ent] || 0) + calc(S, o).net }), {})).map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v).slice(0, 8)
  const rows = [...COST_N, 'Allocated overhead'].map((n, i) => ({ n, v: i < 6 ? comp[i] : ov }))
  const empty = (t) => <p className="sub">{t}</p>
  return (
    <>
      <Head title="Dashboard" sub="Orders, payments, costs and margins" />
      <div className="chips">
        <select aria-label="Month" value={m} onChange={(e) => setM(e.target.value)} style={{ width: 'auto', marginTop: 0 }}>
          {months.map((x) => <option key={x} value={x}>{new Date(x + '-01T00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>)}
        </select>
        {['Whole month', ...WK].map((x, i) => <button key={x} className={'chip' + (wk === i ? ' on' : '')} onClick={() => setWk(i)}>{x}</button>)}
      </div>
      <div className="pb-tiles">
        <Kpi title="Orders" sub="In period" value={ord.length} />
        <Kpi title="Shirts" sub="Ordered" value={nShirts} />
        <Kpi title="Revenue received" sub="By payment date" value={f0(rev)} />
        <Kpi title="Production cost" sub="Direct cost" value={f0(cs)} />
        <Kpi title="Gross profit" sub="Net sales less cost" value={f0(gp)} />
        <Kpi title="Outstanding balance" sub="All open invoices" value={f0(out)} />

        <Tile n={3} title="Revenue received" sub="By week of month">
          <ResponsiveContainer width="100%" height={210}><BarChart data={wrev} margin={{ top: 16 }}><XAxis dataKey="n" {...AX} /><YAxis {...AX} width={46} tickFormatter={(v) => 'P' + (v >= 1000 ? v / 1000 + 'k' : v)} />
            <Tooltip {...TT} formatter={(v) => f2(v)} /><Bar dataKey="v" name="Revenue" fill={PBI[0]}><LabelList dataKey="v" position="top" formatter={(v) => (v ? f0(v) : '')} {...LBL} /></Bar></BarChart></ResponsiveContainer></Tile>
        <Tile n={3} title="Shirts ordered" sub="By week, adult and kids">
          <ResponsiveContainer width="100%" height={210}><BarChart data={wsh} margin={{ top: 16 }}><XAxis dataKey="n" {...AX} /><YAxis {...AX} width={34} allowDecimals={false} /><Tooltip {...TT} /><Legend iconSize={10} />
            <Bar dataKey="Adult" fill={PBI[0]} /><Bar dataKey="Kids" fill={PBI[1]} /></BarChart></ResponsiveContainer></Tile>
        <Tile n={3} title="Orders" sub="By status">
          {ord.length ? <ResponsiveContainer width="100%" height={210}><PieChart><Pie data={pipe.filter((x) => x.v)} dataKey="v" nameKey="k" outerRadius={62} label={(e) => e.value}>
            {pipe.filter((x) => x.v).map((x, i) => <Cell key={x.k} fill={PBI[i % 7]} />)}</Pie><Tooltip {...TT} /><Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer> : empty('No orders in this period.')}</Tile>
        <Tile n={3} title="Break-even" sub="This month, including overheads">
          <div className="pb-big" style={{ fontSize: 34, minHeight: 90, justifyContent: 'center' }}>{be ? be + ' shirts' : 'Not enough data'}</div>
          <div className="mt"><div className="mb" style={{ width: (be ? Math.min(100, (shirts / be) * 100) : 0) + '%' }} /></div>
          <div className="sub">{shirts} sold{be ? (shirts >= be ? `, ${shirts - be} above` : `, ${be - shirts} to go`) : ''}. Overheads {f0(ovM)} ÷ {f2(avg)} gross profit per shirt.</div></Tile>

        <Tile n={4} title="Cost mix" sub="By month and cost category, 100% stacked">
          {mix.length ? <ResponsiveContainer width="100%" height={360}><BarChart data={mix} stackOffset="expand"><XAxis dataKey="n" {...AX} /><YAxis {...AX} width={44} tickFormatter={(v) => Math.round(v * 100) + '%'} />
            <Tooltip {...TT} formatter={(v) => f2(v)} /><Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />{COST_N.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={PBI[i]} />)}</BarChart></ResponsiveContainer> : empty('No data yet.')}</Tile>
        <Tile n={5} title="Margin by size" sub={`By size, under ${S.thr} shirts and ${S.thr}+ shirts`}>
          <ResponsiveContainer width="100%" height={Math.max(300, msz.length * 34)}><BarChart data={msz} layout="vertical" margin={{ right: 40 }}><CartesianGrid horizontal={false} stroke="var(--line)" />
            <XAxis type="number" {...AX} unit="%" /><YAxis type="category" dataKey="n" {...AX} width={66} interval={0} /><Tooltip {...TT} formatter={(v) => v + '%'} /><Legend iconSize={10} />
            <Bar dataKey="small" name={`Under ${S.thr}`} fill={PBI[0]} barSize={10}><LabelList dataKey="small" position="right" formatter={(v) => v + '%'} {...LBL} /></Bar>
            <Bar dataKey="bulk" name={`${S.thr}+`} fill={PBI[2]} barSize={10}><LabelList dataKey="bulk" position="right" formatter={(v) => v + '%'} {...LBL} /></Bar></BarChart></ResponsiveContainer></Tile>
        <Tile n={3} title="Order pipeline" sub="Orders by stage"><Funnel rows={pipe} /></Tile>

        <Tile n={4} title="Net sales" sub="By customer">
          {byEnt.length ? <ResponsiveContainer width="100%" height={Math.max(180, byEnt.length * 38)}><BarChart data={byEnt} layout="vertical" margin={{ right: 70 }}><XAxis type="number" hide /><YAxis type="category" dataKey="n" {...AX} width={90} interval={0} />
            <Tooltip {...TT} formatter={(v) => f2(v)} /><Bar dataKey="v" name="Net sales" fill={PBI[0]} barSize={16}><LabelList dataKey="v" position="right" formatter={(v) => f0(v)} {...LBL} /></Bar></BarChart></ResponsiveContainer> : empty('No orders in this period.')}</Tile>
        <Tile n={5} title="Cost breakdown" sub="By category in Pula, select a bar for its jobs">
          <ResponsiveContainer width="100%" height={300}><BarChart data={rows} layout="vertical" margin={{ right: 120 }}><XAxis type="number" hide /><YAxis type="category" dataKey="n" {...AX} width={140} interval={0} />
            <Tooltip {...TT} formatter={(v) => f2(v)} /><Bar dataKey="v" name="Cost" barSize={18} cursor="pointer" onClick={(_d, i) => setDr(i)}>{rows.map((r, i) => <Cell key={r.n} fill={PBI[i % 7]} />)}
              <LabelList dataKey="v" position="right" formatter={(v) => `${f2(v)} · ${full ? Math.round((v / full) * 100) : 0}%`} {...LBL} /></Bar></BarChart></ResponsiveContainer>
          <div className="sub">{dir > 0 ? `Biggest driver: ${COST_N[top]}, ${Math.round((comp[top] / dir) * 100)}% of direct cost.` : 'No orders in this period.'} Full cost per shirt {nShirts ? f2(full / nShirts) : '–'}.</div></Tile>
        <div className="pb-c3 pb-stack">
          <Kpi n={3} title="Net profit" sub="After overheads" value={wk ? 'Whole month' : f0(gp - ov)} />
          <Kpi n={3} title="Full cost per job" sub="Direct cost plus overhead" value={ord.length ? f0(full / ord.length) : '–'} />
        </div>

        {dr !== null && (
          <Tile n={12} title={dr < 6 ? COST_N[dr] + ': jobs behind this figure' : 'Allocated overhead'} sub="Drill-down">
            {dr === 6 ? <p className="sub">Overhead of {f2(ov)} recorded in this period is shared across {nShirts} shirts.</p> : jobs.filter((j) => j.v[dr] > 0).length ? (
              <Table head={['Job card', 'Customer', 'Shirts', 'Amount']} right={2}>
                {jobs.filter((j) => j.v[dr] > 0).map((j) => <tr key={j.o.jc}><td><Link href={'/orders/' + j.o.jc}>{j.o.jc}</Link></td><td>{j.o.ent}</td><td className="r">{j.sh}</td><td className="r">{f2(j.v[dr])}</td></tr>)}
              </Table>) : <p className="sub">Nothing recorded here for this period. Record an expense with the job card number as its reference.</p>}
          </Tile>)}
        <Tile n={12} title="Orders" sub="In this period">{ord.length ? <OrdersTable list={ord} /> : empty('No orders in this period.')}</Tile>
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

export function NewOrder() {
  const { S, dispatch } = useApp(), router = useRouter()
  const [d, setD] = useState({ by: S.user, placed: '', ent: '', phone: '', dueDate: '', dt: '%', dv: 0, dr: '' }), [lines, setLines] = useState([])
  const [ls, setLs] = useState(S.sizes[0].n), [lq, setLq] = useState(1), [err, setErr] = useState('')
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value })
  const c = calc(S, { lines, dt: d.dt, dv: d.dv, pays: [] }), q = c.q
  const add = () => { const n = Math.floor(+lq); if (n > 0) setLines(lines.some((l) => l.s === ls) ? lines.map((l) => (l.s === ls ? { ...l, q: l.q + n } : l)) : [...lines, { s: ls, q: n }]) }
  const reg = () => {
    if (!lines.length) return setErr('Add at least one size.')
    if (!d.placed.trim() || !d.ent.trim()) return setErr('Enter who placed the order and their entity or company.')
    if (+d.dv > 0 && !d.dr.trim()) return setErr('Enter a reason for the discount.')
    const jc = jobNo(S); dispatch({ type: 'register', d, lines }); router.push('/orders/' + jc)
  }
  return (
    <>
      <Head title="New order" sub="Register the order to get its job card, quotation and invoice numbers." />
      <div className="grid">
        <div className="card"><h2>Order details</h2>
          <div className="fm">
            <label>Received by<select value={d.by} onChange={set('by')}><option>Staff 1</option><option>Staff 2</option></select></label>
            <label>Placed by<input value={d.placed} onChange={set('placed')} placeholder="Person's name" /></label>
            <label>Entity or company<input value={d.ent} onChange={set('ent')} placeholder="Company name" /></label>
            <label>Phone<input type="tel" value={d.phone} onChange={set('phone')} /></label>
            <label>Due date<input type="date" value={d.dueDate} onChange={set('dueDate')} /></label>
          </div>
          <h2 style={{ marginTop: 18 }}>Add shirts</h2>
          <div className="fm">
            <label>Size<select value={ls} onChange={(e) => setLs(e.target.value)}>{S.sizes.map((z) => <option key={z.n}>{z.n}</option>)}</select></label>
            <label>Quantity<input type="number" min="1" value={lq} onChange={(e) => setLq(e.target.value)} /></label>
            <button className="btn" onClick={add}>Add to order</button>
          </div>
          <h2 style={{ marginTop: 18 }}>Discount</h2>
          <div className="fm">
            <label>Type<select value={d.dt} onChange={set('dt')}><option value="%">Percent</option><option value="P">Amount in P</option></select></label>
            <label>Value<input type="number" min="0" value={d.dv} onChange={set('dv')} /></label>
            <label>Reason<input value={d.dr} onChange={set('dr')} /></label>
          </div>
        </div>
        <div className="card"><h2>Pricing and payment</h2>
          <div className={'note' + (q && q < S.thr ? ' w' : '')}>{q ? (q < S.thr ? `${q} shirts, under ${S.thr}: higher prices apply and the full amount is paid before production.` : `${q} shirts: ${S.thr}+ prices apply and a ${S.dep}% deposit is paid before production.`) : 'Add sizes to see prices.'}</div>
          <Table head={['Size', 'Qty', 'Unit price', 'Line total', '']} right={1}>
            {lines.map((l, i) => { const p = price(S, sz(S, l.s), q); return (
              <tr key={l.s}><td>{l.s}</td><td className="r">{l.q}</td><td className="r">{f2(p)}</td><td className="r">{f2(l.q * p)}</td>
                <td><button className="btn o" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={'Remove ' + l.s}>Remove</button></td></tr>) })}
          </Table>
          <div className="tot"><span>Subtotal</span><span>{f2(c.sub)}</span></div>
          <div className="tot"><span>Discount</span><span>−{f2(c.d)}</span></div>
          <div className="tot big"><span>Net total</span><span>{f2(c.net)}</span></div>
          <div className="tot"><span>Payment required before production</span><span>{f2(c.req)}</span></div>
          {c.net > 0 && <div className="tot"><span>Expected margin</span><span>{pc(c.gp / c.net)}</span></div>}
          {c.net > 0 && c.net < c.cs && <div className="note w">The net total is below production cost.</div>}
          {err && <div className="note w">{err}</div>}
          <p><button className="btn" onClick={reg}>Register job card</button></p>
        </div>
      </div>
    </>
  )
}

const ST_TAG = { pending: '', active: 'b', done: 'g', skipped: '' }
const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

function Production({ o, c }) {
  const { dispatch } = useApp()
  const st = o.stages && o.stages.length ? o.stages : mkStages()
  const reworking = st.some((s) => /^Rework/.test(s.k) && s.st === 'active')
  const act = (k, op) => dispatch({ type: 'stage', jc: o.jc, k, op })
  return (
    <div className="card"><h2>Production stages</h2>
      {!o.prod ? <div className="note w">Stages unlock once the required payment is recorded and the job is moved to production.</div> : (
        <Table head={['Stage', 'Status', 'By', 'Started', 'Finished', '']}>
          {st.map((s) => { const qc = s.k === STAGES[4], fin = s.k === STAGES[6]; return (
            <tr key={s.k}><td>{s.k}{s.fails ? <span className="sub"> · failed {s.fails}×</span> : null}</td>
              <td><span className={'tag ' + (ST_TAG[s.st] || '')}>{s.st}{s.result ? ' · ' + s.result : ''}</span></td><td>{s.by || ''}</td><td>{when(s.start)}</td><td>{when(s.end)}</td>
              <td>{s.st === 'pending' && <><button className="btn o" disabled={qc && reworking} onClick={() => act(s.k, 'start')}>Start</button>{!qc && !fin && <> <button className="btn o" onClick={() => act(s.k, 'skip')}>Skip</button></>}</>}
                {s.st === 'active' && (qc ? <><button className="btn o" onClick={() => act(s.k, 'pass')}>Pass</button> <button className="btn o" onClick={() => act(s.k, 'fail')}>Fail</button></>
                  : <button className="btn o" disabled={fin && c.bal > 0.005} onClick={() => act(s.k, 'done')}>Complete</button>)}</td></tr>) })}
        </Table>)}
      {o.closed ? <div className="note">Closed {when(o.closed.at)}. Revenue {f2(o.closed.revenue)}, total cost {f2(o.closed.cost)}, actual profit {f2(o.closed.profit)} ({o.closed.revenue ? pc(o.closed.profit / o.closed.revenue) : '–'}).</div>
        : o.prod && <p><button className="btn" disabled={!st.every(isDone) || c.bal > 0.005} onClick={() => dispatch({ type: 'close', jc: o.jc })}>Close order and calculate profit</button></p>}
      {o.prod && !o.closed && c.bal > 0.005 && <div className="sub">Final payment must be received before the order can be closed.</div>}
    </div>
  )
}

export function Job() {
  const { jc } = useParams(), { S, dispatch } = useApp(), [p, setP] = useState({ amt: '', by: '', ent: '', d: TODAY }), [err, setErr] = useState('')
  const o = S.orders.find((x) => x.jc === decodeURIComponent(jc))
  if (!o) return (<><Head title="Job card not found" /><Link href="/orders">Back to orders</Link></>)
  const c = calc(S, o), pr = progress(o)
  const pay = () => {
    if (!(+p.amt > 0)) return setErr('Enter an amount.')
    if (+p.amt > c.bal + 0.005) return setErr(`The amount is more than the remaining balance of ${f2(c.bal)}.`)
    setErr(''); dispatch({ type: 'pay', jc: o.jc, amt: +p.amt, by: p.by || o.placed, ent: p.ent || o.ent, d: p.d }); setP({ ...p, amt: '' })
  }
  return (
    <>
      <div className="top"><div><h1>Job card {o.jc}</h1><div className="chips" style={{ marginTop: 8 }}><span className="tag b">{o.qt}</span><span className="tag b">{o.inv}</span><Tag o={o} />{overdue(o) && <span className="tag a">Overdue</span>}</div></div>
        <button className="btn o" onClick={() => window.print()}>Print job card</button></div>
      {o.stages && o.stages.length > 0 && <div><div className="mt"><div className="mb" style={{ width: pr + '%' }} /></div><div className="sub">{pr}% of production stages complete</div></div>}
      <div className="grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card"><h2>Order details</h2>
            <div className="kp">{[['Order date', fd(o.date)], ['Due date', o.dueDate ? fd(o.dueDate) : '–'], ['Received by', o.by], ['Placed by', o.placed], ['Entity', o.ent], ['Phone', o.phone || '–']].map(([l, v]) => <div key={l}><div className="sub">{l}</div>{v}</div>)}</div></div>
          <div className="card"><h2>Order lines</h2>
            <Table head={['Size', 'Qty', 'Unit price', 'Unit cost', 'Line total']} right={1}>
              {o.lines.map((l) => { const u = unit(S, l, c.q); return <tr key={l.s}><td>{l.s}</td><td className="r">{l.q}</td><td className="r">{f2(u.price)}</td><td className="r">{f2(u.cost)}</td><td className="r">{f2(l.q * u.price)}</td></tr> })}
            </Table>
            <div className="tot"><span>Subtotal</span><span>{f2(c.sub)}</span></div>
            <div className="tot"><span>Discount{o.dv ? ': ' + o.dr : ''}</span><span>−{f2(c.d)}</span></div>
            <div className="tot big"><span>Net total</span><span>{f2(c.net)}</span></div>
            <div className="tot"><span>Production cost</span><span>{f2(c.cs)}</span></div>
            <div className="tot"><span>Gross profit</span><span>{f2(c.gp)}</span></div></div>
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

export function Costing() {
  const { S, dispatch, canEdit } = useApp(), [z, setZ] = useState({ n: '', c: 'adult', h: '' })
  const R = (k, label) => <Num ro={!canEdit} key={k} label={label} value={S.R[k]} onSave={(v) => v !== S.R[k] && dispatch({ type: 'rate', k, v })} />
  const T = (c, j, label) => <Num ro={!canEdit} key={c + j} label={label} value={S.T[c][j]} onSave={(v) => v !== S.T[c][j] && dispatch({ type: 'tier', c, j, v })} />
  const G = (k, label) => <Num ro={!canEdit} key={k} label={label} value={S[k]} onSave={(v) => v !== S[k] && dispatch({ type: 'setting', k, v })} />
  return (
    <>
      <Head title="Costing and prices" sub={canEdit ? 'Changes recalculate every cost and margin. Orders keep the prices and costs saved when they were registered.' : 'Only an admin can change prices, rates and deposit rules.'} />
      <div className="grid">
        <div className="card"><h2>Cost rates</h2><div className="fm">{R('print', 'Printing, per metre')}{R('fabric', 'Fabric, per metre')}{R('press', 'Pressing, per metre')}{R('sew', 'Sewing, per shirt')}</div></div>
        <div className="card"><h2>Prices and payment rules</h2><div className="fm">
          {T('adult', 0, `Adult, under ${S.thr}`)}{T('adult', 1, `Adult, ${S.thr}+`)}{T('kids', 0, `Kids, under ${S.thr}`)}{T('kids', 1, `Kids, ${S.thr}+`)}
          {G('thr', 'Bulk threshold, shirts')}{G('dep', 'Deposit for bulk orders, %')}</div></div>
      </div>
      <div className="card"><h2>Sizes</h2>
        <Table head={['Size', 'Category', 'Pattern height, mm', 'Metres per shirt', 'Cost per shirt']} right={2}>
          {S.sizes.map((x, i) => (
            <tr key={x.n}><td>{x.n}{x.e ? <span className="sub"> estimate</span> : null}</td><td>{x.c}</td>
              <td className="r"><input type="number" defaultValue={x.h} key={x.h} aria-label={'Height of ' + x.n} disabled={!canEdit} style={{ width: 110, margin: '0 0 0 auto' }}
                onBlur={(e) => { const v = parseFloat(e.target.value); if (v > 0 && v !== x.h) dispatch({ type: 'height', i, v }) }} /></td>
              <td className="r">{(x.h / 1000).toFixed(3)}</td><td className="r">{f2(cost(S, x))}</td></tr>))}
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
    const { data, error } = await supabase.functions.invoke('ai-manager', { body: { question: q.trim(), snapshot: snapshot(S) } })
    if (error || !data?.answer) setErr('The assistant could not answer: ' + (error?.message || data?.error || 'no answer returned'))
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
