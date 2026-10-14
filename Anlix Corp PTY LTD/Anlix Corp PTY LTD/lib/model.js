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
export const jobNo = (S) => `JC-${TODAY.slice(0, 4)}-${String(S.seq + 1).padStart(4, '0')}`
const now = () => new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

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
      const n = S.seq + 1, p = String(n).padStart(4, '0'), y = TODAY.slice(0, 4), q = a.lines.reduce((t, l) => t + l.q, 0)
      const lines = a.lines.map((l) => { const z = sz(S, l.s); return { ...l, unitPrice: price(S, z, q), unitCost: cost(S, z) } })
      const o = { jc: `JC-${y}-${p}`, qt: `QT-${y}-${p}`, inv: `INV-${y}-${p}`, date: TODAY, by: a.d.by, placed: a.d.placed.trim(), ent: a.d.ent.trim(), lines,
        dt: a.d.dt, dv: +a.d.dv || 0, dr: a.d.dr, pays: [], prod: false, prodStatus: 'Awaiting production', priority: 'Normal', dueDate: a.d.dueDate || '', phone: (a.d.phone || '').trim(), stages: mkStages(), createdAt: new Date().toISOString() }
      const e = [log(`Job card ${o.jc} created, linked to ${o.qt} and ${o.inv}`, o.jc, a.d.by)]
      if (o.dv > 0) e.push(log(`Discount ${o.dt === '%' ? o.dv + '%' : f2(o.dv)} applied: ${o.dr}`, o.jc, a.d.by))
      return { ...add(...e), seq: n, user: a.d.by, orders: [...S.orders, o] }
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
      if (!o || !o.prod) return S
      const t = new Date().toISOString(), st = (o.stages && o.stages.length ? o.stages : mkStages()).map((s) => ({ ...s }))
      const i = st.findIndex((s) => s.k === a.k)
      if (i < 0) return S
      const s = st[i], words = { start: 'started', done: 'completed', skip: 'skipped', pass: 'passed inspection', fail: 'failed inspection' }
      if (a.op === 'start') { s.st = 'active'; s.start = t; s.by = S.user }
      else if (a.op === 'skip') { s.st = 'skipped'; s.end = t; s.by = S.user }
      else if (a.op === 'done' || a.op === 'pass') { s.st = 'done'; s.end = t; s.by = S.user; s.start = s.start || t; if (a.op === 'pass') s.result = 'Pass' }
      else if (a.op === 'fail') {
        s.st = 'pending'; s.result = 'Fail'; s.fails = (s.fails || 0) + 1; s.by = S.user
        const n = st.filter((x) => /^Rework/.test(x.k)).length + 1
        st.splice(i + 1, 0, { k: 'Rework and reinspection' + (n > 1 ? ' ' + n : ''), st: 'active', start: t, by: S.user })
      }
      const next = st.find((x) => !isDone(x))
      return { ...add(log(`Stage "${a.k}" ${words[a.op]}`, a.jc)), orders: S.orders.map((x) => (x.jc === a.jc ? { ...x, stages: st, prodStatus: next ? next.k : 'Packed' } : x)) }
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
