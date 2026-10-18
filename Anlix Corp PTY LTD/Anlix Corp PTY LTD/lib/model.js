export const TODAY = new Date().toISOString().slice(0, 10)
export const f2 = (n) => 'P' + (+n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const f0 = (n) => 'P' + Math.round(+n || 0).toLocaleString('en')
export const pc = (n) => ((+n || 0) * 100).toFixed(1) + '%'
export const fd = (d) => new Date(d + 'T00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
export const sum = (a, f) => a.reduce((t, x) => t + f(x), 0)
export const COST_N = ['Fabric', 'Printing', 'Pressing', 'Sewing', 'Wastage and rework', 'Other direct costs']

const num = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(+v)

// Garment types. m = fabric multiplier on the size's pattern height (1 = same as the size table).
// Long sleeves use more fabric, so set their multiplier on the Costing page once you have measured it.
export const TYPES0 = ['Round neck', 'V-neck', 'Golf - round neck', 'Golf - V-neck', 'Long sleeve']

// Product catalogue. Every entry has a name (n) and a method (mode):
//   'sized' = fabric per piece follows the size's pattern height x a multiplier (m), e.g. dress, track suit.
//   'fixed' = fabric per piece is a set number of metres (metres), e.g. bucket hat, banners.
// Any of fabric / print / press (per metre) and sew (making fee per piece) can be set per product; blank means "use the Cost rates".
// price = { adult: [under bulk threshold, bulk], kids: [under, bulk] } and is set by hand. Fixed products use the adult pair only.
// Older shirt types have no mode: they keep using the shirt price tiers and the Cost rates.
export const CATALOG_V = 2
export const NEW_PRODUCTS = () => [
  { n: 'Bucket hat', mode: 'fixed', m: 1, metres: 0.1, fabric: 35 },   // 1 m of fabric makes 10 hats; fabric P30 to P35 per metre
  { n: 'Dress', mode: 'sized', m: 1.54862 },                           // medium dress with sleeves and collar = 1207.92 mm (780 mm medium shirt x 1.54862)
  { n: 'Track suit', mode: 'sized', m: 1 },                            // set the multiplier once measured
  { n: 'Banner - PVC', mode: 'fixed', m: 1 },
  { n: 'Banner - Pull-up', mode: 'fixed', m: 1 },
  { n: 'Banner - Mesh', mode: 'fixed', m: 1 },
  { n: 'Banner - Fabric', mode: 'fixed', m: 1 },
  { n: 'Banner - Teardrop flag', mode: 'fixed', m: 1 },
]
export const ONE = 'One size' // stand-in size for fixed products, which are not sized
export const isFixed = (p) => !!p && p.mode === 'fixed'
export const prodOf = (S, t) => (S.types || []).find((y) => y.n === t)
const RATE_KEYS = ['fabric', 'print', 'press', 'sew']
// Rates a product sets for itself (numbers only).
export const typeRates = (S, t) => { const p = prodOf(S, t), o = {}; if (p) RATE_KEYS.forEach((k) => { if (num(p[k]) && +p[k] >= 0) o[k] = +p[k] }); return o }
// Default rates for a line of this product: product's own where set, else the Cost rates.
export const baseRates = (S, t) => ({ ...S.R, ...typeRates(S, t) })
// What still needs to be filled in before this product can be sold at a sensible price.
export const typeGaps = (S, p) => {
  const g = []
  if (!p || !p.mode) return g
  if (isFixed(p) && !(num(p.metres) && +p.metres > 0)) g.push('metres per piece')
  if (!isFixed(p) && !num(p.m)) g.push('fabric multiplier')
  if (!(p.price && p.price.adult && (num(p.price.adult[0]) || num(p.price.adult[1])))) g.push('selling price')
  return g
}
// Words used for the item on invoices and quotations.
export const lineNoun = (S, l) => { const p = prodOf(S, l.type); return !l.type ? 'T-shirts' : p && p.mode ? p.n : l.type + ' T-shirts' }
export const lineLabel = (l) => [l.type, l.s === ONE ? '' : l.s, l.colour].filter(Boolean).join(' ')

export const initial = () => ({
  user: 'Staff 1',
  R: { print: 50, fabric: 18, press: 10, sew: 25 }, // print, fabric, press per metre; sew per shirt
  T: { adult: [200, 180], kids: [150, 130] },
  thr: 10, dep: 50, seq: 0, over: [], orders: [], audit: [], finance: [], inventory: [], qc: [],
  tol: 5, // allowed difference (%) between theoretical and actual printed metres
  types: [...TYPES0.map((n) => ({ n, m: 1 })), ...NEW_PRODUCTS()],
  catalogV: CATALOG_V,
  sizes: [
    ...[['2–4 yrs', 490], ['5–6 yrs', 550], ['7–8 yrs', 590], ['9–10 yrs', 610], ['11–12 yrs', 640], ['13–14 yrs', 679]].map(([n, h]) => ({ n, c: 'kids', h })),
    { n: 'XS', c: 'adult', h: 724 }, { n: 'S', c: 'adult', h: 740, e: 1 }, { n: 'M', c: 'adult', h: 780, e: 1 },
    { n: 'L', c: 'adult', h: 920, e: 1 }, { n: 'XL', c: 'adult', h: 1210, e: 1 },
    { n: '2XL', c: 'adult', h: 1243.37 }, { n: '3XL', c: 'adult', h: 1273.94 }, { n: '4XL', c: 'adult', h: 1290.53 },
  ],
})

export const sz = (S, n) => S.sizes.find((z) => z.n === n) || (n === ONE ? { n: ONE, c: 'adult', h: 1000 } : undefined)
// Selling price of one piece. A product with its own price uses it (blank bulk price falls back to the standard price).
// Older shirt types, and lines with no product, use the shirt price tiers. New products with no price set return 0 until one is entered.
const pick = (a, t) => (!a ? null : num(a[t]) ? +a[t] : num(a[0]) ? +a[0] : num(a[1]) ? +a[1] : null)
export const price = (S, z, q, t) => {
  const tier = q >= S.thr ? 1 : 0, p = prodOf(S, t)
  if (p && p.mode) { const v = pick(p.price && p.price[isFixed(p) ? 'adult' : z.c], tier); return v === null ? 0 : v }
  return S.T[z.c][tier]
}
export const qty = (o) => o.lines.reduce((a, l) => a + l.q, 0)

// ---------- Tolerance, garment type and per-line rates ----------
export const tolPct = (S) => (num(S.tol) && +S.tol >= 0 ? +S.tol : 5)
export const typeMult = (S, t) => { const x = (S.types || []).find((y) => y.n === t); return x && num(x.m) && +x.m > 0 ? +x.m : 1 }

// Pattern height in mm for one shirt on a line: own override, else size height x garment type multiplier.
export const lineH = (S, l) => {
  const z = sz(S, l.s)
  if (!z) return 0
  if (num(l.h) && +l.h > 0) return +l.h
  const p = prodOf(S, l.type)
  if (isFixed(p)) return num(p.metres) && +p.metres > 0 ? +p.metres * 1000 : 0
  return z.h * typeMult(S, l.type)
}

// Rates a line is costed at. New lines carry their own snapshot (l.rt) with any overrides listed in l.ov.
// Older lines (no l.rt) fall back to their saved unit cost, or the current defaults.
export const lineRates = (S, l) => {
  if (l.rt) return l.rt
  const R = S.R
  if (num(l.unitCost)) {
    const m = lineH(S, l) / 1000, sew = Math.min(+l.unitCost, R.sew), mat = +l.unitCost - sew, base = m * (R.fabric + R.print + R.press), k = base > 0 ? mat / base : 1
    return { fabric: R.fabric * k, print: R.print * k, press: R.press * k, sew }
  }
  return { ...R }
}
export const lineSplit = (S, l) => {
  const m = lineH(S, l) / 1000, r = lineRates(S, l)
  return { m, r, mat: m * (r.fabric + r.print + r.press), sew: r.sew }
}
// Theoretical cost of one shirt on a line. f = actual/theoretical metres factor (1 = no actual data).
export const lineCost = (S, l, f = 1) => { const p = lineSplit(S, l); return p.mat * f + p.sew }

// Default cost for a size at the Costing page rates (no overrides). Used for price tables.
export const cost = (S, z) => (z.h / 1000) * (S.R.print + S.R.fabric + S.R.press) + S.R.sew
// Same, with the tolerance allowance added to the metres.
export const costTol = (S, z) => (z.h / 1000) * (1 + tolPct(S) / 100) * (S.R.print + S.R.fabric + S.R.press) + S.R.sew

export const unit = (S, l, q) => ({
  price: num(l.unitPrice) ? +l.unitPrice : price(S, sz(S, l.s), q, l.type),
  cost: lineCost(S, l),
})

export const theoMetres = (S, o) => sum(o.lines, (l) => (+l.q || 0) * lineH(S, l) / 1000)
export const hasActual = (o) => num(o.actualM) && +o.actualM > 0
// actual / theoretical. Applied to all metre-based costs (fabric, printing, pressing) so the true cost follows what was really used.
export const metresFactor = (S, o) => { const t = theoMetres(S, o); return hasActual(o) && t > 0 ? +o.actualM / t : 1 }

export function calc(S, o) {
  const q = qty(o)
  let sub = 0, mat = 0, sw = 0
  o.lines.forEach((l) => { const u = unit(S, l, q), p = lineSplit(S, l); sub += l.q * u.price; mat += l.q * p.mat; sw += l.q * p.sew })
  const f = metresFactor(S, o), cth = mat + sw, cs = mat * f + sw
  const d = Math.min(sub, o.dt === '%' ? (sub * (+o.dv || 0)) / 100 : +o.dv || 0)
  const net = sub - d, req = q < S.thr ? net : (net * S.dep) / 100, paid = o.pays.reduce((a, p) => a + p.amt, 0)
  return { q, sub, cs, cth, f, act: hasActual(o), varCost: cs - cth, d, net, req, paid, bal: net - paid, ok: net > 0 && paid >= req - 0.005, gp: net - cs }
}

// Metre variance for one order. pct is a percentage (7.5 = 7.5%).
export function metreVar(S, o) {
  const theo = theoMetres(S, o), tol = tolPct(S), allowed = theo * (1 + tol / 100)
  if (!hasActual(o)) return { theo, act: null, diff: 0, pct: 0, tol, allowed, within: true, excess: 0, cost: 0, costAbove: 0 }
  const act = +o.actualM, diff = act - theo, c = calc(S, o)
  const excess = Math.max(0, act - allowed)
  const matPerMetre = theo > 0 ? sum(o.lines, (l) => (+l.q || 0) * lineSplit(S, l).mat) / theo : 0
  return { theo, act, diff, pct: theo > 0 ? (diff / theo) * 100 : 0, tol, allowed, within: act <= allowed + 1e-9, excess, cost: c.cs - c.cth, costAbove: excess * matPerMetre }
}

// Variance across many orders (only orders with actual metres are counted).
export function metreStats(S, ord) {
  const rows = (ord || S.orders).map((o) => ({ o, v: metreVar(S, o) })).filter((x) => x.v.act !== null)
  const theo = sum(rows, (x) => x.v.theo), act = sum(rows, (x) => x.v.act), pcts = rows.map((x) => x.v.pct).sort((a, b) => a - b)
  const p80 = pcts.length ? pcts[Math.min(pcts.length - 1, Math.ceil(pcts.length * 0.8) - 1)] : 0
  return {
    n: rows.length, theo, act, diff: act - theo, pct: theo > 0 ? ((act - theo) / theo) * 100 : 0,
    avg: pcts.length ? sum(pcts, (x) => x) / pcts.length : 0, min: pcts.length ? pcts[0] : 0, max: pcts.length ? pcts[pcts.length - 1] : 0,
    outside: rows.filter((x) => !x.v.within).length, cost: sum(rows, (x) => x.v.cost),
    suggested: Math.max(0, Math.ceil(p80 * 10) / 10), // tolerance that would have covered 80% of your orders
    tol: tolPct(S),
  }
}

// Average rate actually paid per tailor (kind 'tailor', sewing fee per shirt) or fabric shop (kind 'shop', fabric price per metre).
export function supplierStats(S, kind) {
  const shop = kind === 'shop', field = shop ? 'shop' : 'tailor', rate = shop ? 'fabric' : 'sew', m = new Map()
  S.orders.forEach((o) => o.lines.forEach((l) => {
    const n = String(l[field] || '').trim()
    if (!n) return
    const r = lineRates(S, l)[rate], w = shop ? ((+l.q || 0) * lineH(S, l)) / 1000 : +l.q || 0
    const g = m.get(n) || { name: n, jobs: new Set(), w: 0, tot: 0, min: Infinity, max: -Infinity }
    g.jobs.add(o.jc); g.w += w; g.tot += w * r; g.min = Math.min(g.min, r); g.max = Math.max(g.max, r)
    m.set(n, g)
  }))
  return [...m.values()].map((g) => ({ name: g.name, orders: g.jobs.size, units: g.w, avg: g.w ? g.tot / g.w : 0, min: g.min, max: g.max })).sort((a, b) => a.avg - b.avg)
}

export function stat(S, o) {
  const c = calc(S, o)
  if (o.prod) return ['In production', 'b']
  if (c.net > 0 && c.bal <= 0.005) return ['Paid in full', 'g']
  if (c.ok) return ['Deposit paid', 'b']
  return ['Awaiting ' + (c.q < S.thr ? 'payment' : 'deposit'), 'a']
}

export const STAGES = ['Artwork and sample approval', 'Material allocation', 'Printing and pressing', 'Cutting and sewing', 'Quality inspection', 'Packing and delivery', 'Final payment and receipt']
export const mkStages = () => STAGES.map((k) => ({ k, st: 'pending' }))
export const isDone = (s) => s.st === 'done' || s.st === 'skipped'
export const progress = (o) => { const s = o.stages || []; return s.length ? Math.round((s.filter(isDone).length / s.length) * 100) : 0 }
export const overdue = (o) => !!o.dueDate && o.dueDate < TODAY && !o.closed
export function phase(S, o) {
  const c = calc(S, o)
  if (o.closed) return 'Completed'
  if (!o.prod) return c.ok ? 'Ready to start production' : 'Awaiting ' + (c.q < S.thr ? 'payment' : 'deposit')
  const st = o.stages || []
  if (st.some((s) => /^Rework/.test(s.k) && s.st === 'active')) return 'Quality hold'
  const a = st.find((s) => s.k === STAGES[0])
  if (a && !isDone(a)) return 'Artwork pending'
  const rest = st.filter((s) => s.k !== STAGES[6])
  if (rest.length && rest.every(isDone)) return 'Ready for collection'
  return 'In production'
}
export const phaseTag = (p) => (p === 'Completed' || p === 'Ready for collection' ? 'g' : /^Awaiting|hold|pending/.test(p) ? 'a' : 'b')
export const FAULTS = ['Missing shirt', 'Print defect', 'Stitching defect', 'Wrong size', 'Damaged', 'Other']
export const REMAKE_FAULTS = ['Missing shirt', 'Wrong size', 'Damaged']
export const RESP_TYPES = ['Staff member', 'Supplier', 'Equipment or machine', 'Customer change', 'Process or instruction', 'Other']
// A rework runs through the normal production stages in the normal order, from printing up to the stage where the defect was found.
// If the defect was found at inspection, the rework stops before inspection (the order's own inspection stage is repeated afterwards).
export const rwAvail = (foundIdx, fail) => (foundIdx < 0 ? [] : STAGES.slice(Math.min(2, foundIdx), Math.min(fail ? 4 : foundIdx + 1, 6)))
export const rwDefault = (fault, avail) => { const d = avail.filter((k) => fault !== 'Stitching defect' || STAGES.indexOf(k) >= 3); return d.length ? d : avail }
export const rwPlan = (keys) => STAGES.filter((k) => (keys || []).includes(k)).map((k) => ({ k, st: 'pending' }))
export const reworksOf = (o) => (o.stages || []).filter((s) => s.rw)
export const reworkCost = (o) => reworksOf(o).reduce((t, s) => t + (+(s.rw.act ?? s.rw.est) || 0), 0)
export const stageBlocked = (o, i) => (o.stages || []).slice(0, i).some((s) => !isDone(s))
// Next free job card number. Skips any number already used, so two staff can never end up with the same job card.
export const nextSeq = (S) => { let n = S.seq + 1; while (S.orders.some((o) => o.jc === `JC-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`)) n++; return n }
export const jobNo = (S) => `JC-${TODAY.slice(0, 4)}-${String(nextSeq(S)).padStart(4, '0')}`
const now = () => new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// Build a saved order line. Blank fabricRate / sewRate / unitPrice mean "use the default".
// Rates are snapshotted on the line so later changes to the Costing page do not rewrite old orders.
export const mkLine = (S, l, q) => {
  const z = sz(S, l.s), rt = baseRates(S, l.type), ov = [], pd = prodOf(S, (l.type || '').trim())
  if (num(l.fabricRate)) { rt.fabric = Math.max(0, +l.fabricRate); ov.push('fabric') }
  if (num(l.sewRate)) { rt.sew = Math.max(0, +l.sewRate); ov.push('sew') }
  const out = {
    s: l.s, q: l.q, colour: (l.colour || '').trim(), fabric: (l.fabric || '').trim(), desc: (l.desc || '').trim(),
    type: (l.type || '').trim(), tailor: (l.tailor || '').trim(), shop: (l.shop || '').trim(),
    rt, ov, unitPrice: num(l.unitPrice) ? Math.max(0, +l.unitPrice) : price(S, z, q, (l.type || '').trim()),
  }
  if (num(l.h) && +l.h > 0) out.h = +l.h
  else if (isFixed(pd) && lineH(S, { s: l.s, type: out.type }) > 0) out.h = lineH(S, { s: l.s, type: out.type }) // keep the metres this piece used when the order was placed
  out.unitCost = lineCost(S, out)
  return out
}

// Fabric needed and production cost for a set of order lines, grouped by colour, garment type and fabric.
// Fabric length = pattern height x garment multiplier x quantity. Each line uses its own rates, so the total matches the order's production cost.
// Pass the order as o to add the actual printed metres. allow = metres to buy/print including the tolerance.
const ixOf = (S, n) => { const i = S.sizes.findIndex((z) => z.n === n); return i < 0 ? 999 : i }
export function materialPlan(S, lines, o) {
  const groups = new Map(), tol = tolPct(S)
  const parts = { fabric: 0, print: 0, press: 0, sew: 0 }
  let shirts = 0, metres = 0
  lines.forEach((l) => {
    const z = sz(S, l.s), q = +l.q || 0
    if (!z || q <= 0) return
    const colour = (l.colour || '').trim() || 'Colour not given', fabric = (l.fabric || '').trim(), type = (l.type || '').trim()
    const key = [colour, type, fabric].map((x) => x.toLowerCase()).join('|')
    const p = lineSplit(S, l), m = q * p.m
    const g = groups.get(key) || { colour, fabric, type, shirts: 0, metres: 0, by: {}, cost: 0, fabricCost: 0, tailors: [], shops: [] }
    g.shirts += q; g.metres += m; g.by[z.n] = (g.by[z.n] || 0) + q
    g.fabricCost += m * p.r.fabric
    g.cost += m * (p.r.fabric + p.r.print + p.r.press) + q * p.r.sew
    const t = String(l.tailor || '').trim(), sh = String(l.shop || '').trim()
    if (t && !g.tailors.includes(t)) g.tailors.push(t)
    if (sh && !g.shops.includes(sh)) g.shops.push(sh)
    groups.set(key, g)
    shirts += q; metres += m
    parts.fabric += m * p.r.fabric; parts.print += m * p.r.print; parts.press += m * p.r.press; parts.sew += q * p.r.sew
  })
  const f = o ? metresFactor(S, o) : 1, actual = o && hasActual(o) ? +o.actualM : null
  const rows = [...groups.values()].map((g) => ({
    ...g,
    sizeText: Object.keys(g.by).sort((a, b) => ixOf(S, a) - ixOf(S, b)).map((n) => (n === ONE ? `${g.by[n]} pcs` : `${g.by[n]} × ${n}`)).join(', '),
    allow: g.metres * (1 + tol / 100),
    actual: actual === null ? null : g.metres * f, // actual metres are shared across groups in proportion to their theoretical metres
  })).sort((a, b) => a.colour.localeCompare(b.colour) || a.type.localeCompare(b.type) || a.fabric.localeCompare(b.fabric))
  const mat = parts.fabric + parts.print + parts.press, total = mat + parts.sew
  return {
    rows, shirts, metres, tol, allow: metres * (1 + tol / 100), actual, factor: f, parts, total, avg: shirts ? total / shirts : 0,
    tolTotal: mat * (1 + tol / 100) + parts.sew,
    actualTotal: actual === null ? null : mat * f + parts.sew,
  }
}

// Payments to tailors and fabric suppliers. They live in the expense ledger (S.finance) so they reach the expenses table and Power BI.
// They are real money paid out, so they are shown next to the estimate and are NOT added to the production cost a second time.
export const PAYOUT = ['Tailor payment', 'Supplier payment']
export const isPayout = (x) => PAYOUT.includes(x.category)
export const payoutsOf = (S, jc) => (S.finance || []).filter((x) => isPayout(x) && x.ref === jc)

// Quality check points. The latest result for each point decides the job's quality status.
export const QC_POINTS = ['Print quality', 'Colour match', 'Sizes and measurements', 'Stitching and finishing', 'Count and packing']
export function qcState(S, jc) {
  const last = new Map()
  ;(S.qc || []).filter((x) => x.jc === jc).forEach((x) => last.set(x.point, x)) // entries are kept oldest first, so the last one wins
  const failed = QC_POINTS.filter((p) => last.get(p) && last.get(p).result === 'Fail')
  const missing = QC_POINTS.filter((p) => !last.get(p))
  const status = failed.length ? 'Failed' : missing.length ? (missing.length === QC_POINTS.length ? 'Not checked' : 'Partly checked') : 'Passed'
  return { status, failed, missing, last }
}

// Fabric stock that a job card will use. Matches each colour group in the materials plan to a fabric item with the same colour.
export function stockNeeds(S, o) {
  const plan = materialPlan(S, o.lines, o), items = (S.inventory || []).filter((i) => i.kind === 'fabric')
  const use = [], missing = []
  plan.rows.forEach((r) => {
    if (!(r.metres > 0)) return
    const col = r.colour.toLowerCase(), fab = (r.fabric || '').toLowerCase()
    const cand = items.filter((i) => String(i.colour || '').trim().toLowerCase() === col && (!i.fabric || !fab || String(i.fabric).trim().toLowerCase() === fab))
    if (!cand.length) { missing.push(r.colour); return }
    const it = cand.slice().sort((a, b) => (+b.qty || 0) - (+a.qty || 0))[0]
    use.push({ id: it.id, name: it.name, m: +r.metres.toFixed(3) })
  })
  return { use, missing }
}
export const lowStock = (S) => (S.inventory || []).filter((i) => (+i.min || 0) > 0 && (+i.qty || 0) <= +i.min)

export function costParts(S, ord) {
  const jobs = ord.map((o) => {
    const f = metresFactor(S, o), v = [0, 0, 0, 0]
    let sh = 0
    o.lines.forEach((l) => {
      const p = lineSplit(S, l), q = +l.q || 0
      v[0] += q * p.m * p.r.fabric * f; v[1] += q * p.m * p.r.print * f; v[2] += q * p.m * p.r.press * f; v[3] += q * p.r.sew
      sh += q
    })
    const jx = (S.finance || []).filter((x) => x.ref === o.jc), w = (x) => x.category === 'Wastage and rework'
    return { o, sh, v: [...v, sum(jx.filter(w), (x) => x.amount), sum(jx.filter((x) => !w(x) && !isPayout(x)), (x) => x.amount)] }
  })
  return { jobs, comp: COST_N.map((_, i) => sum(jobs, (j) => j.v[i])) }
}

// Overheads per job card.
// An overhead with a job card (x.jc) is a direct cost of that order.
// An overhead with no job card is shared (rent, electricity and so on): it is split across the orders placed in the same month, in proportion to shirts.
// Anything that cannot be placed on an order (no orders that month, or the job card was deleted) is reported as unallocated, so the grand total always equals the overheads recorded.
export function overheadByJob(S) {
  const month = (d) => String(d || '').slice(0, 7)
  const by = new Map(S.orders.map((o) => [o.jc, { direct: 0, shared: 0, total: 0, shirts: qty(o) }]))
  const shirtsIn = new Map()
  S.orders.forEach((o) => shirtsIn.set(month(o.date), (shirtsIn.get(month(o.date)) || 0) + qty(o)))
  let unallocated = 0
  const list = S.over || []
  list.forEach((x) => {
    const amt = +x.a || 0
    if (x.jc) {
      const r = by.get(x.jc)
      if (r) r.direct += amt
      else unallocated += amt
      return
    }
    const m = month(x.d), tot = shirtsIn.get(m) || 0
    if (!tot) { unallocated += amt; return }
    S.orders.forEach((o) => {
      if (month(o.date) !== m) return
      const r = by.get(o.jc)
      if (r) r.shared += (amt * r.shirts) / tot
    })
  })
  by.forEach((r) => { r.total = r.direct + r.shared })
  const direct = sum([...by.values()], (r) => r.direct), shared = sum([...by.values()], (r) => r.shared)
  return { by, direct, shared, allocated: direct + shared, unallocated, total: sum(list, (x) => +x.a || 0) }
}

export function reduce(S, a) {
  const log = (t, o = '', u = S.user) => ({ ts: now(), u, o, t })
  const add = (...e) => ({ ...S, audit: [...e.reverse(), ...S.audit] })
  switch (a.type) {
    case 'load': {
      // Saved data from before the product catalogue existed gets the new products added once. Existing products and prices are never touched.
      const st = { ...initial(), ...a.state }
      if (a.state && (a.state.catalogV || 0) < CATALOG_V) {
        const have = new Set((st.types || []).map((t) => t.n.toLowerCase()))
        st.types = [...(st.types || []), ...NEW_PRODUCTS().filter((p) => !have.has(p.n.toLowerCase()))]
        st.catalogV = CATALOG_V
      }
      return st
    }
    case 'user': return { ...S, user: a.user }
    case 'register': {
      const n = nextSeq(S), p = String(n).padStart(4, '0'), y = TODAY.slice(0, 4)
      const by = String(a.d.by || '').trim() // the staff member taking the order is required
      const ok = (a.lines || []).filter((l) => sz(S, l.s) && l.q > 0)
      if (!by || !ok.length) return S
      const q = ok.reduce((t, l) => t + l.q, 0)
      const lines = ok.map((l) => mkLine(S, l, q))
      const o = { jc: `JC-${y}-${p}`, qt: `QT-${y}-${p}`, inv: `INV-${y}-${p}`, date: TODAY, by, placed: a.d.placed.trim(), ent: a.d.ent.trim(), lines,
        dt: a.d.dt, dv: +a.d.dv || 0, dr: a.d.dr, pays: [], prod: false, prodStatus: 'Awaiting production', priority: 'Normal', dueDate: a.d.dueDate || '', phone: (a.d.phone || '').trim(), stages: mkStages(), createdAt: new Date().toISOString() }
      const e = [log(`Job card ${o.jc} created by ${by}, linked to ${o.qt} and ${o.inv}`, o.jc, by)]
      const custom = lines.filter((l) => l.ov.length)
      if (custom.length) e.push(log(`Custom rates on ${custom.length} line(s): ` + custom.map((l) => `${lineLabel(l)}${l.ov.includes('fabric') ? ' fabric ' + f2(l.rt.fabric) + '/m' : ''}${l.ov.includes('sew') ? ' sewing ' + f2(l.rt.sew) : ''}`).join('; '), o.jc, by))
      if (o.dv > 0) e.push(log(`Discount ${o.dt === '%' ? o.dv + '%' : f2(o.dv)} applied: ${o.dr}`, o.jc, by))
      return { ...add(...e), seq: n, orders: [...S.orders, o] }
    }
    case 'lineEdit': {
      // Change rates, price, pattern height, type, tailor or shop on one saved line, until the order is closed. a.patch holds only the fields to change; '' resets a rate or price to its default.
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || o.closed || !o.lines[a.i]) return S
      const old = o.lines[a.i], p = a.patch || {}, l = { ...old, rt: { ...lineRates(S, old) }, ov: [...(old.ov || [])] }
      const ch = [], label = lineLabel(old)
      const blank = (v) => v === '' || v === null || v === undefined
      const rate = (key, field, name) => {
        if (!(key in p)) return
        const raw = p[key], was = l.rt[field]
        if (blank(raw)) {
          const dflt = baseRates(S, l.type)[field]
          if (l.ov.includes(field)) { l.rt[field] = dflt; l.ov = l.ov.filter((x) => x !== field); ch.push(`${name} ${f2(was)} → ${f2(dflt)} (default)`) }
        } else if (num(raw) && +raw >= 0 && +raw !== was) {
          l.rt[field] = +raw; if (!l.ov.includes(field)) l.ov.push(field); ch.push(`${name} ${f2(was)} → ${f2(+raw)}`)
        }
      }
      rate('fabricRate', 'fabric', 'fabric per metre'); rate('sewRate', 'sew', 'sewing fee')
      if ('unitPrice' in p) {
        const was = unit(S, old, qty(o)).price, next = blank(p.unitPrice) ? price(S, sz(S, old.s), qty(o), old.type) : num(p.unitPrice) && +p.unitPrice >= 0 ? +p.unitPrice : was
        if (next !== was) { l.unitPrice = next; ch.push(`selling price ${f2(was)} → ${f2(next)}`) }
      }
      if ('h' in p) {
        const was = lineH(S, old)
        if (blank(p.h)) { if (num(old.h)) { delete l.h; ch.push(`pattern height ${was} mm → ${lineH(S, l)} mm (default)`) } }
        else if (num(p.h) && +p.h > 0 && +p.h !== was) { l.h = +p.h; ch.push(`pattern height ${was} mm → ${+p.h} mm`) }
      }
      ;[['type', 'garment type'], ['tailor', 'tailor'], ['shop', 'fabric shop'], ['colour', 'colour'], ['fabric', 'fabric']].forEach(([k, name]) => {
        if (!(k in p)) return
        const v = String(p[k] || '').trim(), was = String(old[k] || '').trim()
        if (v !== was) { l[k] = v; ch.push(`${name} "${was}" → "${v}"`) }
      })
      if (!ch.length) return S
      l.unitCost = lineCost(S, l)
      const lines = o.lines.map((x, i) => (i === a.i ? l : x))
      const c = calc(S, { ...o, lines })
      if (c.paid > c.net + 0.005) return S // the new total would be below what the customer has already paid
      return { ...add(log(`Line ${a.i + 1} (${label}) changed: ${ch.join('; ')}`, a.jc)), orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, lines } : x)) }
    }
    case 'metres': {
      // Record the actual printing metres for an order (a.m), or clear it with ''. a.note explains the difference (nesting, test prints, etc).
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || o.closed) return S
      if (a.m === '' || a.m === null || a.m === undefined) {
        if (!hasActual(o)) return S
        const { actualM, actualNote, actualAt, actualBy, ...rest } = o
        return { ...add(log(`Actual printing metres cleared (was ${(+actualM).toFixed(2)} m)`, a.jc)), orders: S.orders.map((x) => (x.jc === a.jc ? rest : x)) }
      }
      const m = +a.m
      if (!(Number.isFinite(m) && m > 0)) return S
      const t = theoMetres(S, o), diff = m - t, pct = t > 0 ? (diff / t) * 100 : 0, tol = tolPct(S), note = (a.note || '').trim()
      const flag = pct > tol ? `, above the ${tol}% tolerance` : `, within the ${tol}% tolerance`
      return { ...add(log(`Actual printing metres recorded: ${m.toFixed(2)} m against ${t.toFixed(2)} m theoretical (${diff >= 0 ? '+' : ''}${diff.toFixed(2)} m, ${pct.toFixed(1)}%${flag})${note ? '. ' + note : ''}`, a.jc)),
        orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, actualM: +m.toFixed(3), actualNote: note, actualAt: new Date().toISOString(), actualBy: S.user } : x)) }
    }
    case 'pay': {
      if (!(a.amt > 0)) return S
      const po = S.orders.find((o) => o.jc === a.jc)
      if (!po || a.amt > calc(S, po).bal + 0.005) return S
      const orders = S.orders.map((o) => (o.jc === a.jc ? { ...o, pays: [...o.pays, { d: a.d, amt: a.amt, by: a.by, ent: a.ent }] } : o))
      return { ...add(log(`Payment ${f2(a.amt)} recorded from ${a.by}`, a.jc)), orders }
    }
    case 'produce': {
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || !calc(S, o).ok) return S
      const need = o.prod ? { use: [], missing: [] } : stockNeeds(S, o)
      const inventory = (S.inventory || []).map((i) => { const u = need.use.filter((x) => x.id === i.id); return u.length ? { ...i, qty: +((+i.qty || 0) - sum(u, (x) => x.m)).toFixed(3) } : i })
      const msgs = [log('Moved to production', a.jc)]
      need.use.forEach((u) => msgs.push(log(`Fabric used: ${u.m.toFixed(2)} m of ${u.name} taken from stock`, a.jc)))
      if (need.missing.length) msgs.push(log(`No fabric stock item matches colour ${need.missing.join(', ')}, so nothing was taken from stock for it`, a.jc))
      inventory.filter((i) => need.use.some((x) => x.id === i.id) && (+i.qty || 0) < 0).forEach((i) => msgs.push(log(`Stock of ${i.name} is now ${(+i.qty).toFixed(2)} ${i.unit}: the job used more than was recorded`, a.jc)))
      return { ...add(...msgs), inventory, orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, prod: true, stages: x.stages && x.stages.length ? x.stages : mkStages(), prodStatus: STAGES[0], ...(need.use.length ? { stockUsed: need.use } : {}) } : x)) }
    }
    case 'stage': {
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || !o.prod || o.closed) return S
      const t = new Date().toISOString(), st = (o.stages && o.stages.length ? o.stages : mkStages()).map((s) => ({ ...s }))
      const i = st.findIndex((s) => s.k === a.k)
      if (i < 0) return S
      const s = st[i], who = (a.approver || S.user || '').trim() || S.user, note = (a.note || '').trim()
      const words = { start: 'started', done: 'approved and completed', skip: 'skipped', pass: 'passed inspection' }
      if (!words[a.op]) return S
      if (a.op === 'start') {
        if (s.st !== 'pending' || stageBlocked({ stages: st }, i)) return S
        s.st = 'active'; s.start = t; s.by = S.user
      } else if (a.op === 'skip') {
        if (s.st !== 'pending' || !note || a.k === STAGES[4] || a.k === STAGES[6] || stageBlocked({ stages: st }, i)) return S
        s.st = 'skipped'; s.end = t; s.by = S.user; s.appr = { by: who, at: t, note }
      } else {
        if (s.st !== 'active') return S
        if (st.some((x) => x.rw && x.rw.from === s.k && !isDone(x))) return S // open rework on this stage
        if (a.k === STAGES[6] && calc(S, o).bal > 0.005) return S
        s.st = 'done'; s.end = t; s.by = S.user; s.start = s.start || t; s.appr = { by: who, at: t, note }
        if (a.op === 'pass') s.result = 'Pass'
      }
      const next = st.find((x) => !isDone(x))
      const detail = (a.op === 'done' || a.op === 'pass') ? ` by ${who}${note ? ': ' + note : ''}` : a.op === 'skip' ? `: ${note}` : ''
      return { ...add(log(`Stage "${a.k}" ${words[a.op]}${detail}`, a.jc)), orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, stages: st, prodStatus: next ? next.k : 'Packed' } : x)) }
    }
    case 'rework': {
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || !o.prod || o.closed) return S
      const t = new Date().toISOString(), st = (o.stages && o.stages.length ? o.stages : mkStages()).map((s) => ({ ...s }))
      const i = st.findIndex((s) => s.k === a.k)
      if (i < 0) return S
      const src = st[i], what = (a.what || '').trim(), happened = (a.happened || '').trim(), who = (a.who || '').trim()
      const mat = Math.max(0, +a.mat || 0), lab = Math.max(0, +a.lab || 0), oth = Math.max(0, +a.oth || 0), est = +(mat + lab + oth).toFixed(2)
      if (src.rw || !what || !happened || !who || !RESP_TYPES.includes(a.whoType)) return S
      if (a.fail ? !(a.k === STAGES[4] && src.st === 'active') : !(src.st === 'active' || src.st === 'done')) return S
      const items = (Array.isArray(a.items) ? a.items : []).map((x) => ({ s: String(x.s || '').slice(0, 20), colour: String(x.colour || '').slice(0, 60), desc: String(x.desc || '').slice(0, 120), q: Math.max(0, parseInt(x.q) || 0) })).filter((x) => x.q > 0 && sz(S, x.s)).slice(0, 200)
      const fault = FAULTS.includes(a.fault) ? a.fault : 'Other'
      const n = st.filter((x) => x.rw).length + 1, id = `RW-${o.jc.slice(3)}-${n}`
      if (a.fail) { src.st = 'pending'; src.result = 'Fail'; src.fails = (src.fails || 0) + 1; src.by = S.user }
      const foundIdx = STAGES.indexOf(src.k), avail = rwAvail(foundIdx, !!a.fail)
      const chosen = (Array.isArray(a.steps) ? a.steps : []).filter((k) => avail.includes(k))
      const plan = rwPlan(chosen.length ? chosen : rwDefault(fault, avail))
      if (plan.length) { plan[0].st = 'active'; plan[0].start = t; plan[0].by = S.user }
      const rw = { id, from: src.k, what, happened, who, whoType: a.whoType, fault, remake: !!a.remake, items, qty: items.length ? sum(items, (x) => x.q) : Math.max(0, parseInt(a.qty) || 0), mat, lab, oth, est, raisedBy: S.user, raisedAt: t, found: a.fail ? 'Quality inspection' : src.k, steps: plan.length ? plan : undefined }
      // a failed inspection sends the job back before the inspection point; other rework sits straight after the stage it came from
      st.splice(a.fail ? i : i + 1, 0, { k: `Rework ${n}: ${src.k}`, st: 'active', start: t, by: S.user, rw })
      const fin = { id, date: TODAY, category: 'Wastage and rework', desc: `${src.k}: ${what} (responsible: ${who}, ${a.whoType})`, amount: est, ref: o.jc, by: S.user }
      const next = st.find((x) => !isDone(x))
      return { ...add(log(`Rework ${id} raised at "${src.k}": ${what}. What happened: ${happened}. Responsible: ${who} (${a.whoType}). Estimated cost ${f2(est)}${a.fail ? '. Inspection failed' : ''}${plan.length ? '. Rework stages: ' + plan.map((x) => x.k).join(', ') : ''}`, a.jc)),
        finance: [...(S.finance || []), fin], orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, stages: st, prodStatus: next ? next.k : 'Packed' } : x)) }
    }
    case 'reopen': {
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || !o.prod || o.closed) return S
      const t = new Date().toISOString(), st = (o.stages || []).map((s) => ({ ...s }))
      const i = st.findIndex((x) => x.k === a.k), s = st[i], why = (a.reason || '').trim()
      if (!s || s.rw || !isDone(s) || !why) return S
      if (st.slice(i + 1).some((x) => x.st !== 'pending')) return S // a later stage has already started
      const was = s.appr ? s.appr.by : ''
      s.st = 'active'; s.end = undefined; s.appr = undefined; s.result = undefined; s.by = S.user
      s.reopened = (s.reopened || 0) + 1
      return { ...add(log(`Stage \"${a.k}\" reopened for changes${was ? ` (was approved by ${was})` : ''}: ${why}`, a.jc)),
        orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, stages: st, prodStatus: s.k } : x)) }
    }
    case 'reworkDone': {
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || !o.prod || o.closed) return S
      const t = new Date().toISOString(), st = (o.stages || []).map((s) => ({ ...s }))
      const s = st.find((x) => x.k === a.k)
      if (!s || !s.rw || s.st !== 'active') return S
      if (s.rw.steps && s.rw.steps.length) return S // a rework tracked by stage is completed by approving its last stage
      const act = +a.actual, who = (a.approver || S.user || '').trim() || S.user, note = (a.note || '').trim()
      if (!Number.isFinite(act) || act < 0) return S
      s.rw = { ...s.rw, act: +act.toFixed(2), doneAt: t, fix: note }
      s.st = 'done'; s.end = t; s.by = S.user; s.appr = { by: who, at: t, note }
      const diff = act - s.rw.est, next = st.find((x) => !isDone(x))
      const finance = (S.finance || []).map((x) => (x.id === s.rw.id && x.ref === o.jc ? { ...x, amount: +act.toFixed(2) } : x))
      return { ...add(log(`Rework ${s.rw.id} completed and approved by ${who}. Actual cost ${f2(act)}${diff ? ` (estimate was ${f2(s.rw.est)})` : ''}${note ? '. ' + note : ''}`, a.jc)),
        finance, orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, stages: st, prodStatus: next ? next.k : 'Packed' } : x)) }
    }
    case 'rwPlan': {
      // attach stages to a rework that was raised before stage tracking existed
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || !o.prod || o.closed) return S
      const t = new Date().toISOString(), st = (o.stages || []).map((s) => ({ ...s }))
      const s = st.find((x) => x.k === a.k)
      if (!s || !s.rw || s.st !== 'active' || (s.rw.steps && s.rw.steps.length)) return S
      const plan = rwPlan(rwDefault(s.rw.fault, rwAvail(STAGES.indexOf(s.rw.from), s.rw.found === 'Quality inspection')))
      if (!plan.length) return S
      plan[0].st = 'active'; plan[0].start = t; plan[0].by = S.user
      s.rw = { ...s.rw, steps: plan }
      return { ...add(log(`Rework ${s.rw.id} now tracked by stage: ${plan.map((x) => x.k).join(', ')}`, a.jc)), orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, stages: st } : x)) }
    }
    case 'rwStep': {
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || !o.prod || o.closed) return S
      const t = new Date().toISOString(), st = (o.stages || []).map((s) => ({ ...s }))
      const s = st.find((x) => x.k === a.k)
      if (!s || !s.rw || s.st !== 'active' || !s.rw.steps || !s.rw.steps.length) return S
      const steps = s.rw.steps.map((x) => ({ ...x })), i = steps.findIndex((x) => x.k === a.step), p = steps[i]
      if (!p) return S
      const who = (a.approver || S.user || '').trim() || S.user, note = (a.note || '').trim(), id = s.rw.id
      const put = (e) => ({ ...add(e), orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, stages: st, prodStatus: (st.find((y) => !isDone(y)) || { k: 'Packed' }).k } : x)) })
      if (a.sub === 'start') {
        if (p.st !== 'pending' || steps.slice(0, i).some((x) => x.st !== 'done')) return S
        p.st = 'active'; p.start = t; p.by = S.user
        s.rw = { ...s.rw, steps }
        return put(log(`Rework ${id}: stage \"${p.k}\" started`, a.jc))
      }
      if (a.sub !== 'done' || p.st !== 'active') return S
      const hasCost = a.cost !== '' && a.cost !== null && a.cost !== undefined, cost = hasCost ? +a.cost : 0
      if (hasCost && !(Number.isFinite(cost) && cost >= 0)) return S
      p.st = 'done'; p.end = t; p.by = S.user; p.start = p.start || t; p.appr = { by: who, at: t, note }
      if (hasCost) p.cost = +cost.toFixed(2)
      const last = steps.every((x) => x.st === 'done')
      if (!last) {
        s.rw = { ...s.rw, steps }
        return put(log(`Rework ${id}: stage \"${p.k}\" approved by ${who}${hasCost ? `, cost ${f2(cost)}` : ''}${note ? ': ' + note : ''} (${steps.filter((x) => x.st === 'done').length} of ${steps.length})`, a.jc))
      }
      const act = +a.actual
      if (!Number.isFinite(act) || act < 0) { return S }
      const fix = steps.filter((x) => x.appr && x.appr.note).map((x) => `${x.k}: ${x.appr.note}`).join('; ')
      s.rw = { ...s.rw, steps, act: +act.toFixed(2), doneAt: t, fix }
      s.st = 'done'; s.end = t; s.by = S.user; s.appr = { by: who, at: t, note: `All ${steps.length} rework stages approved` }
      const diff = act - s.rw.est
      const finance = (S.finance || []).map((x) => (x.id === id && x.ref === o.jc ? { ...x, amount: +act.toFixed(2) } : x))
      return { ...put(log(`Rework ${id} completed: all ${steps.length} stages approved, final stage by ${who}. Actual cost ${f2(act)}${diff ? ` (estimate was ${f2(s.rw.est)})` : ''}`, a.jc)), finance }
    }
    case 'close': {
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || o.closed || !(o.stages || []).length || !o.stages.every(isDone)) return S
      const c = calc(S, o)
      if (c.bal > 0.005) return S
      const extra = sum((S.finance || []).filter((x) => x.ref === o.jc), (x) => x.amount)
      // cost uses the actual printed metres when they were recorded, otherwise the theoretical metres
      const closed = { at: new Date().toISOString(), revenue: c.net, cost: c.cs + extra, profit: c.net - c.cs - extra, theoMetres: theoMetres(S, o), actualMetres: hasActual(o) ? +o.actualM : null }
      return { ...add(log(`Order closed. Actual profit ${f2(closed.profit)}${hasActual(o) ? ' (costed on actual printed metres)' : ' (costed on theoretical metres, no actual recorded)'}`, a.jc)), orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, closed, prodStatus: 'Completed' } : x)) }
    }
    case 'rate': return { ...add(log(`Rate ${a.k} changed to ${a.v}`)), R: { ...S.R, [a.k]: a.v } }
    case 'tier': return { ...add(log(`${a.c} price tier ${a.j} changed to ${a.v}`)), T: { ...S.T, [a.c]: S.T[a.c].map((x, i) => (i === a.j ? a.v : x)) } }
    case 'setting': return { ...add(log(`Setting ${a.k} changed to ${a.v}`)), [a.k]: a.v } // tolerance: { type: 'setting', k: 'tol', v: 5 }
    case 'height': return { ...add(log(`Pattern height of ${S.sizes[a.i].n} changed to ${a.v} mm`)), sizes: S.sizes.map((z, i) => (i === a.i ? { ...z, h: a.v, e: 0 } : z)) }
    case 'addSize': return S.sizes.some((z) => z.n === a.size.n) ? S : { ...add(log(`Size ${a.size.n} added, pattern height ${a.size.h} mm`)), sizes: [...S.sizes, a.size] }
    case 'addType': {
      // a.p = { n, mode: 'sized' | 'fixed', m, metres, fabric, print, press, sew, price: { adult: [under, bulk], kids: [under, bulk] } }. Old shape { n, m } still works.
      const p = a.p || { n: a.n, m: a.m }, n = String(p.n || '').trim(), fixed = p.mode === 'fixed', m = +p.m || 1, metres = +p.metres
      if (!n || (S.types || []).some((x) => x.n.toLowerCase() === n.toLowerCase())) return S
      if (fixed ? !(metres > 0) : !(m > 0)) return S
      const t = p.mode ? { n, mode: fixed ? 'fixed' : 'sized', m: fixed ? 1 : m } : { n, m }
      if (fixed) t.metres = metres
      RATE_KEYS.forEach((k) => { if (num(p[k]) && +p[k] >= 0) t[k] = +p[k] })
      const pr = {}
      ;['adult', 'kids'].forEach((c) => { const x = p.price && p.price[c]; if (x && (num(x[0]) || num(x[1]))) pr[c] = [num(x[0]) ? +x[0] : '', num(x[1]) ? +x[1] : ''] })
      if (Object.keys(pr).length) t.price = pr
      const bits = [fixed ? `${metres} m per piece` : `fabric multiplier ${t.m}`, ...RATE_KEYS.filter((k) => k in t).map((k) => `${k === 'fabric' ? 'material' : k === 'sew' ? 'making fee' : k} ${f2(t[k])}${k === 'sew' ? ' per piece' : ' per m'}`), ...(t.price && t.price.adult ? [`price ${t.price.adult.filter((v) => v !== '').map(f2).join(' / ')}`] : [])]
      return { ...add(log(`Product ${n} added (${fixed ? 'fixed metres' : 'sized by pattern'}): ${bits.join(', ')}`)), types: [...(S.types || []), t] }
    }
    case 'typeMult': {
      const x = (S.types || [])[a.i], v = +a.v
      if (!x || !(v > 0)) return S
      return { ...add(log(`Fabric multiplier for ${x.n} changed from ${x.m} to ${v}`)), types: S.types.map((y, i) => (i === a.i ? { ...y, m: v } : y)) }
    }
    case 'typeRate': {
      // Change one setting of a product. a.k is fabric, print, press, sew or metres; '' clears it back to the default (metres cannot be cleared).
      const x = (S.types || [])[a.i]
      if (!x || ![...RATE_KEYS, 'metres'].includes(a.k)) return S
      const blank = a.v === '' || a.v === null || a.v === undefined, name = { fabric: 'material per metre', print: 'printing per metre', press: 'pressing per metre', sew: 'making fee per piece', metres: 'metres per piece' }[a.k]
      const was = num(x[a.k]) ? +x[a.k] : null, shown = (v) => (v === null ? 'default' : a.k === 'metres' ? `${v} m` : f2(v))
      let next
      if (blank) { if (a.k === 'metres' || was === null) return S; next = null }
      else { const v = +a.v; if (!Number.isFinite(v) || v < 0 || (a.k === 'metres' && !(v > 0)) || v === was) return S; next = v }
      const t = { ...x }; if (next === null) delete t[a.k]; else t[a.k] = next
      return { ...add(log(`${x.n}: ${name} ${shown(was)} → ${shown(next)}`)), types: S.types.map((y, i) => (i === a.i ? t : y)) }
    }
    case 'typePrice': {
      // Set a selling price by hand. a.c is 'adult' or 'kids', a.j is 0 (under the bulk threshold) or 1 (bulk), '' clears it.
      const x = (S.types || [])[a.i]
      if (!x || !['adult', 'kids'].includes(a.c) || ![0, 1].includes(a.j)) return S
      const blank = a.v === '' || a.v === null || a.v === undefined, v = blank ? '' : +a.v
      if (!blank && !(Number.isFinite(v) && v >= 0)) return S
      const cur = (x.price && x.price[a.c]) || ['', ''], was = cur[a.j]
      if (was === v) return S
      const pair = [...cur]; pair[a.j] = v
      const price = { ...(x.price || {}) }
      if (pair[0] === '' && pair[1] === '') delete price[a.c]; else price[a.c] = pair
      const t = { ...x }; if (Object.keys(price).length) t.price = price; else delete t.price
      const label = `${a.c === 'kids' ? 'kids' : x.mode === 'fixed' ? 'standard' : 'adult'} ${a.j ? `${S.thr}+` : `under ${S.thr}`}`
      return { ...add(log(`${x.n}: ${label} selling price ${was === '' ? 'not set' : f2(was)} → ${v === '' ? 'not set' : f2(v)}`)), types: S.types.map((y, i) => (i === a.i ? t : y)) }
    }
    case 'delType': {
      // Only products no order has used can be removed, so old orders keep their meaning.
      const x = (S.types || [])[a.i]
      if (!x || S.orders.some((o) => o.lines.some((l) => l.type === x.n))) return S
      return { ...add(log(`Product ${x.n} removed from the catalogue`)), types: S.types.filter((_, i) => i !== a.i) }
    }
    case 'delOrder': {
      // Permanently removes a job card, with its linked quotation, invoice, payments and rework cost entries.
      // Only a super admin can send this (the Store blocks it for everyone else). Job numbers are never reused because seq is not rolled back.
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o) return S
      const c = calc(S, o), fin = (S.finance || []).filter((x) => x.ref === o.jc), why = String(a.reason || '').trim() || 'no reason given', by = a.by || S.user
      const e = log(`Job card ${o.jc} deleted by ${by}: ${why}. Removed with it: ${o.qt}, ${o.inv}, ${o.pays.length} payment(s) totalling ${f2(c.paid)}, ${fin.length} cost entr${fin.length === 1 ? 'y' : 'ies'}. It was for ${o.ent || o.placed || 'unknown customer'}, ${c.q} item(s), net total ${f2(c.net)}${o.closed ? ', already closed' : o.prod ? ', in production' : ''}`, o.jc, by)
      const back = o.stockUsed || []
      const inventory = (S.inventory || []).map((i) => { const u = back.filter((x) => x.id === i.id); return u.length ? { ...i, qty: +((+i.qty || 0) + sum(u, (x) => x.m)).toFixed(3) } : i })
      // Money already paid to tailors or suppliers stays in the ledger (unlinked), because it was really paid.
      const finance = (S.finance || []).filter((x) => x.ref !== o.jc || isPayout(x)).map((x) => (x.ref === o.jc ? { ...x, ref: '', desc: `${x.desc} (was on ${o.jc}, deleted)` } : x))
      return { ...add(e), inventory, orders: S.orders.filter((x) => x.jc !== o.jc), finance }
    }
    case 'itemAdd': {
      const n = String(a.name || '').trim(), u = String(a.unit || 'm').trim() || 'm'
      if (!n || !(+a.qty >= 0) || !(+a.min >= 0)) return S
      if ((S.inventory || []).some((i) => i.name.toLowerCase() === n.toLowerCase())) return S
      const id = 'ST-' + String((S.inventory || []).reduce((t, i) => Math.max(t, parseInt(String(i.id).slice(3), 10) || 0), 0) + 1).padStart(4, '0')
      const item = { id, name: n, sku: String(a.sku || '').trim(), unit: u, qty: +a.qty, min: +a.min || 0, cost: +a.cost || 0, kind: a.kind === 'fabric' ? 'fabric' : 'other', colour: String(a.colour || '').trim(), fabric: String(a.fabric || '').trim() }
      return { ...add(log(`Stock item ${n} added with ${item.qty} ${u}`)), inventory: [...(S.inventory || []), item] }
    }
    case 'itemEdit': {
      const i = (S.inventory || []).find((x) => x.id === a.id)
      if (!i) return S
      const p = a.patch || {}, next = { ...i }
      if (typeof p.name === 'string' && p.name.trim()) next.name = p.name.trim()
      ;['sku', 'colour', 'fabric', 'unit'].forEach((k) => { if (typeof p[k] === 'string') next[k] = p[k].trim() })
      if (p.kind) next.kind = p.kind === 'fabric' ? 'fabric' : 'other'
      if (num(p.min) && +p.min >= 0) next.min = +p.min
      if (num(p.cost) && +p.cost >= 0) next.cost = +p.cost
      return { ...add(log(`Stock item ${i.name} details updated`)), inventory: S.inventory.map((x) => (x.id === a.id ? next : x)) }
    }
    case 'stockIn': {
      const i = (S.inventory || []).find((x) => x.id === a.id)
      if (!i || !(+a.qty > 0)) return S
      const note = String(a.note || '').trim()
      return { ...add(log(`Stock in: +${(+a.qty).toFixed(2)} ${i.unit} of ${i.name}${note ? ' (' + note + ')' : ''}`)), inventory: S.inventory.map((x) => (x.id === a.id ? { ...x, qty: +((+x.qty || 0) + +a.qty).toFixed(3), cost: num(a.cost) && +a.cost > 0 ? +a.cost : x.cost } : x)) }
    }
    case 'stockSet': {
      const i = (S.inventory || []).find((x) => x.id === a.id), why = String(a.note || '').trim()
      if (!i || !num(a.qty) || !why) return S
      return { ...add(log(`Stock count of ${i.name} corrected from ${(+i.qty || 0).toFixed(2)} to ${(+a.qty).toFixed(2)} ${i.unit}: ${why}`)), inventory: S.inventory.map((x) => (x.id === a.id ? { ...x, qty: +a.qty } : x)) }
    }
    case 'itemDel': {
      const i = (S.inventory || []).find((x) => x.id === a.id)
      if (!i) return S
      return { ...add(log(`Stock item ${i.name} removed (${(+i.qty || 0).toFixed(2)} ${i.unit} on record)`)), inventory: S.inventory.filter((x) => x.id !== a.id) }
    }
    case 'qcAdd': {
      const o = S.orders.find((x) => x.jc === a.jc)
      const rows = (Array.isArray(a.rows) ? a.rows : []).filter((r) => r && QC_POINTS.includes(r.point) && (r.result === 'Pass' || r.result === 'Fail'))
      if (!o || !rows.length || rows.some((r) => r.result === 'Fail' && !String(r.defect || '').trim())) return S
      let n = (S.qc || []).reduce((t, x) => Math.max(t, parseInt(String(x.id).slice(3), 10) || 0), 0)
      const made = rows.map((r) => ({ id: 'QC-' + String(++n).padStart(4, '0'), date: TODAY, jc: o.jc, point: r.point, result: r.result, qty: Math.max(0, Math.round(+r.qty || 0)), defect: String(r.defect || '').trim(), action: String(r.action || '').trim(), by: S.user }))
      const bad = made.filter((x) => x.result === 'Fail').length
      return { ...add(log(`Quality check: ${made.length - bad} passed, ${bad} failed${bad ? ' (' + made.filter((x) => x.result === 'Fail').map((x) => x.point).join(', ') + ')' : ''}`, o.jc)), qc: [...(S.qc || []), ...made] }
    }
    case 'spayAdd': {
      const who = String(a.who || '').trim(), kind = a.kind === 'Supplier' ? 'Supplier' : 'Tailor', jc = String(a.jc || '').trim()
      if (!who || !(+a.amount > 0) || !a.d || (jc && !S.orders.some((o) => o.jc === jc))) return S
      const id = 'PAY-' + String((S.finance || []).reduce((t, x) => Math.max(t, /^PAY-/.test(String(x.id)) ? parseInt(String(x.id).slice(4), 10) || 0 : 0), 0) + 1).padStart(4, '0')
      const note = String(a.note || '').trim()
      const fin = { id, date: a.d, category: kind + ' payment', desc: `${who}${note ? ': ' + note : ''}`, amount: +(+a.amount).toFixed(2), ref: jc, by: S.user, who }
      return { ...add(log(`${kind} payment ${f2(fin.amount)} to ${who}${jc ? '' : ' (no job card)'}`, jc)), finance: [...(S.finance || []), fin] }
    }
    case 'spayDel': {
      const x = (S.finance || []).find((y) => y.id === a.id && isPayout(y))
      if (!x) return S
      return { ...add(log(`${x.category} of ${f2(x.amount)} to ${x.who || x.desc} removed`, x.ref || '')), finance: S.finance.filter((y) => y.id !== a.id) }
    }
    case 'addOver': return { ...add(log(`Overhead ${a.n} added: ${f2(a.a)} on ${a.d}${a.jc ? ' (direct cost of ' + a.jc + ')' : ' (shared)'}`, a.jc || '')), over: [...S.over, { n: a.n, a: a.a, d: a.d, ...(a.jc ? { jc: a.jc } : {}) }] }
    case 'delOver': { const x = S.over[a.i]; return x ? { ...add(log(`Overhead ${x.n} (${f2(x.a)} on ${x.d}) removed`, x.jc || '')), over: S.over.filter((_, i) => i !== a.i) } : S }
    default: return S
  }
}

