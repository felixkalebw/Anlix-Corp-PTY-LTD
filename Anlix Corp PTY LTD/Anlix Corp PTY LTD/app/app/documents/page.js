'use client'
import { calc, unit, sz } from '@/lib/model'

// Your details, printed on every quotation and invoice.
export const COMPANY = { name: 'Anlix Corp (Pty) Ltd', lines: ['Tlokweng, Gaborone, Botswana', 'Tel: 76 675 006', 'Email: anlixbw@gmail.com'] }
export const FOOTER = 'Anlix Corp (Pty) Ltd  |  anlixbw@gmail.com  |  76 675 006'
export const BANK = [] // optional payment lines, e.g. ['Bank: FNB', 'Account no: 123456']. Empty = not printed.
export const ITEM_NAME = 'T-shirt' // printed after Adult / Kids on lines made from tracker orders
// Put your logo at public/logo.png and your round stamp at public/stamp.png. They print when present.

export const money = (n) => 'P' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

// Turns an order from the tracker (job card, sizes, quantities, payments) into the shape the sheet prints.
export function orderToDoc(S, o) {
  const c = calc(S, o)
  const lines = o.lines.map((l, i) => {
    const z = sz(S, l.s), u = unit(S, l, c.q)
    return { id: i, size: l.s, quality: '', description: `${z && z.c === 'kids' ? 'Kids' : 'Adult'} ${ITEM_NAME}`, qty: l.q, unit_price: u.price, line_total: l.q * u.price }
  })
  const row = {
    id: o.jc, quote_no: o.qt, invoice_no: o.inv, job_card: o.jc, issued_on: o.date, status: 'issued',
    client_name: o.placed || o.ent, client_address: o.placed ? o.ent : '', client_contact: '', client_email: '',
    subtotal: c.sub, discount: c.d, vat_pct: 0, vat_amount: 0, total: c.net, amount_paid: c.paid,
    paid_on: o.pays.length ? o.pays[o.pays.length - 1].d : null, notes: c.d > 0 && o.dr ? `Discount: ${o.dr}` : '',
  }
  return { row, lines }
}

const hideIfMissing = (e) => { e.currentTarget.style.display = 'none' }
const R = ({ l, v, bold, top }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontWeight: bold ? 700 : 400, borderTop: top ? '1px solid #000' : 'none', marginTop: top ? 4 : 0 }}>
    <span>{l}</span><span>{v}</span>
  </div>
)

