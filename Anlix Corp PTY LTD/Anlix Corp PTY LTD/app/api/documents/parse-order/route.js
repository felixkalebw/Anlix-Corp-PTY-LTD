diff --git a/Anlix Corp PTY LTD/Anlix Corp PTY LTD/app/api/documents/parse-order/route.js b/Anlix Corp PTY LTD/Anlix Corp PTY LTD/app/api/documents/parse-order/route.js
index 1348deb..4d2d047 100644
--- a/Anlix Corp PTY LTD/Anlix Corp PTY LTD/app/api/documents/parse-order/route.js	
+++ b/Anlix Corp PTY LTD/Anlix Corp PTY LTD/app/api/documents/parse-order/route.js	
@@ -24,6 +24,7 @@ Rules:
 - One line per size and colour combination. Never merge different sizes or colours. Add up the quantities of the same size, colour and garment.
 - "size" must be exactly one of the allowed sizes. Convert wording: extra small = XS, small = S, medium = M, large = L, extra large = XL, double extra large or XXL = 2XL, XXXL = 3XL, XXXXL = 4XL. For children, use the allowed kids size that covers the age or size written (for example age 8 or "kids 8" means the size range that includes 8). If you cannot match a size, use an empty string and add a warning that quotes the text.
 - "colour" is the garment colour in plain words with a capital letter, for example Black or Royal blue. If none is written, use an empty string.
+- "fabric" is the material of the garment, for example Cotton, Polyester or Dry-fit, only when the text says it. Otherwise use an empty string.
 - "description" is the garment, for example T-shirt, Golf shirt, Long sleeve shirt, Tracksuit, Shorts or Socks. Use T-shirt when the text does not say.
 - If the text lists people, for example names and numbers with a size each, count each person as quantity 1 and add up by size and colour. Ignore names and numbers.
 - "qty" is a whole number. If a quantity is missing, use 1 and add a warning.
@@ -83,14 +84,14 @@ function tidy(p, sizes) {
     if (raw && !size) warnings.push(`Size "${raw}" is not in the tracker's size list. Pick the right size by hand.`);
     const qty = Math.max(0, Math.round(num(l.qty) ?? 0));
     if (!qty) continue;
-    const colour = cap(san(l.colour)), description = san(l.description) || "T-shirt";
-    const key = [size, colour.toLowerCase(), description.toLowerCase()].join("|");
+    const colour = cap(san(l.colour)), fabric = cap(san(l.fabric)), description = san(l.description) || "T-shirt";
+    const key = [size, colour.toLowerCase(), fabric.toLowerCase(), description.toLowerCase()].join("|");
     const prev = map.get(key);
     if (prev) prev.qty += qty;
-    else map.set(key, { size, colour, description, qty, unit_price: num(l.unit_price) });
+    else map.set(key, { size, colour, fabric, description, qty, unit_price: num(l.unit_price) });
   }
   const ix = (s) => { const i = sizes.indexOf(s); return i < 0 ? 999 : i; };
-  const lines = [...map.values()].sort((a, b) => ix(a.size) - ix(b.size) || a.colour.localeCompare(b.colour) || a.description.localeCompare(b.description));
+  const lines = [...map.values()].sort((a, b) => ix(a.size) - ix(b.size) || a.colour.localeCompare(b.colour) || a.fabric.localeCompare(b.fabric) || a.description.localeCompare(b.description));
   if (!lines.length) warnings.push("No order lines were found in the text.");
   return { lines, warnings };
 }
diff --git a/Anlix Corp PTY LTD/Anlix Corp PTY LTD/components/screens.jsx b/Anlix Corp PTY LTD/Anlix Corp PTY LTD/components/screens.jsx
index 1ff7223..0d283e9 100644
--- a/Anlix Corp PTY LTD/Anlix Corp PTY LTD/components/screens.jsx	
+++ b/Anlix Corp PTY LTD/Anlix Corp PTY LTD/components/screens.jsx	
@@ -1,11 +1,11 @@
 'use client'
