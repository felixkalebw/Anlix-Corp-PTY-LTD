'use client'
// Customers, WhatsApp, payment reminders, stock, tailor and supplier payments, quality checks and reports.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useApp } from './Store'
import { useAuth } from './AuthProvider'
import { TODAY, f2, f0, pc, fd, sum, qty, calc, phase, phaseTag, QC_POINTS, qcState, lowStock, stockNeeds, payoutsOf, costParts } from '@/lib/model'
import { waLink, waText, customers, reminders, payeeStats, knownPayees, reportMonths, monthPL, customerProfit, sizeProfit } from '@/lib/features'

const RED = '#C62828'
const Head = ({ title, sub }) => {
  const { S, cloud } = useApp()
  return (
    <div className="top">
      <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      {cloud && <label>Signed in as <b>{S.user}</b></label>}
    </div>
  )
}
const Table = ({ head, right = 99, children }) => (
  <div className="tw"><table>
    <thead><tr>{head.map((h, i) => <th key={h + i} className={i >= right ? 'r' : ''}>{h}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table></div>
)
const Denied = ({ what }) => <div className="card"><p>You do not have permission to {what}. Ask the super admin to turn it on for your role.</p></div>
const m2 = (v) => (+v || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ---------- WhatsApp buttons for one job card ----------
export function WhatsAppRow({ o }) {
  const { S } = useApp()
  const ph = phase(S, o), q = qcState(S, o.jc)
  const ask = (e) => {
    const why = []
    if (ph !== 'Ready for collection') why.push(`the job is "${ph}", not ready for collection`)
    if (q.status !== 'Passed') why.push(`the quality check is "${q.status.toLowerCase()}"`)
    if (why.length && !window.confirm(`Careful: ${why.join(' and ')}. Send the "ready for collection" message anyway?`)) e.preventDefault()
  }
  const A = ({ kind, children, onClick }) => <a className="btn o" href={waLink(o.phone, waText(S, o, kind))} target="_blank" rel="noopener noreferrer" onClick={onClick}>{children}</a>
  return (
    <div className="card"><h2>Message the customer on WhatsApp</h2>
      <div className="chips"><A kind="quotation">Send quotation</A><A kind="invoice">Send invoice</A><A kind="ready" onClick={ask}>Ready for collection</A><A kind="reminder">Payment reminder</A></div>
      <p className="sub">{o.phone ? `Opens WhatsApp to ${o.phone} with the message filled in. You check it and press send.` : 'No phone number saved on this order, so WhatsApp will let you choose the contact.'}</p></div>
  )
}

// ---------- Payment reminders (dashboard) ----------
export function Reminders() {
  const { S } = useApp(), list = useMemo(() => reminders(S), [S])
  if (!list.length) return null
  const owed = sum(list, (x) => x.bal)
  return (
    <div className="card" style={{ marginTop: 16 }}><h2>Payment reminders</h2>
      <p className="sub">{list.length} order{list.length === 1 ? '' : 's'} past the due date or ready for collection with money owed: {f2(owed)} in total.</p>
      <Table head={['Job card', 'Customer', 'Due', 'Status', 'Balance', '']} right={4}>
        {list.map(({ o, bal, late, days, ready }) => (
          <tr key={o.jc}><td><Link href={`/orders/${o.jc}`}>{o.jc}</Link></td><td>{o.ent}{o.phone ? '' : ' (no phone)'}</td><td>{o.dueDate ? fd(o.dueDate) : '–'}</td>
            <td>{late ? <span className="tag a">{days} day{days === 1 ? '' : 's'} overdue</span> : null}{ready ? <span className="tag g">Ready for collection</span> : null}</td>
            <td className="r">{f2(bal)}</td>
            <td className="r"><a className="btn o" href={waLink(o.phone, waText(S, o, ready ? 'ready' : 'reminder'))} target="_blank" rel="noopener noreferrer">WhatsApp</a></td></tr>))}
      </Table></div>
  )
}

// ---------- Job card pieces ----------
export function QcPanel({ o }) {
  const { S, dispatch } = useApp(), { can } = useAuth(), q = qcState(S, o.jc)
  const blank = () => Object.fromEntries(QC_POINTS.map((p) => [p, { result: '', qty: String(qty(o)), defect: '', action: '' }]))
  const [r, setR] = useState(blank), [err, setErr] = useState('')
  const set = (p, k, v) => setR({ ...r, [p]: { ...r[p], [k]: v } })
  const hist = (S.qc || []).filter((x) => x.jc === o.jc).slice().reverse()
  const save = () => {
    const rows = QC_POINTS.filter((p) => r[p].result).map((p) => ({ point: p, ...r[p] }))
    if (!rows.length) return setErr('Choose Pass or Fail for at least one check.')
    const bad = rows.find((x) => x.result === 'Fail' && !x.defect.trim())
    if (bad) return setErr(`Describe the defect for "${bad.point}".`)
    setErr(''); dispatch({ type: 'qcAdd', jc: o.jc, rows }); setR(blank())
  }
  const tag = q.status === 'Passed' ? 'g' : q.status === 'Failed' ? 'a' : 'b'
  return (
    <div className="card"><h2>Quality check <span className={'tag ' + tag} style={{ marginLeft: 8 }}>{q.status}</span></h2>
      <p className="sub">Check the finished job before the customer collects it. The latest result for each point counts. A failed check needs the defect written down; use the Quality inspection stage above to raise the rework.</p>
      <Table head={['Check', 'Result', 'Qty checked', 'Defect found', 'Action taken']} right={99}>
        {QC_POINTS.map((p) => (
          <tr key={p}><td>{p}{q.last.get(p) ? <div className="sub">Last: {q.last.get(p).result} on {fd(q.last.get(p).date)}</div> : null}</td>
            <td><select value={r[p].result} onChange={(e) => set(p, 'result', e.target.value)} disabled={!can('qc.edit')}><option value="">Not checked now</option><option>Pass</option><option>Fail</option></select></td>
            <td><input type="number" min="0" style={{ width: 80 }} value={r[p].qty} onChange={(e) => set(p, 'qty', e.target.value)} disabled={!can('qc.edit')} /></td>
            <td><input value={r[p].defect} placeholder={r[p].result === 'Fail' ? 'Required' : ''} onChange={(e) => set(p, 'defect', e.target.value)} disabled={!can('qc.edit')} /></td>
            <td><input value={r[p].action} onChange={(e) => set(p, 'action', e.target.value)} disabled={!can('qc.edit')} /></td></tr>))}
      </Table>
      {err && <div className="note w">{err}</div>}
      <p><button className="btn" disabled={!can('qc.edit')} onClick={save}>Record quality check</button>{!can('qc.edit') && <span className="sub"> You need the Record QC inspections permission.</span>}</p>
      {hist.length > 0 && <div className="log">{hist.slice(0, 12).map((x) => <div key={x.id}>{x.point}: <b style={{ color: x.result === 'Fail' ? RED : 'inherit' }}>{x.result}</b>{x.defect ? ' · ' + x.defect : ''}{x.action ? ' · ' + x.action : ''}<span>{fd(x.date)} · {x.by}</span></div>)}</div>}
    </div>
  )
}

export function JobPayouts({ o }) {
  const { S } = useApp(), list = payoutsOf(S, o.jc), cp = costParts(S, [o]).comp
  const t = sum(list.filter((x) => x.category === 'Tailor payment'), (x) => x.amount), s = sum(list.filter((x) => x.category === 'Supplier payment'), (x) => x.amount)
  return (
    <div className="card"><h2>Paid to tailors and suppliers</h2>
      {list.length ? (
        <>
          <Table head={['Date', 'Paid to', 'Type', 'Amount']} right={3}>{list.map((x) => <tr key={x.id}><td>{fd(x.date)}</td><td>{x.desc}</td><td>{x.category.replace(' payment', '')}</td><td className="r">{f2(x.amount)}</td></tr>)}</Table>
          <div className="tot"><span>Tailors: paid / estimated sewing in the costing</span><span>{f2(t)} / {f2(cp[3])}</span></div>
          <div className="tot"><span>Suppliers: paid / estimated fabric in the costing</span><span>{f2(s)} / {f2(cp[0])}</span></div>
        </>) : <p className="sub">No tailor or supplier payments recorded for this job yet.</p>}
      <p><Link className="btn o" href={`/suppliers?jc=${o.jc}`}>Record a payment for this job</Link></p></div>
  )
}

export function StockNote({ o }) {
  const { S } = useApp(), inv = S.inventory || []
  if (o.stockUsed && o.stockUsed.length) return (
    <div className="card"><h2>Fabric taken from stock</h2>
      {o.stockUsed.map((u, i) => <div className="tot" key={i}><span>{u.name}</span><span>{m2(u.m)} m</span></div>)}</div>)
  if (o.prod || o.closed || !inv.some((i) => i.kind === 'fabric')) return null
  const n = stockNeeds(S, o)
  return (
    <div className="card"><h2>Fabric stock for this job</h2>
      {n.use.map((u, i) => { const it = inv.find((x) => x.id === u.id), short = (+it.qty || 0) < u.m; return <div className="tot" key={i}><span>{u.name}: needs {m2(u.m)} m, {m2(it.qty)} {it.unit} in stock</span><span style={{ color: short ? RED : 'inherit' }}>{short ? 'Short by ' + m2(u.m - it.qty) + ' m' : 'Enough'}</span></div> })}
      {n.missing.length > 0 && <div className="note w">No fabric stock item has the colour {n.missing.join(', ')}. Add one on the Inventory page, or nothing will be taken from stock for it.</div>}
      <p className="sub">The metres come out of stock when you press Move to production.</p></div>
  )
}

// ---------- Customers ----------
export function Customers() {
  const { S } = useApp(), [q, setQ] = useState(''), [open, setOpen] = useState(null)
  const all = useMemo(() => customers(S), [S])
  const list = all.filter((c) => !q.trim() || (c.name + ' ' + c.contacts.join(' ') + ' ' + c.phone).toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <Head title="Customers" sub="Built from your orders, grouped by phone number or company name. Nothing to retype." />
      <div className="card">
        <label>Search<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company, person or phone" /></label>
        <p className="sub">{list.length} customer{list.length === 1 ? '' : 's'} · {f2(sum(list, (c) => c.billed))} billed · {f2(sum(list, (c) => c.bal))} still owed</p>
        <Table head={['Customer', 'Contact', 'Phone', 'Orders', 'Shirts', 'Billed', 'Owes', 'Last order', '']} right={3}>
          {list.map((c) => (
            [<tr key={c.key}><td><b>{c.name}</b></td><td>{c.contacts.join(', ') || '–'}</td><td>{c.phone || '–'}</td><td className="r">{c.orders.length}</td><td className="r">{c.shirts}</td><td className="r">{f2(c.billed)}</td>
              <td className="r" style={{ color: c.bal > 0.005 ? RED : 'inherit' }}>{f2(Math.max(0, c.bal))}</td><td className="r">{fd(c.last)}</td>
              <td className="r"><button className="btn o" onClick={() => setOpen(open === c.key ? null : c.key)}>{open === c.key ? 'Hide' : 'History'}</button>{' '}
                <a className="btn o" href={waLink(c.phone, '')} target="_blank" rel="noopener noreferrer">WhatsApp</a></td></tr>,
            open === c.key && <tr key={c.key + 'h'}><td colSpan={9}>
              <Table head={['Job card', 'Date', 'Placed by', 'Shirts', 'Net total', 'Balance', 'Status']} right={3}>
                {c.orders.map((o) => { const x = calc(S, o), p = phase(S, o); return <tr key={o.jc}><td><Link href={`/orders/${o.jc}`}>{o.jc}</Link></td><td>{fd(o.date)}</td><td>{o.placed}</td><td className="r">{x.q}</td><td className="r">{f2(x.net)}</td><td className="r">{f2(Math.max(0, x.bal))}</td><td><span className={'tag ' + phaseTag(p)}>{p}</span></td></tr> })}
              </Table></td></tr>]))}
        </Table>
        {!list.length && <p className="sub">No customers match.</p>}</div>
    </>
  )
}

// ---------- Inventory ----------
function ItemRow({ i, edit }) {
  const { dispatch } = useApp(), [mode, setMode] = useState(null), [v, setV] = useState({ qty: '', cost: '', note: '', min: String(i.min), colour: i.colour || '', fabric: i.fabric || '', name: i.name })
  const low = (+i.min || 0) > 0 && (+i.qty || 0) <= +i.min, neg = (+i.qty || 0) < 0
  const done = () => { setMode(null); setV({ ...v, qty: '', note: '' }) }
  return [
    <tr key={i.id}><td>{i.name}{i.kind === 'fabric' ? <div className="sub">Fabric · {i.colour || 'no colour'}{i.fabric ? ' · ' + i.fabric : ''}</div> : null}</td><td>{i.sku || '–'}</td>
      <td className="r" style={{ color: neg || low ? RED : 'inherit', fontWeight: low ? 700 : 400 }}>{m2(i.qty)} {i.unit}{neg ? ' (short)' : low ? ' (low)' : ''}</td><td className="r">{m2(i.min)}</td><td className="r">{i.cost ? f2(i.cost) : '–'}</td><td className="r">{i.cost ? f2((+i.qty || 0) * i.cost) : '–'}</td>
      <td className="r">{edit && <><button className="btn o" onClick={() => setMode(mode === 'in' ? null : 'in')}>Stock in</button>{' '}<button className="btn o" onClick={() => setMode(mode === 'set' ? null : 'set')}>Count</button>{' '}<button className="btn o" onClick={() => setMode(mode === 'edit' ? null : 'edit')}>Edit</button></>}</td></tr>,
    mode && <tr key={i.id + 'm'}><td colSpan={7}><div className="fm">
      {mode === 'in' && <><label>Quantity received ({i.unit})<input type="number" min="0" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} /></label><label>New cost per {i.unit} (optional)<input type="number" min="0" value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value })} /></label><label>Supplier or note<input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
        <button className="btn" onClick={() => { if (+v.qty > 0) { dispatch({ type: 'stockIn', id: i.id, qty: +v.qty, cost: v.cost, note: v.note }); done() } }}>Add to stock</button></>}
      {mode === 'set' && <><label>Counted quantity ({i.unit})<input type="number" min="0" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} /></label><label>Reason (required)<input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="e.g. Stock take, damaged roll" /></label>
        <button className="btn" onClick={() => { if (v.qty !== '' && v.note.trim()) { dispatch({ type: 'stockSet', id: i.id, qty: +v.qty, note: v.note }); done() } }}>Correct the count</button></>}
      {mode === 'edit' && <><label>Name<input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label><label>Minimum before low-stock warning<input type="number" min="0" value={v.min} onChange={(e) => setV({ ...v, min: e.target.value })} /></label><label>Cost per {i.unit}<input type="number" min="0" value={v.cost || String(i.cost || '')} onChange={(e) => setV({ ...v, cost: e.target.value })} /></label>
        {i.kind === 'fabric' && <><label>Colour<input value={v.colour} onChange={(e) => setV({ ...v, colour: e.target.value })} /></label><label>Fabric type (optional)<input value={v.fabric} onChange={(e) => setV({ ...v, fabric: e.target.value })} /></label></>}
        <button className="btn" onClick={() => { dispatch({ type: 'itemEdit', id: i.id, patch: { name: v.name, min: v.min, cost: v.cost === '' ? i.cost : v.cost, colour: v.colour, fabric: v.fabric } }); done() }}>Save changes</button>
        <button className="btn o" onClick={() => { if (window.confirm(`Remove ${i.name} from the stock list?`)) { dispatch({ type: 'itemDel', id: i.id }); done() } }}>Remove item</button></>}
    </div></td></tr>,
  ]
}
export function Inventory() {
  const { S, dispatch } = useApp(), { can } = useAuth(), inv = S.inventory || []
  const [x, setX] = useState({ name: '', kind: 'fabric', colour: '', fabric: '', unit: 'm', qty: '', min: '', cost: '', sku: '' }), [err, setErr] = useState('')
  if (!can('inventory.view')) return (<><Head title="Inventory" /><Denied what="view inventory" /></>)
  const low = lowStock(S), edit = can('inventory.edit')
  const add = () => {
    if (!x.name.trim()) return setErr('Enter a name.')
    if (x.kind === 'fabric' && !x.colour.trim()) return setErr('Enter the colour, so jobs of that colour can take fabric from this item.')
    if (!(+x.qty >= 0) || x.qty === '') return setErr('Enter the quantity in stock now (0 is allowed).')
    if (inv.some((i) => i.name.toLowerCase() === x.name.trim().toLowerCase())) return setErr('An item with that name already exists.')
    setErr(''); dispatch({ type: 'itemAdd', ...x }); setX({ ...x, name: '', colour: '', fabric: '', qty: '', min: '', cost: '', sku: '' })
  }
  return (
    <>
      <Head title="Inventory" sub="Fabric and materials. Fabric metres come out of stock when a job card moves to production." />
      {low.length > 0 && <div className="note w"><b>Low stock:</b> {low.map((i) => `${i.name} (${m2(i.qty)} ${i.unit} left, minimum ${m2(i.min)})`).join(' · ')}</div>}
      {edit && <div className="card"><h2>Add a stock item</h2>
        <div className="fm">
          <label>Name<input value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} placeholder="e.g. Black cotton 180gsm" /></label>
          <label>Type<select value={x.kind} onChange={(e) => setX({ ...x, kind: e.target.value, unit: e.target.value === 'fabric' ? 'm' : x.unit })}><option value="fabric">Fabric (used by job cards)</option><option value="other">Other material</option></select></label>
          {x.kind === 'fabric' && <label>Colour (must match the job card colour)<input value={x.colour} onChange={(e) => setX({ ...x, colour: e.target.value })} placeholder="e.g. Black" /></label>}
          {x.kind === 'fabric' && <label>Fabric type (optional)<input value={x.fabric} onChange={(e) => setX({ ...x, fabric: e.target.value })} /></label>}
          <label>Unit<input value={x.unit} onChange={(e) => setX({ ...x, unit: e.target.value })} /></label>
          <label>In stock now<input type="number" min="0" value={x.qty} onChange={(e) => setX({ ...x, qty: e.target.value })} /></label>
          <label>Warn me at or below<input type="number" min="0" value={x.min} onChange={(e) => setX({ ...x, min: e.target.value })} /></label>
          <label>Cost per unit (optional)<input type="number" min="0" value={x.cost} onChange={(e) => setX({ ...x, cost: e.target.value })} /></label>
          <label>Code (optional)<input value={x.sku} onChange={(e) => setX({ ...x, sku: e.target.value })} /></label>
        </div>
        {err && <div className="note w">{err}</div>}
        <p><button className="btn" onClick={add}>Add item</button></p></div>}
      <div className="card">
        {inv.length ? <Table head={['Item', 'Code', 'In stock', 'Minimum', 'Cost per unit', 'Stock value', '']} right={2}>{inv.map((i) => <ItemRow key={i.id} i={i} edit={edit} />)}</Table> : <p className="sub">No stock items yet.</p>}
        {inv.length > 0 && <div className="tot big"><span>Total stock value</span><span>{f2(sum(inv, (i) => (+i.qty || 0) * (+i.cost || 0)))}</span></div>}</div>
    </>
  )
}