export function DocumentSheet({ kind, row, lines, onClose }) {
  const isInv = kind === 'invoice'
  const no = isInv ? row.invoice_no : row.quote_no
  const paid = +row.amount_paid || 0
  const balance = (+row.total || 0) - paid
  const hasSize = lines.some((l) => l.size), hasQ = lines.some((l) => l.quality)
  const status = !isInv ? '' : row.status === 'void' ? 'VOID' : row.status === 'draft' ? 'DRAFT'
    : balance <= 0.005 && row.total > 0 ? 'PAID' : paid > 0 ? 'BALANCE DUE' : 'UNPAID'
  const cols = ['Description', ...(hasSize ? ['Size'] : []), ...(hasQ ? ['Quality'] : []), 'Qty', 'Unit Price', 'Amount']
  const cells = (l) => [l.description, ...(hasSize ? [l.size] : []), ...(hasQ ? [l.quality] : []), l.qty, money(l.unit_price), money(l.line_total)]
  const right = (i) => i >= cols.length - 3
  const th = (i) => ({ padding: '9px 10px', background: '#000', color: '#fff', textAlign: right(i) ? 'right' : 'left', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' })
  const td = (i) => ({ padding: '10px', textAlign: right(i) ? 'right' : 'left', borderBottom: '1px solid #333' })
  const meta = (label, value, bold) => value ? (
    <div key={label}><b style={{ display: 'inline-block', width: 92 }}>{label}:</b><span style={bold ? { fontWeight: 700 } : null}>{value}</span></div>
  ) : null

  return (
    <div className="doc-modal">
      <style>{`
        .doc-modal{position:fixed;inset:0;background:#0008;z-index:9998;overflow:auto;padding:16px}
        .doc-sheet{background:#fff;color:#111;max-width:800px;margin:0 auto;padding:32px;font-family:system-ui,sans-serif}
        @media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body *{visibility:hidden}#print-area,#print-area *{visibility:visible}#print-area{position:absolute;left:0;top:0;width:100%}.no-print{display:none}}
      `}</style>
      <div className="no-print" style={{ maxWidth: 800, margin: '0 auto 10px', display: 'flex', gap: 8 }}>
        <button className="ax-btn" onClick={() => window.print()}>Print / Save as PDF</button>
        <button className="ax-btn alt" onClick={onClose}>Close</button>
      </div>
      <div id="print-area" className="doc-sheet" style={{ minHeight: 1000, position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <img src="/logo.png" alt="" style={{ height: 80 }} onError={hideIfMissing} />
          <div style={{ fontSize: 40, fontWeight: 800 }}>{isInv ? 'INVOICE' : 'QUOTATION'}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginTop: 22, fontSize: 14, lineHeight: 1.6 }}>
          <div><b>{COMPANY.name}</b>{COMPANY.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
          <div>
            {meta(isInv ? 'Invoice No' : 'Quotation No', no)}
            {meta('Date', fmtDate(row.issued_on))}
            {isInv && paid > 0 && meta(balance <= 0.005 ? 'Paid' : 'Part Paid', fmtDate(row.paid_on))}
            {meta(isInv ? 'Due' : 'Valid until', fmtDate(isInv ? row.due_on : row.valid_until))}
            {meta('Job Card', row.job_card)}
            {isInv && meta('Status', status, true)}
          </div>
        </div>

        <div style={{ marginTop: 28, fontSize: 12, fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: 6 }}>BILLED TO</div>
        <div style={{ margin: '12px 0 26px', fontSize: 14, lineHeight: 1.6 }}>
          <b>{row.client_name}</b>
          {[row.client_contact, row.client_email, row.client_address].filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr>{cols.map((c, i) => <th key={c} style={th(i)}>{c}</th>)}</tr></thead>
          <tbody>{lines.map((l) => <tr key={l.id}>{cells(l).map((c, i) => <td key={i} style={td(i)}>{c}</td>)}</tr>)}</tbody>
        </table>

        <div style={{ marginLeft: 'auto', width: 280, marginTop: 16, fontSize: 14 }}>
          <R l="Subtotal" v={money(row.subtotal)} />
          {+row.discount > 0 && <R l="Discount" v={'-' + money(row.discount)} />}
          {+row.vat_pct > 0 && <R l={`VAT (${row.vat_pct}%)`} v={money(row.vat_amount)} />}
          {isInv && paid > 0 && <R l="Amount Paid" v={'-' + money(paid)} />}
          <R l={isInv ? 'Balance Due' : 'Total'} v={money(isInv ? balance : row.total)} bold top />
        </div>

        <div style={{ marginTop: 50, fontSize: 14, lineHeight: 1.7 }}>
          {isInv && paid > 0 && <div>Part payment of {money(paid)} received{row.paid_on ? ` on ${fmtDate(row.paid_on)}` : ''}.</div>}
          {isInv && paid > 0 && balance > 0.005 && <div><b>Remaining balance of {money(balance)} is still outstanding.</b></div>}
          {row.notes && <div>{row.notes}</div>}
          {BANK.length > 0 && isInv && <div style={{ marginTop: 10 }}>{BANK.map((l, i) => <div key={i}>{l}</div>)}</div>}
          <div>Thank you for your business.</div>
        </div>
        <img src="/stamp.png" alt="" style={{ height: 150, position: 'absolute', right: 60, bottom: 110 }} onError={hideIfMissing} />
        <div style={{ position: 'absolute', left: 32, right: 32, bottom: 24, borderTop: '1px solid #000', paddingTop: 8, textAlign: 'center', fontSize: 11 }}>{FOOTER}</div>
      </div>
    </div>
  )
}