-import { useState } from 'react'
+import { useRef, useState } from 'react'
 import Link from 'next/link'
 import { useParams, useRouter } from 'next/navigation'
 import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell, LabelList, ComposedChart, Line } from 'recharts'
 import { useApp } from './Store'
 import { supabase } from '@/lib/supabase'
-import { TODAY, f2, f0, pc, fd, sum, sz, cost, price, qty, calc, unit, alerts, snapshot, costParts, jobNo, COST_N, STAGES, mkStages, isDone, progress, overdue, phase, phaseTag } from '@/lib/model'
+import { TODAY, f2, f0, pc, fd, sum, sz, cost, price, qty, calc, unit, alerts, snapshot, costParts, jobNo, materialPlan, COST_N, STAGES, mkStages, isDone, progress, overdue, phase, phaseTag } from '@/lib/model'
 
 const Head = ({ title, sub }) => {
   const { S, dispatch } = useApp()
@@ -185,37 +185,114 @@ export function Orders() {
   )
 }
 
+const MaterialPlan = ({ lines, title = 'Materials and production cost' }) => {
+  const { S } = useApp()
+  const m = materialPlan(S, lines)
+  return (
+    <div className="card"><h2>{title}</h2>
+      {m.shirts ? (
+        <>
+          <Table head={['Colour', 'Fabric', 'Sizes', 'Shirts', 'Fabric (m)', 'Fabric cost', 'Production cost']} right={3}>
+            {m.rows.map((g) => (
+              <tr key={g.colour + '|' + g.fabric}><td>{g.colour}</td><td>{g.fabric || '–'}</td><td>{g.sizeText}</td><td className="r">{g.shirts}</td>
+                <td className="r">{g.metres.toFixed(2)}</td><td className="r">{f2(g.fabricCost)}</td><td className="r">{f2(g.cost)}</td></tr>
+            ))}
+          </Table>
+          <div className="tot"><span>Fabric, {m.metres.toFixed(2)} m at {f2(S.R.fabric)} per m</span><span>{f2(m.parts.fabric)}</span></div>
+          <div className="tot"><span>Printing, at {f2(S.R.print)} per m</span><span>{f2(m.parts.print)}</span></div>
+          <div className="tot"><span>Pressing, at {f2(S.R.press)} per m</span><span>{f2(m.parts.press)}</span></div>
+          <div className="tot"><span>Sewing, {m.shirts} shirts at {f2(S.R.sew)}</span><span>{f2(m.parts.sew)}</span></div>
+          <div className="tot big"><span>Production cost</span><span>{f2(m.total)}</span></div>
+          <div className="tot"><span>Average per shirt</span><span>{f2(m.avg)}</span></div>
+          <p className="sub">Fabric length is pattern height × quantity, at the rates in Costing and prices. No allowance is made for cutting waste or rework.</p>
+        </>
+      ) : <p className="sub">Add items with a valid size and quantity to see the fabric needed and the cost of production.</p>}
+    </div>
+  )
+}
+
+const LIST_HINT = 'Black T-shirts: 5 x M, 10 x L, 2 x XL\nRoyal blue golf shirt - 3 medium, 4 large\nKids 7-8 white x 6'
+
 export function NewOrder() {
-  const { S, dispatch } = useApp(), router = useRouter()
-  const [d, setD] = useState({ by: S.user, placed: '', ent: '', phone: '', dueDate: '', dt: '%', dv: 0, dr: '' }), [lines, setLines] = useState([])
-  const [ls, setLs] = useState(S.sizes[0].n), [lq, setLq] = useState(1), [err, setErr] = useState('')
+  const { S, dispatch } = useApp(), router = useRouter(), nid = useRef(0)
+  const mk = (o) => ({ id: ++nid.current, s: '', q: 1, colour: '', fabric: '', desc: '', ...o })
+  const [d, setD] = useState({ by: '', placed: '', ent: '', phone: '', dueDate: '', dt: '%', dv: 0, dr: '' }), [lines, setLines] = useState([])
+  const [tab, setTab] = useState('add'), [f, setF] = useState({ s: S.sizes[0].n, q: 1, colour: '', fabric: '', desc: '' })
+  const [txt, setTxt] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [warns, setWarns] = useState([]), [perr, setPerr] = useState('')
+  const [err, setErr] = useState(''), [tried, setTried] = useState(false)
   const set = (k) => (e) => setD({ ...d, [k]: e.target.value })
-  const c = calc(S, { lines, dt: d.dt, dv: d.dv, pays: [] }), q = c.q
-  const add = () => { const n = Math.floor(+lq); if (n > 0) setLines(lines.some((l) => l.s === ls) ? lines.map((l) => (l.s === ls ? { ...l, q: l.q + n } : l)) : [...lines, { s: ls, q: n }]) }
+  const setF1 = (k) => (e) => setF({ ...f, [k]: e.target.value })
+  const good = lines.filter((l) => sz(S, l.s) && l.q > 0), bad = lines.length - good.length
+  const c = calc(S, { lines: good, dt: d.dt, dv: d.dv, pays: [] }), q = c.q
+  const staffOk = d.by.trim().length >= 2
+  const known = [...new Set(S.orders.map((o) => o.by).filter(Boolean))]
+  const colours = [...new Set(lines.map((l) => l.colour).filter(Boolean))]
+  const ix = (n) => { const i = S.sizes.findIndex((z) => z.n === n); return i < 0 ? 999 : i }
+  const sortLines = (a) => [...a].sort((x, y) => ix(x.s) - ix(y.s) || x.colour.localeCompare(y.colour) || x.desc.localeCompare(y.desc))
+
+  // Different sizes, colours and descriptions all live in the same order. Identical lines are added together.
+  const add = () => {
+    const n = Math.floor(+f.q)
+    if (!(n > 0)) return setErr('Quantity must be at least 1.')
+    const colour = f.colour.trim(), fabric = f.fabric.trim(), desc = f.desc.trim(), lc = (v) => (v || '').toLowerCase()
+    const same = (l) => l.s === f.s && lc(l.colour) === lc(colour) && lc(l.fabric) === lc(fabric) && lc(l.desc) === lc(desc) && !l.unitPrice
+    setErr('')
+    setLines((ls) => (ls.some(same) ? ls.map((l) => (same(l) ? { ...l, q: l.q + n } : l)) : [...ls, mk({ s: f.s, q: n, colour, fabric, desc })]))
+    setF({ ...f, q: 1, desc: '' })
+  }
+  const edit = (id, k, v) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, [k]: v, src: undefined } : l)))
+  const drop = (id) => setLines((ls) => ls.filter((l) => l.id !== id))
+
+  // Manual override: paste a list, the AI reads sizes, colours and garments, and the lines are sorted by size then colour.
+  const readList = async () => {
+    if (!txt.trim()) return setPerr('Paste the order list first.')
+    if (!supabase) return setPerr('Reading a list needs the cloud connection and sign-in. Add the items by hand in the Add items tab.')
+    setBusy(true); setPerr(''); setMsg(''); setWarns([])
+    try {
+      const { data: { session } } = await supabase.auth.getSession()
+      if (!session) throw new Error('Please sign in again.')
+      const res = await fetch('/api/documents/parse-order', {
+        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
+        body: JSON.stringify({ text: txt, sizes: S.sizes.map((z) => z.n) }),
+      })
+      const j = await res.json().catch(() => ({}))
+      if (!res.ok) throw new Error(j.error || 'Could not read the list.')
+      const read = j.lines.map((l) => mk({ s: l.size, q: l.qty, colour: l.colour || '', fabric: l.fabric || '', desc: l.description || '', unitPrice: l.unit_price ?? '', src: 'list' }))
+      setLines((ls) => sortLines([...ls.filter((l) => l.src !== 'list'), ...read]))
+      setWarns(j.warnings || [])
+      setMsg(`${read.length} lines read (${sum(read, (l) => l.q)} shirts) and sorted by size and colour. Check them in the order items below before you register.`)
+    } catch (e) { setPerr(e.message) }
+    setBusy(false)
+  }
+
   const reg = () => {
-    if (!lines.length) return setErr('Add at least one size.')
+    setTried(true)
+    if (!staffOk) return setErr('Enter the name of the staff member taking this order.')
+    if (!lines.length) return setErr('Add at least one item.')
+    if (bad) return setErr(`${bad} item line${bad > 1 ? 's need' : ' needs'} a size and a quantity of at least 1.`)
     if (!d.placed.trim() || !d.ent.trim()) return setErr('Enter who placed the order and their entity or company.')
     if (+d.dv > 0 && !d.dr.trim()) return setErr('Enter a reason for the discount.')
-    const jc = jobNo(S); dispatch({ type: 'register', d, lines }); router.push('/orders/' + jc)
+    setErr('')
+    const jc = jobNo(S); dispatch({ type: 'register', d: { ...d, by: d.by.trim() }, lines: good }); router.push('/orders/' + jc)
   }
