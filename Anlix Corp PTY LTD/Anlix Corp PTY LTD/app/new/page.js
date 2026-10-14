'use client'
import { useParams, useRouter } from 'next/navigation'
import { useApp } from '@/components/Store'
import { DocumentSheet, orderToDoc } from '@/components/DocumentSheet'

// /print/quotation/JC-2026-0001  or  /print/invoice/JC-2026-0001
export default function PrintPage() {
  const { kind, jc } = useParams()
  const router = useRouter()
  const app = useApp()
  const S = app.S || app.state // name of the state object returned by useApp in Store.js
  if (!S) return <div className="card"><p>Could not read the order data. Check the state name returned by useApp in Store.js.</p></div>
  const o = S.orders.find((x) => x.jc === decodeURIComponent(jc))
  if (!o) return <div className="card"><h1>Order not found</h1></div>
  const { row, lines } = orderToDoc(S, o)
  return <DocumentSheet kind={kind === 'invoice' ? 'invoice' : 'quotation'} row={row} lines={lines} onClose={() => router.back()} />
}