// ---------- Tailor and supplier payments ----------
export function Suppliers() {
  const { S, dispatch } = useApp(), { can } = useAuth(), known = useMemo(() => knownPayees(S), [S]), stats = useMemo(() => payeeStats(S), [S])
  const [x, setX] = useState({ kind: 'Tailor', who: '', jc: '', amount: '', d: TODAY, note: '' }), [err, setErr] = useState('')
  useEffect(() => { const j = new URLSearchParams(window.location.search).get('jc'); if (j) setX((p) => ({ ...p, jc: j })) }, [])
  if (!can('finance.view')) return (<><Head title="Tailors and suppliers" /><Denied what="view payments to tailors and suppliers" /></>)
  const edit = can('finance.edit'), names = x.kind === 'Tailor' ? known.tailors : known.shops
  const pays = (S.finance || []).filter((p) => p.category === 'Tailor payment' || p.category === 'Supplier payment').slice().reverse()
  const add = () => {
    if (!x.who.trim()) return setErr('Enter who was paid.')
    if (!(+x.amount > 0)) return setErr('Enter the amount paid.')
    setErr(''); dispatch({ type: 'spayAdd', ...x, amount: +x.amount }); setX({ ...x, amount: '', note: '' })
  }
  return (
    <>
      <Head title="Tailors and suppliers" sub="What you actually paid, linked to job cards. It is shown next to the estimate in your costing and is not added to the production cost a second time." />
      {edit && <div className="card"><h2>Record a payment</h2>
        <div className="fm">
          <label>Paid to<select value={x.kind} onChange={(e) => setX({ ...x, kind: e.target.value })}><option value="Tailor">Tailor (sewing)</option><option value="Supplier">Supplier (fabric or materials)</option></select></label>
          <label>Name<input list="payees" value={x.who} onChange={(e) => setX({ ...x, who: e.target.value })} autoComplete="off" /><datalist id="payees">{names.map((n) => <option key={n} value={n} />)}</datalist></label>
          <label>Job card<select value={x.jc} onChange={(e) => setX({ ...x, jc: e.target.value })}><option value="">Not linked to a job card</option>{[...S.orders].reverse().map((o) => <option key={o.jc} value={o.jc}>{o.jc} · {o.ent}</option>)}</select></label>
          <label>Amount (P)<input type="number" min="0" value={x.amount} onChange={(e) => setX({ ...x, amount: e.target.value })} /></label>
          <label>Date<input type="date" value={x.d} onChange={(e) => setX({ ...x, d: e.target.value })} /></label>
          <label>Note (optional)<input value={x.note} onChange={(e) => setX({ ...x, note: e.target.value })} placeholder="e.g. 20 shirts sewn" /></label>
        </div>
        {err && <div className="note w">{err}</div>}
        <p><button className="btn" onClick={add}>Record payment</button></p></div>}
      <div className="card"><h2>Cost per tailor and supplier</h2>
        {stats.length ? (
          <Table head={['Paid to', 'Type', 'Job cards', 'Total paid', 'Shirts or metres', 'Paid per unit', 'Estimate per unit']} right={2}>
            {stats.map((g) => <tr key={g.kind + g.who}><td><b>{g.who}</b></td><td>{g.kind}</td><td className="r">{g.jobs.length}</td><td className="r">{f2(g.paid)}</td><td className="r">{g.units ? m2(g.units) + (g.kind === 'Tailor' ? ' shirts' : ' m') : '–'}</td>
              <td className="r" style={{ color: g.units && g.per > g.estPer + 0.005 ? RED : 'inherit' }}>{g.units ? f2(g.per) : '–'}</td><td className="r">{g.units ? f2(g.estPer) : '–'}</td></tr>)}
          </Table>) : <p className="sub">No payments recorded yet.</p>}
        <p className="sub">Per unit = total paid divided by the shirts (tailors) or metres (suppliers) on the job cards the payments are linked to. Red means you paid more than the costing estimate. Payments that are not linked to a job card are not counted in the per unit figures.</p></div>
      <div className="card"><h2>Payments</h2>
        {pays.length ? (
          <Table head={['Date', 'Type', 'Paid to', 'Job card', 'Recorded by', 'Amount', '']} right={5}>
            {pays.map((p) => <tr key={p.id}><td>{fd(p.date)}</td><td>{p.category.replace(' payment', '')}</td><td>{p.desc}</td><td>{p.ref ? <Link href={`/orders/${p.ref}`}>{p.ref}</Link> : '–'}</td><td>{p.by}</td><td className="r">{f2(p.amount)}</td>
              <td className="r">{edit && <button className="btn o" onClick={() => { if (window.confirm('Remove this payment? The removal is written to the audit log.')) dispatch({ type: 'spayDel', id: p.id }) }}>Remove</button>}</td></tr>)}
          </Table>) : <p className="sub">Nothing recorded.</p>}</div>
    </>
  )
}