export function alerts(S) {
  const out = []
  S.orders.forEach((o) => {
    const c = calc(S, o)
    if (!o.prod && !c.ok && c.net > 0) out.push(`${o.jc}: ${f2(Math.max(0, c.req - c.paid))} still due before production can start`)
    if (c.net > 0 && c.gp < 0) out.push(`${o.jc} is priced below production cost`)
    else if (c.net > 0 && c.gp / c.net < 0.2) out.push(`${o.jc} has a margin of only ${pc(c.gp / c.net)}`)
    if (!o.closed) o.lines.forEach((l) => {
      const u = unit(S, l, c.q)
      if (u.price < u.cost) out.push(`${o.jc}: ${lineLabel(l)} is priced at ${f2(u.price)} but costs ${f2(u.cost)} per piece`)
    })
    if (hasActual(o)) {
      const v = metreVar(S, o)
      if (!v.within) out.push(`${o.jc}: printed ${v.act.toFixed(2)} m against ${v.theo.toFixed(2)} m theoretical (+${v.pct.toFixed(1)}%), above the ${v.tol}% tolerance. Extra cost ${f2(v.cost)}`)
    } else if (o.prod && !o.closed && (o.stages || []).length && o.stages.every(isDone)) {
      out.push(`${o.jc}: all stages done but actual printing metres not recorded`)
    }
  })
  lowStock(S).forEach((i) => out.push(`Low stock: ${i.name} has ${(+i.qty || 0).toFixed(2)} ${i.unit} left (minimum ${(+i.min).toFixed(2)})`))
  S.orders.forEach((o) => {
    if (!o.closed && phase(S, o) === 'Ready for collection' && qcState(S, o.jc).status !== 'Passed') out.push(`${o.jc}: ready for collection but the quality check is ${qcState(S, o.jc).status.toLowerCase()}`)
  })
  return out
}

