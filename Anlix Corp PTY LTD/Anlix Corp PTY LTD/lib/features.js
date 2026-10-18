// Logic for customers, WhatsApp messages, payment reminders, tailor and supplier statistics, and reports.
// Everything here only reads the saved data. Nothing here changes it.
import { TODAY, ONE, f2, sum, qty, calc, unit, lineH, lineRates, costParts, overheadByJob, overdue, phase, isPayout } from './model'

// ---------- WhatsApp ----------
// Botswana numbers: 8 digits (7x xxx xxx), or 267 first, or 0 first. Other countries are used as typed.
export function waPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('267') && d.length >= 11) return d
  if (d.startsWith('0')) d = d.slice(1)
  return d.length <= 8 ? '267' + d : d
}
// With no phone on the order the link still opens WhatsApp, so the person can pick the contact.
export const waLink = (phone, text) => `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`
const greet = (o) => `Hello ${String(o.placed || o.ent || '').trim().split(' ')[0] || 'there'}`
export function waText(S, o, kind) {
  const c = calc(S, o), n = qty(o)
  if (kind === 'quotation') return `${greet(o)}, here is quotation ${o.qt} (job card ${o.jc}) for ${o.ent}: ${n} item${n === 1 ? '' : 's'}, total ${f2(c.net)}. ${c.q < S.thr ? 'Full payment' : S.dep + '% deposit'} of ${f2(c.req)} is needed before production starts. Thank you, Anlix Corp.`
  if (kind === 'invoice') return `${greet(o)}, invoice ${o.inv} for job card ${o.jc}: total ${f2(c.net)}, paid ${f2(c.paid)}, balance ${f2(Math.max(0, c.bal))}. Thank you, Anlix Corp.`
  if (kind === 'ready') return `${greet(o)}, your order ${o.jc} (${n} item${n === 1 ? '' : 's'}) is ready for collection.${c.bal > 0.005 ? ` The balance of ${f2(c.bal)} is due on collection.` : ' It is fully paid.'} Thank you, Anlix Corp.`
  return `${greet(o)}, a friendly reminder: ${f2(Math.max(0, c.bal))} is still due on order ${o.jc}${o.dueDate ? ' (due ' + o.dueDate + ')' : ''}. Please let us know when payment is made. Thank you, Anlix Corp.`
}

// ---------- Customers ----------
// Orders belong to the same customer when they share a company name or a phone number. Walk-ins entered as "Individual" are told apart by person and phone.
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const GENERIC = new Set(['', 'individual', 'private', 'personal', 'walk-in', 'walk in', 'walkin', 'n/a', 'na', 'none', '-'])
export function customerGroups(S) {
  const parent = S.orders.map((_, i) => i), find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const seen = new Map()
  S.orders.forEach((o, i) => {
    const ent = norm(o.ent), ph = String(o.phone || '').replace(/\D/g, '')
    const keys = []
    if (!GENERIC.has(ent)) keys.push('e:' + ent) // a company is its name: one person can order for several companies, so a shared phone does not join them
    else { // walk-in: the same person, or the same phone
      keys.push('n:' + norm(o.placed || o.jc))
      if (ph.length >= 7) keys.push('p:' + ph.slice(-8))
    }
    keys.forEach((k) => { if (seen.has(k)) parent[find(i)] = find(seen.get(k)); else seen.set(k, i) })
  })
  const g = new Map()
  S.orders.forEach((o, i) => { const r = find(i); g.set(r, [...(g.get(r) || []), o]) })
  return [...g.values()]
}
export function customers(S) {
  return customerGroups(S).map((orders) => {
    const sorted = orders.slice().sort((a, b) => b.date.localeCompare(a.date) || b.jc.localeCompare(a.jc)), cs = sorted.map((o) => calc(S, o)), latest = sorted[0]
    const spell = new Map(); sorted.filter((o) => !GENERIC.has(norm(o.ent))).forEach((o) => spell.set(o.ent.trim(), (spell.get(o.ent.trim()) || 0) + 1))
    const named = [...spell.entries()].sort((a, b) => b[1] - a[1])[0], phone = (sorted.find((o) => String(o.phone || '').replace(/\D/g, '').length >= 7) || {}).phone || ''
    return { key: sorted.map((o) => o.jc).sort()[0], name: (named ? named[0] : latest.placed || latest.ent || latest.jc), contacts: [...new Set(sorted.map((o) => o.placed).filter(Boolean))], phone,
      orders: sorted, shirts: sum(cs, (c) => c.q), billed: sum(cs, (c) => c.net), paid: sum(cs, (c) => c.paid), bal: sum(cs, (c) => c.bal), gp: sum(cs, (c) => c.gp), last: latest.date }
  }).sort((a, b) => b.last.localeCompare(a.last))
}

// ---------- Payment reminders ----------
// Orders with money owed that are past their due date, or are ready for collection.
export function reminders(S) {
  return S.orders.map((o) => ({ o, c: calc(S, o) }))
    .filter(({ o, c }) => !o.closed && c.bal > 0.005 && (overdue(o) || phase(S, o) === 'Ready for collection'))
    .map(({ o, c }) => ({ o, bal: c.bal, late: overdue(o), days: overdue(o) ? Math.max(1, Math.round((new Date(TODAY) - new Date(o.dueDate)) / 86400000)) : 0, ready: phase(S, o) === 'Ready for collection' }))
    .sort((a, b) => b.days - a.days || b.bal - a.bal)
}