// ---------- Quality checks ----------
export function Quality() {
  const { S } = useApp(), { can } = useAuth(), qc = S.qc || []
  if (!can('qc.view')) return (<><Head title="Quality checks" /><Denied what="view quality checks" /></>)
  const jobs = S.orders.filter((o) => o.prod || (S.qc || []).some((x) => x.jc === o.jc)).slice().reverse()
  const fails = qc.filter((x) => x.result === 'Fail'), rate = qc.length ? 1 - fails.length / qc.length : null
  const by = QC_POINTS.map((p) => { const a = qc.filter((x) => x.point === p), f = a.filter((x) => x.result === 'Fail').length; return { p, n: a.length, f } })
  return (
    <>
      <Head title="Quality checks" sub="Open a job card to record a check. Here is everything recorded, and where the problems are." />
      <div className="kp">{[['Checks recorded', qc.length], ['Pass rate', rate === null ? '–' : pc(rate)], ['Failed checks', fails.length]].map(([l, v]) => <div className="card" key={l}><div className="sub">{l}</div><h2>{v}</h2></div>)}</div>
      <div className="card"><h2>Job cards</h2>
        <Table head={['Job card', 'Customer', 'Status', 'Quality check', 'Failed on']} right={99}>
          {jobs.map((o) => { const q = qcState(S, o.jc), p = phase(S, o); return <tr key={o.jc}><td><Link href={`/orders/${o.jc}`}>{o.jc}</Link></td><td>{o.ent}</td><td><span className={'tag ' + phaseTag(p)}>{p}</span></td><td><span className={'tag ' + (q.status === 'Passed' ? 'g' : q.status === 'Failed' ? 'a' : 'b')}>{q.status}</span></td><td>{q.failed.join(', ') || '–'}</td></tr> })}
        </Table>{!jobs.length && <p className="sub">No job cards in production yet.</p>}</div>
      <div className="card"><h2>Where defects happen</h2>
        <Table head={['Check', 'Times checked', 'Failed', 'Fail rate']} right={1}>{by.map((b) => <tr key={b.p}><td>{b.p}</td><td className="r">{b.n}</td><td className="r">{b.f}</td><td className="r">{b.n ? pc(b.f / b.n) : '–'}</td></tr>)}</Table></div>
      <div className="card"><h2>Failed checks</h2>
        {fails.length ? <Table head={['Date', 'Job card', 'Check', 'Defect', 'Action taken', 'By']}>{fails.slice().reverse().map((x) => <tr key={x.id}><td>{fd(x.date)}</td><td><Link href={`/orders/${x.jc}`}>{x.jc}</Link></td><td>{x.point}</td><td>{x.defect}</td><td>{x.action || '–'}</td><td>{x.by}</td></tr>)}</Table> : <p className="sub">No failed checks.</p>}</div>
    </>
  )
}

