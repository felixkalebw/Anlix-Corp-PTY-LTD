export const TODAY = new Date().toISOString().slice(0, 10)
export const f2 = (n) => 'P' + (+n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const f0 = (n) => 'P' + Math.round(+n || 0).toLocaleString('en')
export const pc = (n) => ((+n || 0) * 100).toFixed(1) + '%'
export const fd = (d) => new Date(d + 'T00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
export const sum = (a, f) => a.reduce((t, x) => t + f(x), 0)
export const COST_N = ['Fabric', 'Printing', 'Pressing', 'Sewing', 'Wastage and rework', 'Other direct costs']

export const initial = () => ({
  user: 'Staff 1',
  R: { print: 50, fabric: 18, press: 10, sew: 25 }, // print, fabric, press per metre; sew per shirt
  T: { adult: [200, 180], kids: [150, 130] },
  thr: 10, dep: 50, seq: 0, over: [], orders: [], audit: [], finance: [],
  sizes: [
    ...[['2–4 yrs', 490], ['5–6 yrs', 550], ['7–8 yrs', 590], ['9–10 yrs', 610], ['11–12 yrs', 640], ['13–14 yrs', 679]].map(([n, h]) => ({ n, c: 'kids', h })),
    { n: 'XS', c: 'adult', h: 724 }, { n: 'S', c: 'adult', h: 740, e: 1 }, { n: 'M', c: 'adult', h: 780, e: 1 },
    { n: 'L', c: 'adult', h: 920, e: 1 }, { n: 'XL', c: 'adult', h: 1210, e: 1 },
    { n: '2XL', c: 'adult', h: 1243.37 }, { n: '3XL', c: 'adult', h: 1273.94 }, { n: '4XL', c: 'adult', h: 1290.53 },
  ],
})

export const sz = (S, n) => S.sizes.find((z) => z.n === n)
export const cost = (S, z) => (z.h / 1000) * (S.R.print + S.R.fabric + S.R.press) + S.R.sew
export const price = (S, z, q) => S.T[z.c][q >= S.thr ? 1 : 0]
export const qty = (o) => o.lines.reduce((a, l) => a + l.q, 0)
const num = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(+v)
export const unit = (S, l, q) => ({
  price: num(l.unitPrice) ? +l.unitPrice : price(S, sz(S, l.s), q),
  cost: num(l.unitCost) ? +l.unitCost : cost(S, sz(S, l.s)),
})

export function calc(S, o) {
  const q = qty(o)
  let sub = 0, cs = 0
  o.lines.forEach((l) => { const u = unit(S, l, q); sub += l.q * u.price; cs += l.q * u.cost })
  const d = Math.min(sub, o.dt === '%' ? (sub * (+o.dv || 0)) / 100 : +o.dv || 0)
  const net = sub - d, req = q < S.thr ? net : (net * S.dep) / 100, paid = o.pays.reduce((a, p) => a + p.amt, 0)
  return { q, sub, cs, d, net, req, paid, bal: net - paid, ok: net > 0 && paid >= req - 0.005, gp: net - cs }
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
export const reworksOf = (o) => (o.stages || []).filter((s) => s.rw)
export const reworkCost = (o) => reworksOf(o).reduce((t, s) => t + (+(s.rw.act ?? s.rw.est) || 0), 0)
export const stageBlocked = (o, i) => (o.stages || []).slice(0, i).some((s) => !isDone(s))
// Next free job card number. Skips any number already used, so two staff can never end up with the same job card.
export const nextSeq = (S) => { let n = S.seq + 1; while (S.orders.some((o) => o.jc === `JC-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`)) n++; return n }
export const jobNo = (S) => `JC-${TODAY.slice(0, 4)}-${String(nextSeq(S)).padStart(4, '0')}`
const now = () => new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// Fabric needed and production cost for a set of order lines, grouped by colour and fabric.
// Fabric length = pattern height x quantity. Uses the same rates as cost(), so the total matches the order's production cost.
export function materialPlan(S, lines) {
  const groups = new Map()
  let shirts = 0, metres = 0
  lines.forEach((l) => {
    const z = sz(S, l.s), q = +l.q || 0
    if (!z || q <= 0) return
    const colour = (l.colour || '').trim() || 'Colour not given', fabric = (l.fabric || '').trim()
    const key = colour.toLowerCase() + '|' + fabric.toLowerCase()
    const g = groups.get(key) || { colour, fabric, shirts: 0, metres: 0, by: {} }
    const m = (q * z.h) / 1000
    g.shirts += q; g.metres += m; g.by[z.n] = (g.by[z.n] || 0) + q
    groups.set(key, g)
    shirts += q; metres += m
  })
  const rows = [...groups.values()].map((g) => ({
    ...g,
    sizeText: S.sizes.filter((z) => g.by[z.n]).map((z) => `${g.by[z.n]} × ${z.n}`).join(', '),
    fabricCost: g.metres * S.R.fabric,
    cost: g.metres * (S.R.fabric + S.R.print + S.R.press) + g.shirts * S.R.sew,
  })).sort((a, b) => a.colour.localeCompare(b.colour) || a.fabric.localeCompare(b.fabric))
  const parts = { fabric: metres * S.R.fabric, print: metres * S.R.print, press: metres * S.R.press, sew: shirts * S.R.sew }
  const total = parts.fabric + parts.print + parts.press + parts.sew
  return { rows, shirts, metres, parts, total, avg: shirts ? total / shirts : 0 }
}

export function costParts(S, ord) {
  const jobs = ord.map((o) => {
    let m = 0, sh = 0
    o.lines.forEach((l) => { m += (l.q * sz(S, l.s).h) / 1000; sh += l.q })
    const jx = (S.finance || []).filter((x) => x.ref === o.jc), w = (x) => x.category === 'Wastage and rework'
    return { o, sh, v: [m * S.R.fabric, m * S.R.print, m * S.R.press, sh * S.R.sew, sum(jx.filter(w), (x) => x.amount), sum(jx.filter((x) => !w(x)), (x) => x.amount)] }
  })
  return { jobs, comp: COST_N.map((_, i) => sum(jobs, (j) => j.v[i])) }
}

export function reduce(S, a) {
  const log = (t, o = '', u = S.user) => ({ ts: now(), u, o, t })
  const add = (...e) => ({ ...S, audit: [...e.reverse(), ...S.audit] })
  switch (a.type) {
    case 'load': return { ...initial(), ...a.state }
    case 'user': return { ...S, user: a.user }
    case 'register': {
      const n = nextSeq(S), p = String(n).padStart(4, '0'), y = TODAY.slice(0, 4)
      const by = String(a.d.by || '').trim() // the staff member taking the order is required
      const ok = (a.lines || []).filter((l) => sz(S, l.s) && l.q > 0)
      if (!by || !ok.length) return S
      const q = ok.reduce((t, l) => t + l.q, 0)
      const lines = ok.map((l) => { const z = sz(S, l.s); return { s: l.s, q: l.q, colour: (l.colour || '').trim(), fabric: (l.fabric || '').trim(), desc: (l.desc || '').trim(), unitPrice: num(l.unitPrice) ? +l.unitPrice : price(S, z, q), unitCost: cost(S, z) } })
      const o = { jc: `JC-${y}-${p}`, qt: `QT-${y}-${p}`, inv: `INV-${y}-${p}`, date: TODAY, by, placed: a.d.placed.trim(), ent: a.d.ent.trim(), lines,
        dt: a.d.dt, dv: +a.d.dv || 0, dr: a.d.dr, pays: [], prod: false, prodStatus: 'Awaiting production', priority: 'Normal', dueDate: a.d.dueDate || '', phone: (a.d.phone || '').trim(), stages: mkStages(), createdAt: new Date().toISOString() }
      const e = [log(`Job card ${o.jc} created by ${by}, linked to ${o.qt} and ${o.inv}`, o.jc, by)]
      if (o.dv > 0) e.push(log(`Discount ${o.dt === '%' ? o.dv + '%' : f2(o.dv)} applied: ${o.dr}`, o.jc, by))
      return { ...add(...e), seq: n, orders: [...S.orders, o] }
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
      return { ...add(log('Moved to production', a.jc)), orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, prod: true, stages: x.stages && x.stages.length ? x.stages : mkStages(), prodStatus: STAGES[0] } : x)) }
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
      const rw = { id, from: src.k, what, happened, who, whoType: a.whoType, fault, remake: !!a.remake, items, qty: items.length ? sum(items, (x) => x.q) : Math.max(0, parseInt(a.qty) || 0), mat, lab, oth, est, raisedBy: S.user, raisedAt: t, found: a.fail ? 'Quality inspection' : src.k }
      // a failed inspection sends the job back before the inspection point; other rework sits straight after the stage it came from
      st.splice(a.fail ? i : i + 1, 0, { k: `Rework ${n}: ${src.k}`, st: 'active', start: t, by: S.user, rw })
      const fin = { id, date: TODAY, category: 'Wastage and rework', desc: `${src.k}: ${what} (responsible: ${who}, ${a.whoType})`, amount: est, ref: o.jc, by: S.user }
      const next = st.find((x) => !isDone(x))
      return { ...add(log(`Rework ${id} raised at "${src.k}": ${what}. What happened: ${happened}. Responsible: ${who} (${a.whoType}). Estimated cost ${f2(est)}${a.fail ? '. Inspection failed' : ''}`, a.jc)),
        finance: [...(S.finance || []), fin], orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, stages: st, prodStatus: next ? next.k : 'Packed' } : x)) }
    }
    case 'reworkDone': {
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || !o.prod || o.closed) return S
      const t = new Date().toISOString(), st = (o.stages || []).map((s) => ({ ...s }))
      const s = st.find((x) => x.k === a.k)
      if (!s || !s.rw || s.st !== 'active') return S
      const act = +a.actual, who = (a.approver || S.user || '').trim() || S.user, note = (a.note || '').trim()
      if (!Number.isFinite(act) || act < 0) return S
      s.rw = { ...s.rw, act: +act.toFixed(2), doneAt: t, fix: note }
      s.st = 'done'; s.end = t; s.by = S.user; s.appr = { by: who, at: t, note }
      const diff = act - s.rw.est, next = st.find((x) => !isDone(x))
      const finance = (S.finance || []).map((x) => (x.id === s.rw.id && x.ref === o.jc ? { ...x, amount: +act.toFixed(2) } : x))
      return { ...add(log(`Rework ${s.rw.id} completed and approved by ${who}. Actual cost ${f2(act)}${diff ? ` (estimate was ${f2(s.rw.est)})` : ''}${note ? '. ' + note : ''}`, a.jc)),
        finance, orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, stages: st, prodStatus: next ? next.k : 'Packed' } : x)) }
    }
    case 'close': {
      const o = S.orders.find((x) => x.jc === a.jc)
      if (!o || o.closed || !(o.stages || []).length || !o.stages.every(isDone)) return S
      const c = calc(S, o)
      if (c.bal > 0.005) return S
      const extra = sum((S.finance || []).filter((x) => x.ref === o.jc), (x) => x.amount)
      const closed = { at: new Date().toISOString(), revenue: c.net, cost: c.cs + extra, profit: c.net - c.cs - extra }
      return { ...add(log(`Order closed. Actual profit ${f2(closed.profit)}`, a.jc)), orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, closed, prodStatus: 'Completed' } : x)) }
    }
    case 'rate': return { ...add(log(`Rate ${a.k} changed to ${a.v}`)), R: { ...S.R, [a.k]: a.v } }
    case 'tier': return { ...add(log(`${a.c} price tier ${a.j} changed to ${a.v}`)), T: { ...S.T, [a.c]: S.T[a.c].map((x, i) => (i === a.j ? a.v : x)) } }
    case 'setting': return { ...add(log(`Setting ${a.k} changed to ${a.v}`)), [a.k]: a.v }
    case 'height': return { ...add(log(`Pattern height of ${S.sizes[a.i].n} changed to ${a.v} mm`)), sizes: S.sizes.map((z, i) => (i === a.i ? { ...z, h: a.v, e: 0 } : z)) }
    case 'addSize': return S.sizes.some((z) => z.n === a.size.n) ? S : { ...add(log(`Size ${a.size.n} added, pattern height ${a.size.h} mm`)), sizes: [...S.sizes, a.size] }
    case 'addOver': return { ...add(log(`Overhead ${a.n} added: ${f2(a.a)} on ${a.d}`)), over: [...S.over, { n: a.n, a: a.a, d: a.d }] }
    case 'delOver': { const x = S.over[a.i]; return x ? { ...add(log(`Overhead ${x.n} (${f2(x.a)} on ${x.d}) removed`)), over: S.over.filter((_, i) => i !== a.i) } : S }
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
  })
  return out
}