+  const cell = { margin: 0, minWidth: 0 }
   return (
     <>
       <Head title="New order" sub="Register the order to get its job card, quotation and invoice numbers." />
-      <div className="grid">
+      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
         <div className="card"><h2>Order details</h2>
           <div className="fm">
-            <label>Received by<select value={d.by} onChange={set('by')}><option>Staff 1</option><option>Staff 2</option></select></label>
+            <label>Job card number<input value={jobNo(S)} readOnly aria-readonly="true" /><span className="sub">Generated automatically. The quotation and invoice numbers follow it.</span></label>
+            <label>Staff member taking the order (required)
+              <input list="staff-names" value={d.by} onChange={set('by')} placeholder="Full name" required aria-required="true" aria-invalid={tried && !staffOk} autoComplete="off" />
+              <datalist id="staff-names">{known.map((n) => <option key={n} value={n} />)}</datalist>
+              {tried && !staffOk && <span className="note w" style={{ display: 'block', marginTop: 4 }}>Enter the name of the staff member taking this order.</span>}
+            </label>
             <label>Placed by<input value={d.placed} onChange={set('placed')} placeholder="Person's name" /></label>
             <label>Entity or company<input value={d.ent} onChange={set('ent')} placeholder="Company name" /></label>
             <label>Phone<input type="tel" value={d.phone} onChange={set('phone')} /></label>
             <label>Due date<input type="date" value={d.dueDate} onChange={set('dueDate')} /></label>
           </div>
-          <h2 style={{ marginTop: 18 }}>Add shirts</h2>
-          <div className="fm">
-            <label>Size<select value={ls} onChange={(e) => setLs(e.target.value)}>{S.sizes.map((z) => <option key={z.n}>{z.n}</option>)}</select></label>
-            <label>Quantity<input type="number" min="1" value={lq} onChange={(e) => setLq(e.target.value)} /></label>
-            <button className="btn" onClick={add}>Add to order</button>
-          </div>
           <h2 style={{ marginTop: 18 }}>Discount</h2>
           <div className="fm">
             <label>Type<select value={d.dt} onChange={set('dt')}><option value="%">Percent</option><option value="P">Amount in P</option></select></label>
@@ -223,21 +300,72 @@ export function NewOrder() {
             <label>Reason<input value={d.dr} onChange={set('dr')} /></label>
           </div>
         </div>
-        <div className="card"><h2>Pricing and payment</h2>
-          <div className={'note' + (q && q < S.thr ? ' w' : '')}>{q ? (q < S.thr ? `${q} shirts, under ${S.thr}: higher prices apply and the full amount is paid before production.` : `${q} shirts: ${S.thr}+ prices apply and a ${S.dep}% deposit is paid before production.`) : 'Add sizes to see prices.'}</div>
-          <Table head={['Size', 'Qty', 'Unit price', 'Line total', '']} right={1}>
-            {lines.map((l, i) => { const p = price(S, sz(S, l.s), q); return (
-              <tr key={l.s}><td>{l.s}</td><td className="r">{l.q}</td><td className="r">{f2(p)}</td><td className="r">{f2(l.q * p)}</td>
-                <td><button className="btn o" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label={'Remove ' + l.s}>Remove</button></td></tr>) })}
-          </Table>
-          <div className="tot"><span>Subtotal</span><span>{f2(c.sub)}</span></div>
-          <div className="tot"><span>Discount</span><span>−{f2(c.d)}</span></div>
-          <div className="tot big"><span>Net total</span><span>{f2(c.net)}</span></div>
-          <div className="tot"><span>Payment required before production</span><span>{f2(c.req)}</span></div>
-          {c.net > 0 && <div className="tot"><span>Expected margin</span><span>{pc(c.gp / c.net)}</span></div>}
-          {c.net > 0 && c.net < c.cs && <div className="note w">The net total is below production cost.</div>}
-          {err && <div className="note w">{err}</div>}
-          <p><button className="btn" onClick={reg}>Register job card</button></p>
+
+        <div className="card"><h2>Order items</h2>
+          <div className="chips" role="tablist" aria-label="How to add items">
+            <button role="tab" aria-selected={tab === 'add'} className={'chip' + (tab === 'add' ? ' on' : '')} onClick={() => setTab('add')}>Add items</button>
+            <button role="tab" aria-selected={tab === 'list'} className={'chip' + (tab === 'list' ? ' on' : '')} onClick={() => setTab('list')}>Manual override (paste list)</button>
+          </div>
+          {tab === 'add' ? (
+            <div style={{ marginTop: 12 }}>
+              <div className="fm">
+                <label>Size<select value={f.s} onChange={setF1('s')}>{S.sizes.map((z) => <option key={z.n}>{z.n}</option>)}</select></label>
+                <label>Quantity<input type="number" min="1" value={f.q} onChange={setF1('q')} /></label>
+                <label>Colour<input list="order-colours" value={f.colour} onChange={setF1('colour')} placeholder="e.g. Black" /><datalist id="order-colours">{colours.map((x) => <option key={x} value={x} />)}</datalist></label>
+                <label>Fabric (optional)<input value={f.fabric} onChange={setF1('fabric')} placeholder="e.g. Cotton" /></label>
+                <label>Description<input value={f.desc} onChange={setF1('desc')} placeholder="e.g. Logo on chest, name on back" /></label>
+                <button className="btn" onClick={add}>Add to order</button>
+              </div>
+              <p className="sub">Add as many sizes as you need. Each line keeps its own colour and description, so one order can mix sizes and designs.</p>
+            </div>
+          ) : (
+            <div style={{ marginTop: 12 }}>
+              <label>Paste the order list
+                <textarea value={txt} onChange={(e) => setTxt(e.target.value)} rows={8} placeholder={LIST_HINT} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, padding: 10, font: 'inherit', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--card)', color: 'var(--ink)' }} />
+              </label>
+              <p><button className="btn" onClick={readList} disabled={busy || !txt.trim()}>{busy ? 'Reading the list…' : 'Read list and add to order'}</button></p>
+              <p className="sub">The AI picks out sizes, colours and garments and sorts them by size, then colour. Reading again replaces lines from the earlier read that you have not edited.</p>
+              {perr && <div className="note w">{perr}</div>}
+              {msg && <div className="note">{msg}</div>}
+              {warns.length > 0 && <div className="note w"><b>Check these:</b><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{warns.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
+            </div>
+          )}
+
+          <h2 style={{ marginTop: 18 }}>Items in this order</h2>
+          {lines.length ? (
+            <>
+              <Table head={['Size', 'Qty', 'Colour', 'Fabric', 'Description', 'Unit price', 'Line total', '']} right={99}>
+                {lines.map((l) => { const okL = sz(S, l.s) && l.q > 0, u = okL ? unit(S, l, q) : null; return (
+                  <tr key={l.id}>
+                    <td><select style={cell} value={l.s} aria-label="Size" aria-invalid={!sz(S, l.s)} onChange={(e) => edit(l.id, 's', e.target.value)}>{!sz(S, l.s) && <option value="">Choose size</option>}{S.sizes.map((z) => <option key={z.n}>{z.n}</option>)}</select></td>
+                    <td style={{ width: 90 }}><input style={cell} type="number" min="1" value={l.q} aria-label="Quantity" onFocus={(e) => e.target.select()} onChange={(e) => edit(l.id, 'q', Math.max(0, Math.floor(+e.target.value) || 0))} /></td>
+                    <td><input style={{ ...cell, minWidth: 110 }} value={l.colour} aria-label="Colour" list="order-colours" onChange={(e) => edit(l.id, 'colour', e.target.value)} /></td>
+                    <td><input style={{ ...cell, minWidth: 100 }} value={l.fabric} aria-label="Fabric" onChange={(e) => edit(l.id, 'fabric', e.target.value)} /></td>
+                    <td><input style={{ ...cell, minWidth: 200 }} value={l.desc} aria-label="Description" placeholder="Description" onChange={(e) => edit(l.id, 'desc', e.target.value)} /></td>
+                    <td className="r">{u ? f2(u.price) : '–'}</td><td className="r">{u ? f2(l.q * u.price) : '–'}</td>
+                    <td><button className="btn o" onClick={() => drop(l.id)} aria-label={'Remove ' + (l.s || 'item')}>Remove</button></td>
+                  </tr>) })}
+              </Table>
+              {bad > 0 && <div className="note w">{bad} line{bad > 1 ? 's need' : ' needs'} a size and a quantity of at least 1 before the order can be registered.</div>}
+              <p><button className="btn o" onClick={() => setLines(sortLines(lines))}>Sort by size and colour</button></p>
+            </>
+          ) : <p className="sub">No items yet. Add them one by one, or paste a list in the Manual override tab.</p>}
+        </div>
+
+        <div className="grid">
+          <MaterialPlan lines={good} />
+          <div className="card"><h2>Pricing and payment</h2>
+            <div className={'note' + (q && q < S.thr ? ' w' : '')}>{q ? (q < S.thr ? `${q} shirts, under ${S.thr}: higher prices apply and the full amount is paid before production.` : `${q} shirts: ${S.thr}+ prices apply and a ${S.dep}% deposit is paid before production.`) : 'Add items to see prices.'}</div>
+            <div className="tot"><span>Subtotal</span><span>{f2(c.sub)}</span></div>
+            <div className="tot"><span>Discount</span><span>−{f2(c.d)}</span></div>
+            <div className="tot big"><span>Net total</span><span>{f2(c.net)}</span></div>
+            <div className="tot"><span>Payment required before production</span><span>{f2(c.req)}</span></div>
+            <div className="tot"><span>Production cost</span><span>{f2(c.cs)}</span></div>
+            {c.net > 0 && <div className="tot"><span>Expected margin</span><span>{pc(c.gp / c.net)}</span></div>}
+            {c.net > 0 && c.net < c.cs && <div className="note w">The net total is below production cost.</div>}
+            {err && <div className="note w" role="alert">{err}</div>}
+            <p><button className="btn" onClick={reg}>Register job card</button></p>
+          </div>
         </div>
       </div>
     </>
@@ -283,14 +411,15 @@ export function Job() {
           <div className="card"><h2>Order details</h2>
             <div className="kp">{[['Order date', fd(o.date)], ['Due date', o.dueDate ? fd(o.dueDate) : '–'], ['Received by', o.by], ['Placed by', o.placed], ['Entity', o.ent], ['Phone', o.phone || '–']].map(([l, v]) => <div key={l}><div className="sub">{l}</div>{v}</div>)}</div></div>
           <div className="card"><h2>Order lines</h2>
-            <Table head={['Size', 'Qty', 'Unit price', 'Unit cost', 'Line total']} right={1}>
-              {o.lines.map((l) => { const u = unit(S, l, c.q); return <tr key={l.s}><td>{l.s}</td><td className="r">{l.q}</td><td className="r">{f2(u.price)}</td><td className="r">{f2(u.cost)}</td><td className="r">{f2(l.q * u.price)}</td></tr> })}
+            <Table head={['Size', 'Colour', 'Description', 'Qty', 'Unit price', 'Unit cost', 'Line total']} right={3}>
+              {o.lines.map((l, i) => { const u = unit(S, l, c.q); return <tr key={i}><td>{l.s}</td><td>{l.colour || '–'}</td><td>{[l.fabric, l.desc].filter(Boolean).join(' · ') || '–'}</td><td className="r">{l.q}</td><td className="r">{f2(u.price)}</td><td className="r">{f2(u.cost)}</td><td className="r">{f2(l.q * u.price)}</td></tr> })}
             </Table>
             <div className="tot"><span>Subtotal</span><span>{f2(c.sub)}</span></div>
             <div className="tot"><span>Discount{o.dv ? ': ' + o.dr : ''}</span><span>−{f2(c.d)}</span></div>
             <div className="tot big"><span>Net total</span><span>{f2(c.net)}</span></div>
             <div className="tot"><span>Production cost</span><span>{f2(c.cs)}</span></div>
             <div className="tot"><span>Gross profit</span><span>{f2(c.gp)}</span></div></div>
+          <MaterialPlan lines={o.lines} title="Materials required" />
           <Production o={o} c={c} />
         </div>
         <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
diff --git a/Anlix Corp PTY LTD/Anlix Corp PTY LTD/lib/model.js b/Anlix Corp PTY LTD/Anlix Corp PTY LTD/lib/model.js
index 52bbed9..0a7e422 100644
--- a/Anlix Corp PTY LTD/Anlix Corp PTY LTD/lib/model.js	
+++ b/Anlix Corp PTY LTD/Anlix Corp PTY LTD/lib/model.js	
@@ -68,9 +68,38 @@ export const RESP_TYPES = ['Staff member', 'Supplier', 'Equipment or machine', '
 export const reworksOf = (o) => (o.stages || []).filter((s) => s.rw)
 export const reworkCost = (o) => reworksOf(o).reduce((t, s) => t + (+(s.rw.act ?? s.rw.est) || 0), 0)
 export const stageBlocked = (o, i) => (o.stages || []).slice(0, i).some((s) => !isDone(s))
-export const jobNo = (S) => `JC-${TODAY.slice(0, 4)}-${String(S.seq + 1).padStart(4, '0')}`
+// Next free job card number. Skips any number already used, so two staff can never end up with the same job card.
+export const nextSeq = (S) => { let n = S.seq + 1; while (S.orders.some((o) => o.jc === `JC-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`)) n++; return n }
+export const jobNo = (S) => `JC-${TODAY.slice(0, 4)}-${String(nextSeq(S)).padStart(4, '0')}`
 const now = () => new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
 
+// Fabric needed and production cost for a set of order lines, grouped by colour and fabric.
+// Fabric length = pattern height x quantity. Uses the same rates as cost(), so the total matches the order's production cost.
+export function materialPlan(S, lines) {
+  const groups = new Map()
+  let shirts = 0, metres = 0
+  lines.forEach((l) => {
+    const z = sz(S, l.s), q = +l.q || 0
+    if (!z || q <= 0) return
+    const colour = (l.colour || '').trim() || 'Colour not given', fabric = (l.fabric || '').trim()
+    const key = colour.toLowerCase() + '|' + fabric.toLowerCase()
+    const g = groups.get(key) || { colour, fabric, shirts: 0, metres: 0, by: {} }
+    const m = (q * z.h) / 1000
+    g.shirts += q; g.metres += m; g.by[z.n] = (g.by[z.n] || 0) + q
+    groups.set(key, g)
+    shirts += q; metres += m
+  })
+  const rows = [...groups.values()].map((g) => ({
+    ...g,
+    sizeText: S.sizes.filter((z) => g.by[z.n]).map((z) => `${g.by[z.n]} × ${z.n}`).join(', '),
+    fabricCost: g.metres * S.R.fabric,
+    cost: g.metres * (S.R.fabric + S.R.print + S.R.press) + g.shirts * S.R.sew,
+  })).sort((a, b) => a.colour.localeCompare(b.colour) || a.fabric.localeCompare(b.fabric))
+  const parts = { fabric: metres * S.R.fabric, print: metres * S.R.print, press: metres * S.R.press, sew: shirts * S.R.sew }
+  const total = parts.fabric + parts.print + parts.press + parts.sew
+  return { rows, shirts, metres, parts, total, avg: shirts ? total / shirts : 0 }
+}
+
 export function costParts(S, ord) {
   const jobs = ord.map((o) => {
     let m = 0, sh = 0
@@ -88,13 +117,17 @@ export function reduce(S, a) {
     case 'load': return { ...initial(), ...a.state }
     case 'user': return { ...S, user: a.user }
     case 'register': {
-      const n = S.seq + 1, p = String(n).padStart(4, '0'), y = TODAY.slice(0, 4), q = a.lines.reduce((t, l) => t + l.q, 0)
-      const lines = a.lines.map((l) => { const z = sz(S, l.s); return { ...l, unitPrice: price(S, z, q), unitCost: cost(S, z) } })
-      const o = { jc: `JC-${y}-${p}`, qt: `QT-${y}-${p}`, inv: `INV-${y}-${p}`, date: TODAY, by: a.d.by, placed: a.d.placed.trim(), ent: a.d.ent.trim(), lines,
+      const n = nextSeq(S), p = String(n).padStart(4, '0'), y = TODAY.slice(0, 4)
+      const by = String(a.d.by || '').trim() // the staff member taking the order is required
+      const ok = (a.lines || []).filter((l) => sz(S, l.s) && l.q > 0)
+      if (!by || !ok.length) return S
+      const q = ok.reduce((t, l) => t + l.q, 0)
+      const lines = ok.map((l) => { const z = sz(S, l.s); return { s: l.s, q: l.q, colour: (l.colour || '').trim(), fabric: (l.fabric || '').trim(), desc: (l.desc || '').trim(), unitPrice: num(l.unitPrice) ? +l.unitPrice : price(S, z, q), unitCost: cost(S, z) } })
+      const o = { jc: `JC-${y}-${p}`, qt: `QT-${y}-${p}`, inv: `INV-${y}-${p}`, date: TODAY, by, placed: a.d.placed.trim(), ent: a.d.ent.trim(), lines,
         dt: a.d.dt, dv: +a.d.dv || 0, dr: a.d.dr, pays: [], prod: false, prodStatus: 'Awaiting production', priority: 'Normal', dueDate: a.d.dueDate || '', phone: (a.d.phone || '').trim(), stages: mkStages(), createdAt: new Date().toISOString() }
-      const e = [log(`Job card ${o.jc} created, linked to ${o.qt} and ${o.inv}`, o.jc, a.d.by)]
-      if (o.dv > 0) e.push(log(`Discount ${o.dt === '%' ? o.dv + '%' : f2(o.dv)} applied: ${o.dr}`, o.jc, a.d.by))
-      return { ...add(...e), seq: n, user: a.d.by, orders: [...S.orders, o] }
+      const e = [log(`Job card ${o.jc} created by ${by}, linked to ${o.qt} and ${o.inv}`, o.jc, by)]
+      if (o.dv > 0) e.push(log(`Discount ${o.dt === '%' ? o.dv + '%' : f2(o.dv)} applied: ${o.dr}`, o.jc, by))
+      return { ...add(...e), seq: n, orders: [...S.orders, o] }
     }
     case 'pay': {
       if (!(a.amt > 0)) return S