// ---------- Reports ----------
export function Reports() {
  const { S } = useApp(), { can } = useAuth(), months = useMemo(() => reportMonths(S), [S])
  const [m, setM] = useState(TODAY.slice(0, 7)), [all, setAll] = useState(false)
  const pl = useMemo(() => monthPL(S, m), [S, m]), hist = useMemo(() => months.map((k) => monthPL(S, k)), [S, months])
  const cust = useMemo(() => customerProfit(S, all ? null : m), [S, m, all]), sizes = useMemo(() => sizeProfit(S, all ? null : m), [S, m, all])
  if (!can('reports.view')) return (<><Head title="Reports" /><Denied what="view reports" /></>)
  const scope = all ? 'all time' : m, bar = (v, max) => <div style={{ background: 'var(--line)', borderRadius: 4, height: 8, minWidth: 80 }}><div style={{ width: Math.max(0, Math.min(100, (v / (max || 1)) * 100)) + '%', background: v < 0 ? RED : '#7657F6', height: 8, borderRadius: 4 }} /></div>
  const maxC = Math.max(1, ...cust.map((x) => Math.abs(x.profit))), maxS = Math.max(1, ...sizes.map((x) => Math.abs(x.profit)))
  const row = (l, v, b) => <div className={'tot' + (b ? ' big' : '')}><span>{l}</span><span style={{ color: v < 0 ? RED : 'inherit' }}>{f2(v)}</span></div>
  return (
    <>
      <Head title="Reports" sub="Monthly profit and loss, your most profitable customers and sizes, and the shirts you need to sell to cover your overheads." />
      <div className="card"><div className="fm">
        <label>Month<select value={m} onChange={(e) => setM(e.target.value)}>{months.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label>Customer and size tables cover<select value={all ? 'all' : 'm'} onChange={(e) => setAll(e.target.value === 'all')}><option value="m">The month selected</option><option value="all">All time</option></select></label>
      </div></div>
      <div className="grid">
        <div className="card"><h2>Profit and loss, {m}</h2>
          <p className="sub">{pl.orders} order{pl.orders === 1 ? '' : 's'} placed this month, {pl.shirts} shirts.</p>
          {row('Sales (after discounts)', pl.sales, true)}
          {['Fabric', 'Printing', 'Pressing', 'Sewing'].map((n, i) => row('Less ' + n.toLowerCase(), -pl.comp[i]))}
          {row('Gross profit', pl.gp, true)}
          {row('Less wastage and rework', -pl.wastage)}{row('Less other direct costs', -pl.other)}{row('Less overheads', -pl.oh)}
          {row('Net profit', pl.net, true)}
          <p className="sub">Production cost uses your costing rates and actual printed metres where you recorded them. Overheads are those dated in {m}.</p></div>
        <div className="card"><h2>Break-even, {m}</h2>
          {pl.breakEven === null ? <p className="sub">Needs at least one order with a profit, and overheads recorded for the month.</p> : (
            <>
              <div className="tot"><span>Overheads to cover</span><span>{f2(pl.oh)}</span></div>
              <div className="tot"><span>Average gross profit per shirt</span><span>{f2(pl.gpShirt)}</span></div>
              <div className="tot big"><span>Break-even shirts</span><span>{pl.breakEven}</span></div>
              <div className="tot"><span>Shirts sold so far</span><span>{pl.shirts}</span></div>
              <div className={'note' + (pl.shirts >= pl.breakEven ? '' : ' w')}>{pl.shirts >= pl.breakEven ? `Overheads covered. ${pl.shirts - pl.breakEven} shirts of profit beyond break-even.` : `${pl.breakEven - pl.shirts} more shirts needed to cover this month's overheads.`}</div>
            </>)}
          <div className="tot"><span>Cash received in {m}</span><span>{f2(pl.received)}</span></div>
          <div className="tot"><span>Billed this month, not yet paid</span><span>{f2(pl.billedUnpaid)}</span></div>
          <div className="tot"><span>Paid to tailors and suppliers in {m}</span><span>{f2(pl.payouts)}</span></div></div>
      </div>
      <div className="card"><h2>Month by month</h2>
        <Table head={['Month', 'Shirts', 'Sales', 'Gross profit', 'Overheads', 'Net profit', 'Break-even shirts']} right={1}>
          {hist.map((h) => <tr key={h.m}><td>{h.m}</td><td className="r">{h.shirts}</td><td className="r">{f2(h.sales)}</td><td className="r">{f2(h.gp)}</td><td className="r">{f2(h.oh)}</td><td className="r" style={{ color: h.net < 0 ? RED : 'inherit' }}>{f2(h.net)}</td><td className="r">{h.breakEven === null ? '–' : h.breakEven}</td></tr>)}
        </Table></div>
      <div className="card"><h2>Most profitable customers, {scope}</h2>
        {cust.length ? <Table head={['Customer', 'Orders', 'Shirts', 'Sales', 'Gross profit', 'Overhead share', 'Profit after overhead', 'Margin', '']} right={1}>
          {cust.map((x, i) => <tr key={x.name + i}><td>{i === 0 ? '★ ' : ''}<b>{x.name}</b></td><td className="r">{x.orders}</td><td className="r">{x.shirts}</td><td className="r">{f2(x.sales)}</td><td className="r">{f2(x.gp)}</td><td className="r">{f2(x.oh)}</td><td className="r" style={{ color: x.profit < 0 ? RED : 'inherit' }}>{f2(x.profit)}</td><td className="r">{pc(x.margin)}</td><td>{bar(x.profit, maxC)}</td></tr>)}
        </Table> : <p className="sub">No orders in this period.</p>}</div>
      <div className="card"><h2>Most profitable sizes, {scope}</h2>
        {sizes.length ? <Table head={['Size or product', 'Shirts', 'Sales', 'Production cost', 'Profit', 'Margin', 'Profit per shirt', '']} right={1}>
          {sizes.map((x, i) => <tr key={x.name}><td>{i === 0 ? '★ ' : ''}<b>{x.name}</b></td><td className="r">{x.shirts}</td><td className="r">{f2(x.sales)}</td><td className="r">{f2(x.cost)}</td><td className="r" style={{ color: x.profit < 0 ? RED : 'inherit' }}>{f2(x.profit)}</td><td className="r">{pc(x.margin)}</td><td className="r">{x.shirts ? f2(x.profit / x.shirts) : '–'}</td><td>{bar(x.profit, maxS)}</td></tr>)}
        </Table> : <p className="sub">No orders in this period.</p>}
        <p className="sub">Size profit is before overheads, because overheads belong to the whole order, not to a size.</p></div>
    </>
  )
}
