'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useApp } from './Store'
import { supabase } from '@/lib/supabase'
import { TODAY, f2, f0, pc, fd, sum, sz, cost, price, qty, calc, stat, unit, alerts, snapshot, costParts, jobNo, COST_N } from '@/lib/model'

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
const Tag = ({ o }) => { const { S } = useApp(); const [t, k] = stat(S, o); return <span className={'tag ' + k}>{t}</span> }
const Bar = ({ label, v, max, right, lo, cols, onClick }) => (
  <div className="mr" style={cols && { gridTemplateColumns: cols }} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
    onClick={onClick} onKeyDown={onClick && ((e) => e.key === 'Enter' && onClick())}>
    <span>{label}</span>
    <div className="mt"><div className={'mb' + (lo ? ' lo' : '')} style={{ width: Math.max(2, (v / (max || 1)) * 100) + '%' }} /></div>
    <span>{right}</span>
  </div>
)
const Num = ({ label, value, onSave }) => (
  <label>{label}<input type="number" step="any" min="0" defaultValue={value} key={value} onBlur={(e) => onSave(parseFloat(e.target.value) || 0)} /></label>
)

function OrdersTable({ list }) {
  const { S } = useApp()
  return (
    <Table head={['Job card', 'Date', 'Received by', 'Placed by', 'Entity', 'Shirts', 'Net total', 'Balance', 'Status']} right={5}>
      {list.map((o) => { const c = calc(S, o); return (
        <tr key={o.jc}><td><Link href={'/orders/' + o.jc}>{o.jc}</Link></td><td>{fd(o.date)}</td><td>{o.by}</td><td>{o.placed}</td><td>{o.ent}</td>
          <td className="r">{c.q}</td><td className="r">{f2(c.net)}</td><td className="r">{f2(c.bal)}</td><td><Tag o={o} /></td></tr>
      ) })}
    </Table>
  )
}

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
  const out = S.orders.reduce((t, o) => t + Math.max(0, calc(S, o).bal), 0)
  const { jobs, comp } = costParts(S, ord), dir = sum(comp, (x) => x), full = dir + ov
  const rows = [...comp, ov], names = [...COST_N, 'Allocated overhead'], top = comp.indexOf(Math.max(...comp))
  const wrev = [1, 2, 3, 4].map((w) => sum(pays.filter((p) => wkOf(p.d) === w), (p) => p.amt))
  const sizes = S.sizes.map((z) => { const c = cost(S, z), p = S.T[z.c][1]; return { n: z.n, c, mg: (p - c) / p } }), lo = Math.min(...sizes.map((x) => x.mg))
  const nShirts = sum(ord, qty)
  return (
    <>
      <Head title="Dashboard" sub="Orders, payments, costs and margins" />
      <div className="chips">
        <select aria-label="Month" value={m} onChange={(e) => setM(e.target.value)} style={{ width: 'auto', marginTop: 0 }}>
          {months.map((x) => <option key={x} value={x}>{new Date(x + '-01T00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>)}
        </select>
        {['Whole month', 'Days 1–7', 'Days 8–14', 'Days 15–21', 'Day 22 on'].map((x, i) => <button key={x} className={'chip' + (wk === i ? ' on' : '')} onClick={() => setWk(i)}>{x}</button>)}
      </div>
      <div className="kp">
        {[['Revenue received', f0(rev)], ['Production cost', f0(cs)], ['Gross profit', f0(gp)], ['Net profit after overheads', wk ? 'Whole month only' : f0(gp - ov)], ['Outstanding balance', f0(out)]].map(([l, v]) => (
          <div className="card" key={l}><div className="sub">{l}</div><div className="kv">{v}</div></div>))}
      </div>
      <div className="grid">
        <div className="card"><h2>Break-even this month</h2><div className="kv">{be ? be + ' shirts' : 'Not enough data'}</div>
          <div className="sub">Overheads {f0(ovM)} ÷ average gross profit {f2(avg)} per shirt sold</div>
          <div className="mt" style={{ margin: '14px 0 6px' }}><div className="mb" style={{ width: (be ? Math.min(100, (shirts / be) * 100) : 0) + '%' }} /></div>
          <div className="sub">{shirts} sold{be ? (shirts >= be ? `, ${shirts - be} above break-even` : `, ${be - shirts} to go`) : ''}</div></div>
        <div className="card"><h2>Revenue received per week</h2>
          {wrev.map((v, i) => <Bar key={i} label={'Wk ' + (i + 1)} v={v} max={Math.max(...wrev, 1)} right={f0(v)} />)}</div>
      </div>
      <div className="card"><h2>Cost breakdown</h2>
        {rows.map((v, i) => <Bar key={names[i]} label={names[i]} v={v} max={Math.max(...rows, 1)} cols="170px 1fr 150px" lo={i === 6}
          right={`${f2(v)} · ${full ? Math.round((v / full) * 100) : 0}%`} onClick={() => setDr(i)} />)}
        <div className="kp" style={{ marginTop: 12 }}>
          {[['Direct cost', f2(dir)], ['Full cost with overhead', f2(full)], ['Full cost per shirt', nShirts ? f2(full / nShirts) : '–'], ['Full cost per job', ord.length ? f2(full / ord.length) : '–']].map(([l, v]) => (
            <div key={l}><div className="sub">{l}</div><b>{v}</b></div>))}
        </div>
        <p className="sub">{dir > 0 ? `Biggest cost driver: ${COST_N[top]}, ${Math.round((comp[top] / dir) * 100)}% of direct cost.` : 'No orders in this period.'} Select a bar to see the jobs behind it.</p>
        {dr !== null && dr < 6 && (<><h2>{names[dr]}: jobs behind this figure</h2>
          {jobs.filter((j) => j.v[dr] > 0).length ? (
            <Table head={['Job card', 'Customer', 'Shirts', 'Amount']} right={2}>
              {jobs.filter((j) => j.v[dr] > 0).map((j) => <tr key={j.o.jc}><td><Link href={'/orders/' + j.o.jc}>{j.o.jc}</Link></td><td>{j.o.ent}</td><td className="r">{j.sh}</td><td className="r">{f2(j.v[dr])}</td></tr>)}
            </Table>) : <p className="sub">Nothing recorded here for this period. Record an expense with the job card number as its reference.</p>}</>)}
        {dr === 6 && <p className="sub">Overhead of {f2(ov)} recorded in this period is shared across {nShirts} shirts.</p>}
      </div>
      <div className="card"><h2>Margin by size (10+ prices)</h2>
        {sizes.map((x) => <Bar key={x.n} label={x.n} v={x.mg} max={0.7} lo={x.mg === lo} cols="80px 1fr 150px" right={`${pc(x.mg)} · ${f2(x.c)}`} />)}
        <div className="sub">Cost per shirt shown after each margin. Lowest margin is highlighted.</div></div>
      <div className="card"><h2>Orders in this period</h2>{ord.length ? <OrdersTable list={ord} /> : <p className="sub">No orders in this period.</p>}</div>
    </>
  )
}

export function Orders() {
  const { S } = useApp()
  return (
    <>
      <Head title="Orders" />
      <div className="card">{S.orders.length ? <OrdersTable list={[...S.orders].reverse()} /> : <p>No orders yet. Register the first order to get its job card number.</p>}
        <p><Link className="btn" href="/new" style={{ display: 'inline-flex', alignItems: 'center', color: '#fff', textDecoration: 'none' }}>New order</Link></p></div>
    </>
  )
}

export function NewOrder() {
  const { S, dispatch } = useApp(), router = useRouter()
  const [d, setD] = useState({ by: S.user, placed: '', ent: '', dt: '%', dv: 0, dr: '' }), [lines, setLines] = useState([])
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

export function Job() {
  const { jc } = useParams(), { S, dispatch } = useApp(), [p, setP] = useState({ amt: '', by: '', ent: '', d: TODAY })
  const o = S.orders.find((x) => x.jc === decodeURIComponent(jc))
  if (!o) return (<><Head title="Job card not found" /><Link href="/orders">Back to orders</Link></>)
  const c = calc(S, o), [st] = stat(S, o)
  const pay = () => { dispatch({ type: 'pay', jc: o.jc, amt: +p.amt, by: p.by || o.placed, ent: p.ent || o.ent, d: p.d }); setP({ ...p, amt: '' }) }
  return (
    <>
      <div className="top"><div><h1>Job card {o.jc}</h1><div className="chips" style={{ marginTop: 8 }}><span className="tag b">{o.qt}</span><span className="tag b">{o.inv}</span><span className="tag b">{st}</span></div></div></div>
      <div className="grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card"><h2>Order details</h2>
            <div className="kp">{[['Order date', fd(o.date)], ['Received by', o.by], ['Placed by', o.placed], ['Entity', o.ent]].map(([l, v]) => <div key={l}><div className="sub">{l}</div>{v}</div>)}</div></div>
          <div className="card"><h2>Order lines</h2>
            <Table head={['Size', 'Qty', 'Unit price', 'Unit cost', 'Line total']} right={1}>
              {o.lines.map((l) => { const u = unit(S, l, c.q); return <tr key={l.s}><td>{l.s}</td><td className="r">{l.q}</td><td className="r">{f2(u.price)}</td><td className="r">{f2(u.cost)}</td><td className="r">{f2(l.q * u.price)}</td></tr> })}
            </Table>
            <div className="tot"><span>Subtotal</span><span>{f2(c.sub)}</span></div>
            <div className="tot"><span>Discount{o.dv ? ': ' + o.dr : ''}</span><span>−{f2(c.d)}</span></div>
            <div className="tot big"><span>Net total</span><span>{f2(c.net)}</span></div>
            <div className="tot"><span>Production cost</span><span>{f2(c.cs)}</span></div>
            <div className="tot"><span>Gross profit</span><span>{f2(c.gp)}</span></div></div>
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
  const { S, dispatch } = useApp(), [z, setZ] = useState({ n: '', c: 'adult', h: '' })
  const R = (k, label) => <Num key={k} label={label} value={S.R[k]} onSave={(v) => v !== S.R[k] && dispatch({ type: 'rate', k, v })} />
  const T = (c, j, label) => <Num key={c + j} label={label} value={S.T[c][j]} onSave={(v) => v !== S.T[c][j] && dispatch({ type: 'tier', c, j, v })} />
  const G = (k, label) => <Num key={k} label={label} value={S[k]} onSave={(v) => v !== S[k] && dispatch({ type: 'setting', k, v })} />
  return (
    <>
      <Head title="Costing and prices" sub="Changes recalculate every cost and margin. Orders keep the prices and costs saved when they were registered." />
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
              <td className="r"><input type="number" defaultValue={x.h} key={x.h} aria-label={'Height of ' + x.n} style={{ width: 110, margin: '0 0 0 auto' }}
                onBlur={(e) => { const v = parseFloat(e.target.value); if (v > 0 && v !== x.h) dispatch({ type: 'height', i, v }) }} /></td>
              <td className="r">{(x.h / 1000).toFixed(3)}</td><td className="r">{f2(cost(S, x))}</td></tr>))}
        </Table>
        <h2 style={{ marginTop: 18 }}>Add a size</h2>
        <div className="fm">
          <label>Name<input value={z.n} onChange={(e) => setZ({ ...z, n: e.target.value })} /></label>
          <label>Category<select value={z.c} onChange={(e) => setZ({ ...z, c: e.target.value })}><option>adult</option><option>kids</option></select></label>
          <label>Pattern height, mm<input type="number" value={z.h} onChange={(e) => setZ({ ...z, h: e.target.value })} /></label>
          <button className="btn" onClick={() => { if (z.n.trim() && +z.h > 0) { dispatch({ type: 'addSize', size: { n: z.n.trim(), c: z.c, h: +z.h } }); setZ({ n: '', c: 'adult', h: '' }) } }}>Add size</button>
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