export function snapshot(S) {
  const m = TODAY.slice(0, 7), ord = S.orders.filter((o) => o.date.startsWith(m)), r2 = (n) => +(+n).toFixed(2)
  const ov = sum(S.over.filter((x) => x.d.startsWith(m)), (x) => x.a), gp = sum(ord, (o) => calc(S, o).gp)
  const ms = metreStats(S, ord), noActual = ord.filter((o) => !hasActual(o)).length
  return {
    period: m, currency: 'BWP', rules: { bulk_threshold_shirts: S.thr, deposit_pct_for_bulk_orders: S.dep, sewing_basis: 'flat rate per shirt', rates: S.R, metre_tolerance_pct: tolPct(S), garment_fabric_multipliers: S.types.filter((t) => !t.mode).map(({ n, m }) => ({ n, m })), product_catalogue: S.types.filter((t) => t.mode) },
    totals: { orders: ord.length, shirts: sum(ord, qty), production_cost: r2(sum(ord, (o) => calc(S, o).cs)), gross_profit: r2(gp), overheads: r2(ov), net_profit: r2(gp - ov),
      revenue_received: r2(sum(S.orders.flatMap((o) => o.pays).filter((p) => p.d.startsWith(m)), (p) => p.amt)) },
    metre_variance: { orders_with_actual: ms.n, theoretical_m: r2(ms.theo), actual_m: r2(ms.act), variance_pct: r2(ms.pct), orders_outside_tolerance: ms.outside, extra_cost: r2(ms.cost), tolerance_that_would_cover_80pct_of_orders: ms.suggested },
    jobs: S.orders.slice(-60).map((o) => { const c = calc(S, o), v = metreVar(S, o); return { job: o.jc, customer: o.ent, date: o.date, shirts: c.q, net_total: r2(c.net), production_cost: r2(c.cs), margin_pct: c.net ? +((c.gp / c.net) * 100).toFixed(1) : null, balance: r2(c.bal), payment_requirement_met: c.ok, theoretical_metres: r2(v.theo), actual_metres: v.act === null ? null : r2(v.act), metre_variance_pct: v.act === null ? null : r2(v.pct) } }),
    sizes: S.sizes.map((z) => { const c = cost(S, z), a = S.T[z.c]; return { size: z.n, cost_per_shirt: r2(c), cost_per_shirt_with_tolerance: r2(costTol(S, z)), price_under_threshold: a[0], price_at_or_above_threshold: a[1], margin_bulk_pct: +(((a[1] - c) / a[1]) * 100).toFixed(1), height_is_estimate: !!z.e } }),
    missing_data: [...(ov ? [] : ['No overheads recorded for the period']), ...(noActual ? [`Actual printing metres not recorded for ${noActual} order(s) this period`] : []), 'No production capacity or machine hours recorded', ...(S.sizes.some((z) => z.e) ? ['Pattern heights for some sizes are estimates'] : [])],
  }
}
