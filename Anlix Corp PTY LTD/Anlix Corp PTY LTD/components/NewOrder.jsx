'use client'
// components/NewOrder.jsx
// The New order screen: order details, items (added by hand or read from a pasted list by the AI),
// prices by size (unit price and sewing price), and the pricing and payment summary.
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApp } from './Store'
import { supabase } from '@/lib/supabase'
import { customers } from '@/lib/features'
import { ONE, f2, pc, sum, sz, price, calc, unit, jobNo, materialPlan, tolPct, mkLine, lineH, lineLabel, prodOf, isFixed, typeGaps, baseRates } from '@/lib/model'
import './neworder.css'

const Head = ({ title, sub }) => {
  const { S, dispatch, cloud } = useApp()
  return (
    <div className="top">
      <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      {cloud
        ? <label>Signed in as <b>{S.user}</b></label>
        : <label>Signed in as
            <select value={S.user} onChange={(e) => dispatch({ type: 'user', user: e.target.value })}><option>Staff 1</option><option>Staff 2</option></select>
          </label>}
    </div>
  )
}
const Table = ({ head, right = 99, children }) => (
  <div className="tw"><table>
    <thead><tr>{head.map((h, i) => <th key={h + i} className={i >= right ? 'r' : ''}>{h}</th>)}</tr></thead>
    <tbody>{children}</tbody>
  </table></div>
)
const t3 = (n) => String(+(+n).toFixed(3))
const blank = (v) => v === '' || v == null
// Metres typed per piece are entered in metres; the model keeps them in mm.
const norm = (l) => ({ ...l, h: parseFloat(l.m) > 0 ? parseFloat(l.m) * 1000 : '' })
// A price typed on a line wins. Otherwise the price set for its size is used. Otherwise the default (the box stays blank).
const withSize = (l, sp) => { const p = sp[l.s] || {}; return { ...l, unitPrice: blank(l.unitPrice) ? (p.unit ?? '') : l.unitPrice, sewRate: blank(l.sewRate) ? (p.sew ?? '') : l.sewRate } }

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

const LIST_HINT = 'Paste any list. For example:\n91 Green  MMA CLUTCH 84  M  Birds Eye 195 GSM\n92 Green  RATO 20  M  Birds Eye 195 GSM\nBlack T-shirts: 5 x M, 10 x L, 2 x XL\nKids 7-8 white x 6\n13 -14 YEARS'

const Money = ({ children }) => <div className="no-money"><span>P</span>{children}</div>