// ---------- Tailors and suppliers ----------
// For each person paid: what was paid, on how many job cards, and what it works out to per shirt (tailors) or per metre (fabric suppliers), against the estimate in the costing.
export function payeeStats(S) {
  const m = new Map()
  ;(S.finance || []).filter(isPayout).forEach((x) => {
    const who = String(x.who || x.desc.split(':')[0]).trim(), kind = x.category === 'Supplier payment' ? 'Supplier' : 'Tailor', k = kind + '|' + who.toLowerCase()
    const g = m.get(k) || { who, kind, paid: 0, jobs: new Set(), pays: [] }
    g.paid += +x.amount || 0; g.pays.push(x); if (x.ref) g.jobs.add(x.ref)
    m.set(k, g)
  })
  return [...m.values()].map((g) => {
    let units = 0, est = 0
    ;[...g.jobs].forEach((jc) => {
      const o = S.orders.find((x) => x.jc === jc)
      if (!o) return
      const field = g.kind === 'Tailor' ? 'tailor' : 'shop'
      const mine = o.lines.filter((l) => String(l[field] || '').trim().toLowerCase() === g.who.toLowerCase()), use = mine.length ? mine : o.lines
      use.forEach((l) => {
        const q = +l.q || 0, r = lineRates(S, l)
        if (g.kind === 'Tailor') { units += q; est += q * r.sew } else { const mt = (q * lineH(S, l)) / 1000; units += mt; est += mt * r.fabric }
      })
    })
    return { ...g, jobs: [...g.jobs], units, est, per: units ? g.paid / units : 0, estPer: units ? est / units : 0 }
  }).sort((a, b) => b.paid - a.paid)
}
// Names already used on order lines, to suggest when recording a payment.
export const knownPayees = (S) => {
  const t = new Set(), s = new Set()
  S.orders.forEach((o) => o.lines.forEach((l) => { if (String(l.tailor || '').trim()) t.add(String(l.tailor).trim()); if (String(l.shop || '').trim()) s.add(String(l.shop).trim()) }))
  ;(S.finance || []).filter(isPayout).forEach((x) => { const w = String(x.who || '').trim(); if (w) (x.category === 'Supplier payment' ? s : t).add(w) })
  return { tailors: [...t].sort(), shops: [...s].sort() }
}

// ---------- Reports ----------
const inMonth = (d, m) => String(d || '').startsWith(m)
export function reportMonths(S) {
  return [...new Set([TODAY.slice(0, 7), ...S.orders.map((o) => o.date.slice(0, 7)), ...S.over.map((x) => x.d.slice(0, 7)), ...(S.finance || []).map((x) => String(x.date || '').slice(0, 7)).filter(Boolean)])].sort().reverse()
}
// Profit and loss for one month: orders placed in that month, and overheads dated in that month.
export function monthPL(S, m) {
  const ord = S.orders.filter((o) => inMonth(o.date, m)), cm = costParts(S, ord)
  const sales = sum(ord, (o) => calc(S, o).net), shirts = sum(ord, qty), prodCost = sum(ord, (o) => calc(S, o).cs)
  const gp = sales - prodCost, wastage = cm.comp[4], other = cm.comp[5], oh = sum(S.over.filter((x) => inMonth(x.d, m)), (x) => +x.a || 0)
  const net = gp - wastage - other - oh, gpShirt = shirts ? gp / shirts : 0
  const received = sum(S.orders.flatMap((o) => o.pays).filter((p) => inMonth(p.d, m)), (p) => p.amt)
  const payouts = sum((S.finance || []).filter((x) => isPayout(x) && inMonth(x.date, m)), (x) => +x.amount || 0)
  return { m, orders: ord.length, shirts, sales, prodCost, comp: cm.comp.slice(0, 4), gp, wastage, other, oh, net, gpShirt, received, payouts, billedUnpaid: sum(ord, (o) => Math.max(0, calc(S, o).bal)),
    breakEven: gpShirt > 0 ? Math.ceil(oh / gpShirt) : null }
}
// Profit by customer, over a month (or all time when m is null). Overhead is each job's direct overhead plus its share of shared costs.
export function customerProfit(S, m) {
  const oh = overheadByJob(S), keep = (o) => !m || inMonth(o.date, m)
  return customers(S).map((c) => {
    const ord = c.orders.filter(keep)
    if (!ord.length) return null
    const cc = ord.map((o) => calc(S, o)), ohs = sum(ord, (o) => (oh.by.get(o.jc) || { total: 0 }).total), sales = sum(cc, (x) => x.net), gp = sum(cc, (x) => x.gp)
    return { name: c.name, orders: ord.length, shirts: sum(cc, (x) => x.q), sales, gp, oh: ohs, profit: gp - ohs, margin: sales ? (gp - ohs) / sales : 0 }
  }).filter(Boolean).sort((a, b) => b.profit - a.profit)
}
// Profit by size (or product, for fixed-size products). Discounts are spread over the lines in proportion to their value.
export function sizeProfit(S, m) {
  const g = new Map()
  S.orders.filter((o) => !m || inMonth(o.date, m)).forEach((o) => {
    const c = calc(S, o), k = c.sub > 0 ? c.net / c.sub : 1
    o.lines.forEach((l) => {
      const q = +l.q || 0, u = unit(S, l, c.q), name = l.s === ONE ? l.type || 'Fixed-size product' : l.s
      const x = g.get(name) || { name, shirts: 0, sales: 0, cost: 0 }
      x.shirts += q; x.sales += q * u.price * k; x.cost += q * u.cost
      g.set(name, x)
    })
  })
  return [...g.values()].map((x) => ({ ...x, profit: x.sales - x.cost, margin: x.sales ? (x.sales - x.cost) / x.sales : 0 })).sort((a, b) => b.profit - a.profit)
}