export function snapshot(S) {
  const m = TODAY.slice(0, 7), ord = S.orders.filter((o) => o.date.startsWith(m)), r2 = (n) => +(+n).toFixed(2)
  const ov = sum(S.over.filter((x) => x.d.startsWith(m)), (x) => x.a), gp = sum(ord, (o) => calc(S, o).gp)
  return {
    period: m, currency: 'BWP', rules: { bulk_threshold_shirts: S.thr, deposit_pct_for_bulk_orders: S.dep, sewing_basis: 'flat rate per shirt', rates: S.R },
    totals: { orders: ord.length, shirts: sum(ord, qty), production_cost: r2(sum(ord, (o) => calc(S, o).cs)), gross_profit: r2(gp), overheads: r2(ov), net_profit: r2(gp - ov),
      revenue_received: r2(sum(S.orders.flatMap((o) => o.pays).filter((p) => p.d.startsWith(m)), (p) => p.amt)) },
    jobs: S.orders.slice(-60).map((o) => { const c = calc(S, o); return { job: o.jc, customer: o.ent, date: o.date, shirts: c.q, net_total: r2(c.net), production_cost: r2(c.cs), margin_pct: c.net ? +((c.gp / c.net) * 100).toFixed(1) : null, balance: r2(c.bal), payment_requirement_met: c.ok } }),
    sizes: S.sizes.map((z) => { const c = cost(S, z), a = S.T[z.c]; return { size: z.n, cost_per_shirt: r2(c), price_under_threshold: a[0], price_at_or_above_threshold: a[1], margin_bulk_pct: +(((a[1] - c) / a[1]) * 100).toFixed(1), height_is_estimate: !!z.e } }),
    missing_data: [...(ov ? [] : ['No overheads recorded for the period']), 'No production capacity or machine hours recorded', ...(S.sizes.some((z) => z.e) ? ['Pattern heights for some sizes are estimates'] : [])],
  }
}