export function NewOrder() {
  const { S, dispatch } = useApp(), router = useRouter(), nid = useRef(0)
  const mk = (o) => ({ id: ++nid.current, s: '', q: 1, type: '', colour: '', fabric: '', desc: '', m: '', fabricRate: '', sewRate: '', unitPrice: '', ...o })
  const [d, setD] = useState({ by: '', placed: '', ent: '', phone: '', dueDate: '', dt: '%', dv: 0, dr: '' }), [lines, setLines] = useState([])
  const [tab, setTab] = useState('list'), [f, setF] = useState({ type: '', s: S.sizes[0].n, q: 1, colour: '', fabric: '', desc: '' })
  const [txt, setTxt] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [warns, setWarns] = useState([]), [perr, setPerr] = useState(''), [stats, setStats] = useState(null)
  const [err, setErr] = useState(''), [tried, setTried] = useState(false)
  const [sizeP, setSizeP] = useState({}), [all, setAll] = useState({ unit: '', sew: '' })
  const [open, setOpen] = useState({}), [find, setFind] = useState(''), [onlyBad, setOnlyBad] = useState(false), [showWarns, setShowWarns] = useState(false)

  const set = (k) => (e) => setD({ ...d, [k]: e.target.value })
  const setF1 = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const valid = (l) => !!sz(S, l.s) && l.q > 0
  const qn = sum(lines.filter(valid), (l) => l.q)

  // Cost and price every line the way it will be saved, so this page shows the same figures as the job card.
  const rows = useMemo(() => lines.map((l) => {
    const ok = valid(l), e = withSize(l, sizeP)
    return { l, ok, u: ok ? unit(S, mkLine(S, norm(e), qn), qn) : null }
  }), [lines, sizeP, S, qn])
  const good = useMemo(() => lines.filter(valid).map((l) => norm(withSize(l, sizeP))), [lines, sizeP, S])
  const built = useMemo(() => good.map((l) => mkLine(S, l, qn)), [good, S, qn])
  const bad = lines.length - good.length
  const c = calc(S, { lines: built, dt: d.dt, dv: d.dv, pays: [] }), q = c.q, mp = materialPlan(S, built)

  const pd = prodOf(S, f.type), gaps = pd ? typeGaps(S, pd) : []
  const staffOk = d.by.trim().length >= 2
  const known = [...new Set(S.orders.map((o) => o.by).filter(Boolean))]
  const colours = [...new Set(lines.map((l) => l.colour).filter(Boolean))]
  const ix = (n) => { const i = S.sizes.findIndex((z) => z.n === n); return i < 0 ? 999 : i }
  const sortLines = (a) => [...a].sort((x, y) => ix(x.s) - ix(y.s) || x.colour.localeCompare(y.colour) || x.desc.localeCompare(y.desc))

  // One row per size that appears in the order, for the unit price and sewing price boxes.
  const sizeRows = S.sizes.map((z) => {
    const rs = rows.filter((r) => r.l.s === z.n && r.ok)
    if (!rs.length) return null
    return { z, shirts: sum(rs, (r) => r.l.q), total: sum(rs, (r) => r.l.q * r.u.price), defUnit: price(S, z, qn, ''), defSew: baseRates(S, '').sew }
  }).filter(Boolean)
  const setSP = (size, k, v) => setSizeP((p) => ({ ...p, [size]: { ...p[size], [k]: v } }))
  const applyAll = () => setSizeP((p) => { const n = { ...p }; sizeRows.forEach(({ z }) => { n[z.n] = { ...n[z.n], ...(blank(all.unit) ? {} : { unit: all.unit }), ...(blank(all.sew) ? {} : { sew: all.sew }) } }); return n })

  // Items added by hand. Identical lines are added together.
  const add = () => {
    const n = Math.floor(+f.q)
    if (!(n > 0)) return setErr('Quantity must be at least 1.')
    const colour = f.colour.trim(), fabric = f.fabric.trim(), desc = f.desc.trim(), lc = (v) => (v || '').toLowerCase()
    const s = isFixed(prodOf(S, f.type)) ? ONE : f.s
    const same = (l) => l.type === f.type && l.s === s && lc(l.colour) === lc(colour) && lc(l.fabric) === lc(fabric) && lc(l.desc) === lc(desc) && blank(l.unitPrice) && !l.m && !l.fabricRate && blank(l.sewRate)
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
  const fixAll = (size) => { if (size) setLines((ls) => ls.map((l) => (valid(l) || l.q < 1 ? l : { ...l, s: size, src: undefined }))) }

  // Manual override: paste a list, the AI works out its pattern and reads sizes, colours, names and garments.
  const readList = async () => {
    if (!txt.trim()) return setPerr('Paste the order list first.')
    if (!supabase) return setPerr('Reading a list needs the cloud connection and sign-in. Add the items by hand in the Add items tab.')
    setBusy(true); setPerr(''); setMsg(''); setWarns([]); setStats(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Please sign in again.')
      const res = await fetch('/api/documents/parse-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ text: txt, sizes: S.sizes.map((z) => z.n), sizeInfo: S.sizes.map((z) => ({ n: z.n, c: z.c })) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not read the list.')
      const read = j.lines.map((l) => mk({ s: l.size, q: l.qty, colour: l.colour || '', fabric: l.fabric || '', desc: l.description || '', unitPrice: l.unit_price ?? '', src: 'list' }))
      setLines((ls) => { const m = [...ls.filter((l) => l.src !== 'list'), ...read]; return j.lines.some((l) => l.named) ? m : sortLines(m) })
      setWarns(j.warnings || []); setStats(j.stats || null)
      setMsg(`${read.length} line${read.length === 1 ? '' : 's'} read (${sum(read, (l) => l.q)} shirts). Check them below, set the prices by size, then register.`)
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

  const needle = find.trim().toLowerCase()
  const shown = rows.filter((r) => (!onlyBad || !r.ok) && (!needle || [r.l.desc, r.l.colour, r.l.s, r.l.fabric].join(' ').toLowerCase().includes(needle)))
  const shirts = sum(lines, (l) => l.q)

  return (
    <>
      <Head title="New order" sub="Register the order to get its job card, quotation and invoice numbers." />
      <div className="no-wrap">

        <section className="no-card">
          <div className="no-h"><span className="no-step">1</span><h2>Order details</h2></div>
          <div className="fm">
            <label>Job card number<input value={jobNo(S)} readOnly aria-readonly="true" /><span className="sub">Generated automatically. The quotation and invoice numbers follow it.</span></label>
            <label>Staff member taking the order (required)
              <input list="staff-names" value={d.by} onChange={set('by')} placeholder="Full name" required aria-required="true" aria-invalid={tried && !staffOk} autoComplete="off" />
              <datalist id="staff-names">{known.map((n) => <option key={n} value={n} />)}</datalist>
              {tried && !staffOk && <span className="note w" style={{ display: 'block', marginTop: 4 }}>Enter the name of the staff member taking this order.</span>}
            </label>
            <label>Placed by<input list="known-contacts" value={d.placed} onChange={set('placed')} placeholder="Person's name" autoComplete="off" />
              <datalist id="known-contacts">{[...new Set(customers(S).flatMap((x) => x.contacts))].map((n) => <option key={n} value={n} />)}</datalist></label>
            <label>Entity or company<input list="known-ents" value={d.ent} autoComplete="off" placeholder="Company name" onChange={(e) => {
              const v = e.target.value, hit = customers(S).find((x) => x.name.toLowerCase() === v.trim().toLowerCase())
              setD((p) => ({ ...p, ent: v, ...(hit && !p.phone ? { phone: hit.phone || '' } : {}), ...(hit && !p.placed && hit.contacts[0] ? { placed: hit.contacts[0] } : {}) }))
            }} />
              <datalist id="known-ents">{customers(S).map((x) => <option key={x.key} value={x.name} />)}</datalist>
              <span className="sub">Pick an existing customer and their phone number fills in.</span></label>
            <label>Phone<input type="tel" value={d.phone} onChange={set('phone')} /></label>
            <label>Due date<input type="date" value={d.dueDate} onChange={set('dueDate')} /></label>
          </div>
          <div className="no-sep" />
          <div className="no-h" style={{ marginBottom: 10 }}><h2 style={{ fontSize: 15 }}>Discount</h2></div>
          <div className="fm">
            <label>Type<select value={d.dt} onChange={set('dt')}><option value="%">Percent</option><option value="P">Amount in P</option></select></label>
            <label>Value<input type="number" min="0" value={d.dv} onChange={set('dv')} /></label>
            <label>Reason<input value={d.dr} onChange={set('dr')} /></label>
          </div>
        </section>

        <section className="no-card">
          <div className="no-h"><span className="no-step">2</span><h2>Order items</h2></div>
          <div className="no-seg" role="tablist" aria-label="How to add items">
            <button role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>Manual override (paste list)</button>
            <button role="tab" aria-selected={tab === 'add'} className={tab === 'add' ? 'on' : ''} onClick={() => setTab('add')}>Add items</button>
          </div>

          {tab === 'add' ? (
            <div style={{ marginTop: 14 }}>
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
              <p className="sub">Each line keeps its own category, size, colour and description, so one order can mix products and designs. Set unit prices and sewing prices by size in step 3, or type them on a single line.</p>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: 13 }}>Paste the order list
                <textarea className="no-ta" value={txt} onChange={(e) => setTxt(e.target.value)} rows={8} placeholder={LIST_HINT} spellCheck={false} />
              </label>
              <div className="no-actions">
                <button className="btn" onClick={readList} disabled={busy || !txt.trim()}>{busy ? 'Reading the list…' : 'Read list and add to order'}</button>
                {txt.trim() && !busy && <button className="btn o" onClick={() => setTxt('')}>Clear text</button>}
                <span className="sub">{txt.trim() ? `${txt.split(/\r?\n/).filter((x) => x.trim()).length} lines pasted` : 'Any layout works. The AI studies the pattern of your list first.'}</span>
              </div>
              {busy && <div className="no-busy" role="status"><i /><span>Studying the pattern of your list, then reading every line. Long lists take up to a minute.</span></div>}
              {perr && <div className="note w" role="alert">{perr}</div>}
              {msg && <div className="note">{msg}</div>}
              {stats && <div className="no-stats">
                <div className="no-stat"><span>Lines pasted</span><b>{stats.pasted}</b></div>
                <div className="no-stat"><span>Lines read</span><b>{stats.read}</b></div>
                <div className="no-stat"><span>Shirts</span><b>{shirts}</b></div>
                <div className="no-stat"><span>Sizes</span><b>{sizeRows.length}</b></div>
                <div className={'no-stat' + (bad || stats.missed ? ' warn' : ' good')}><span>Need attention</span><b>{bad + (stats.missed || 0)}</b></div>
              </div>}
              {warns.length > 0 && <div className="note w"><b>Check these:</b>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{(showWarns ? warns : warns.slice(0, 4)).map((w, i) => <li key={i}>{w}</li>)}</ul>
                {warns.length > 4 && <button className="no-link" onClick={() => setShowWarns(!showWarns)}>{showWarns ? 'Show fewer' : `Show all ${warns.length}`}</button>}
              </div>}
            </div>
          )}

          {bad > 0 && (
            <div className="note w no-fix">
              <span><b>{bad} line{bad > 1 ? 's need' : ' needs'} a size</b> before you can register. Pick it on the line, or set one size for all of them:</span>
              <select aria-label="Set size for lines without one" value="" onChange={(e) => fixAll(e.target.value)}><option value="">Choose size…</option>{S.sizes.map((z) => <option key={z.n}>{z.n}</option>)}</select>
              <button className="btn o smallbtn" onClick={() => setOnlyBad(!onlyBad)}>{onlyBad ? 'Show all lines' : 'Show only these'}</button>
            </div>
          )}
        </section>

        {lines.length > 0 && (
          <section className="no-card">
            <div className="no-h"><span className="no-step">3</span><h2>Prices by size</h2></div>
            <p className="sub" style={{ margin: '-6px 0 12px' }}>Type a unit price and a sewing price for each size in this order. A blank sewing price uses the default of {f2(baseRates(S, '').sew)} per T-shirt, and a blank unit price uses the standard price for that size. A price typed on a single line in step 4 overrides its size price.</p>
            <div className="no-list">
              <div className="no-cols no-szh"><span>Size</span><span>Shirts</span><span>Unit price</span><span>Sewing price</span><span className="r">Subtotal</span></div>
              <div className="no-sz no-sz-all">
                <div className="no-f" data-l="Size"><b>All sizes</b></div>
                <div className="no-f" data-l="Shirts"><span className="sub">{sum(sizeRows, (r) => r.shirts)}</span></div>
                <div className="no-f" data-l="Unit price"><Money><input type="number" step="any" min="0" value={all.unit} onChange={(e) => setAll({ ...all, unit: e.target.value })} placeholder="Same for all" aria-label="Unit price for all sizes" /></Money></div>
                <div className="no-f" data-l="Sewing price"><Money><input type="number" step="any" min="0" value={all.sew} onChange={(e) => setAll({ ...all, sew: e.target.value })} placeholder="Same for all" aria-label="Sewing price for all sizes" /></Money></div>
                <div className="no-f r"><button className="btn smallbtn" onClick={applyAll} disabled={blank(all.unit) && blank(all.sew)}>Apply to all</button></div>
              </div>
              {sizeRows.map(({ z, shirts: n, total, defUnit, defSew }) => (
                <div className="no-sz" key={z.n}>
                  <div className="no-f" data-l="Size"><span className="no-pill">{z.n}</span></div>
                  <div className="no-f" data-l="Shirts">{n}</div>
                  <div className="no-f" data-l="Unit price"><Money><input type="number" step="any" min="0" value={sizeP[z.n]?.unit ?? ''} placeholder={t3(defUnit)} onChange={(e) => setSP(z.n, 'unit', e.target.value)} aria-label={`Unit price for size ${z.n}`} /></Money></div>
                  <div className="no-f" data-l="Sewing price"><Money><input type="number" step="any" min="0" value={sizeP[z.n]?.sew ?? ''} placeholder={t3(defSew)} onChange={(e) => setSP(z.n, 'sew', e.target.value)} aria-label={`Sewing price for size ${z.n}`} /></Money></div>
                  <div className="no-f r" data-l="Subtotal"><b>{f2(total)}</b></div>
                </div>
              ))}
            </div>
            <div className="no-actions" style={{ marginTop: 10 }}>
              <button className="btn o smallbtn" onClick={() => { setSizeP({}); setAll({ unit: '', sew: '' }) }} disabled={!Object.keys(sizeP).length}>Reset to defaults</button>
              <span className="sub">Grey numbers inside the boxes are the defaults that are used when a box is blank.</span>
            </div>
          </section>
        )}

        <section className="no-card">
          <div className="no-h"><span className="no-step">4</span><h2>Items in this order</h2>
            {lines.length > 0 && <span className="no-count">{lines.length} lines · {shirts} shirts</span>}
          </div>
          {lines.length ? (
            <>
              <div className="no-tools">
                <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search names, colours, sizes" aria-label="Search the order items" />
                <button className="btn o smallbtn" onClick={() => setOnlyBad(!onlyBad)} disabled={!bad && !onlyBad}>{onlyBad ? 'Show all lines' : `Needs a size (${bad})`}</button>
                <button className="btn o smallbtn" onClick={() => setLines(sortLines(lines))}>Sort by size and colour</button>
                <button className="btn o smallbtn" onClick={() => { if (window.confirm('Remove every line from this order?')) { setLines([]); setStats(null); setMsg(''); setWarns([]) } }}>Clear all</button>
              </div>
              <div className="no-list">
                <div className="no-scroll">
                  <div className="no-cols"><span>#</span><span>Size</span><span>Description</span><span>Colour</span><span>Qty</span><span>Unit price</span><span>Sewing</span><span className="r">Total</span><span /></div>
                  {shown.map(({ l, ok, u }) => {
                    const fx = isFixed(prodOf(S, l.type)), z = sz(S, l.s), sp = sizeP[l.s] || {}, dr = baseRates(S, l.type)
                    const defU = ok ? t3(blank(sp.unit) ? price(S, z, qn, l.type) : sp.unit) : '', defS = t3(blank(sp.sew) ? dr.sew : sp.sew)
                    return (
                      <div key={l.id} className={'no-rowwrap' + (ok ? '' : ' bad')}>
                        <div className={'no-row' + (ok ? '' : ' bad')}>
                          <div className="no-f c-n"><span className="no-idx">{lines.indexOf(l) + 1}</span></div>
                          <div className="no-f c-size" data-l="Size">{fx ? <span className="sub">–</span> : <select value={l.s} aria-label="Size" aria-invalid={!ok && !z} onChange={(e) => edit(l.id, 's', e.target.value)}>{!z && <option value="">Choose size</option>}{S.sizes.map((x) => <option key={x.n}>{x.n}</option>)}</select>}</div>
                          <div className="no-f c-desc" data-l="Description"><input value={l.desc} aria-label="Description" placeholder="Description" onChange={(e) => edit(l.id, 'desc', e.target.value)} /></div>
                          <div className="no-f c-col" data-l="Colour"><input value={l.colour} aria-label="Colour" list="order-colours" onChange={(e) => edit(l.id, 'colour', e.target.value)} /></div>
                          <div className="no-f c-qty" data-l="Qty"><input type="number" min="1" value={l.q} aria-label="Quantity" onFocus={(e) => e.target.select()} onChange={(e) => edit(l.id, 'q', Math.max(0, Math.floor(+e.target.value) || 0))} /></div>
                          <div className="no-f c-p" data-l="Unit price"><input type="number" step="any" min="0" value={l.unitPrice} aria-label="Unit price" placeholder={defU} onChange={(e) => edit(l.id, 'unitPrice', e.target.value)} /></div>
                          <div className="no-f c-p" data-l="Sewing"><input type="number" step="any" min="0" value={l.sewRate} aria-label="Sewing price per piece" placeholder={defS} onChange={(e) => edit(l.id, 'sewRate', e.target.value)} /></div>
                          <div className="no-f c-tot r" data-l="Total"><b>{u ? f2(l.q * u.price) : '–'}</b></div>
                          <div className="no-f c-act">
                            <button className="no-ic" onClick={() => setOpen({ ...open, [l.id]: !open[l.id] })} aria-expanded={!!open[l.id]} aria-label="More options" title="More options">{open[l.id] ? '▴' : '▾'}</button>
                            <button className="no-ic x" onClick={() => drop(l.id)} aria-label={'Remove ' + (l.desc || l.s || 'item')} title="Remove">×</button>
                          </div>
                        </div>
                        {open[l.id] && (
                          <div className="no-more">
                            <label>Category<select value={l.type} onChange={(e) => edit(l.id, 'type', e.target.value)}><option value="">T-shirt</option>{S.types.map((p) => <option key={p.n} value={p.n}>{p.n}</option>)}</select></label>
                            <label>Fabric<input value={l.fabric} onChange={(e) => edit(l.id, 'fabric', e.target.value)} /></label>
                            <label>Metres per piece<input type="number" step="any" min="0" value={l.m} placeholder={ok ? t3(lineH(S, { s: l.s, type: l.type }) / 1000) : ''} onChange={(e) => edit(l.id, 'm', e.target.value)} /></label>
                            <label>Material price per m<input type="number" step="any" min="0" value={l.fabricRate} placeholder={t3(dr.fabric)} onChange={(e) => edit(l.id, 'fabricRate', e.target.value)} /></label>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {!shown.length && <div className="no-empty">No lines match.</div>}
                </div>
              </div>
            </>
          ) : <p className="sub">No items yet. Paste a list above, or add them one by one in the Add items tab.</p>}
        </section>

        <div className="grid">
          <MaterialPlan lines={built} />
          <div className="no-card"><div className="no-h"><span className="no-step">5</span><h2>Pricing and payment</h2></div>
            <div className={'note' + (q && q < S.thr ? ' w' : '')} style={{ marginTop: 0 }}>{q ? (q < S.thr ? `${q} items, under ${S.thr}: higher prices apply and the full amount is paid before production.` : `${q} items: ${S.thr}+ prices apply and a ${S.dep}% deposit is paid before production.`) : 'Add items to see prices.'}</div>
            <div className="tot"><span>Subtotal</span><span>{f2(c.sub)}</span></div>
            <div className="tot"><span>Discount</span><span>−{f2(c.d)}</span></div>
            <div className="tot big"><span>Net total</span><span>{f2(c.net)}</span></div>
            <div className="tot"><span>Payment required before production</span><span>{f2(c.req)}</span></div>
            {mp.shirts > 0 && <div className="tot"><span>Fabric to cut ({mp.metres.toFixed(2)} m pattern{tolPct(S) > 0 ? ` + ${tolPct(S)}% tolerance` : ''})</span><span>{mp.allow.toFixed(2)} m</span></div>}
            <div className="tot"><span>Production cost, on pattern metres</span><span>{f2(c.cs)}</span></div>
            {c.net > 0 && <div className="tot"><span>Expected margin</span><span>{pc(c.gp / c.net)}</span></div>}
            {c.net > 0 && c.net < c.cs && <div className="note w">The net total is below production cost.</div>}
            {err && <div className="note w" role="alert">{err}</div>}
            <p><button className="btn no-reg" onClick={reg}>Register job card</button></p>
          </div>
        </div>
      </div>
    </>
  )
}
