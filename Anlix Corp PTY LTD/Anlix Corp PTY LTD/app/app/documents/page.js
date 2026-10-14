"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/AuthProvider";
import { useApp } from "@/components/Store";
import { cost, price, sz, calc as jobCalc } from "@/lib/model";
import { isCompleted, invoiceStatus } from "@/components/Invoice";

// Your details, printed on every quotation and invoice.
const COMPANY = { name: "Anlix Corp (Pty) Ltd", lines: ["Tlokweng, Gaborone, Botswana", "Tel: 76 675 006", "Email: anlixbw@gmail.com"] };
const FOOTER = "Anlix Corp (Pty) Ltd  |  anlixbw@gmail.com  |  76 675 006";
const BANK = []; // optional payment lines, e.g. ["Bank: FNB", "Account no: 123456"]. Empty = not printed.
// Put your logo at public/logo.png and your round stamp at public/stamp.png. They appear on printouts when present.

const money = (n) => "P" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
const today = () => new Date().toISOString().slice(0, 10);
const blankLine = () => ({ size: "", colour: "", quality: "", description: "", qty: 1, unit_price: 0 });
const hasContent = (l) => l.size || l.colour || l.quality || l.description || +l.unit_price;
// Job card number follows the invoice number: INV-0002 gives JC-0002
const jobCardFor = (no) => { const s = String(no || "").trim(); if (!s) return ""; const m = s.match(/^INV[-\s]*(.+)$/i); return "JC-" + (m ? m[1] : s); };
// The colour is kept in the description, for example "Black T-shirt", so nothing in the database has to change
const withColour = (l) => (l.colour && !String(l.description || "").toLowerCase().includes(l.colour.toLowerCase()) ? `${l.colour} ${l.description || ""}`.trim() : l.description);
const sortLines = (S, lines) => {
  const ix = (n) => { const i = S.sizes.findIndex((z) => z.n === n); return i < 0 ? 999 : i; };
  return [...lines].sort((a, b) => ix(a.size) - ix(b.size) || (a.colour || "").localeCompare(b.colour || "") || (a.description || "").localeCompare(b.description || ""));
};
const blankDoc = () => ({
  number: "", issued_on: today(), second_date: "", client_name: "", client_contact: "", client_email: "", client_address: "",
  job_card: "", vat_pct: 0, amount_paid: 0, paid_on: "", notes: "", lines: [blankLine()], source: "created", warnings: [],
});
const calc = (lines, vatPct) => {
  const subtotal = lines.reduce((s, l) => s + (+l.qty || 0) * (+l.unit_price || 0), 0);
  const vat = (subtotal * (+vatPct || 0)) / 100;
  return { subtotal, vat, total: subtotal + vat };
};
const badge = (s) => (
  <span className={"ax-badge " + ({ accepted: "approved", paid: "approved", issued: "approved", draft: "pending", sent: "pending", declined: "rejected", void: "rejected", expired: "rejected" }[s] || "")}>{s}</span>
);

/* ---------- save a quotation or invoice (header, then lines) ---------- */
async function saveDoc(kind, d) {
  const t = calc(d.lines, d.vat_pct);
  const head = {
    issued_on: d.issued_on || null, client_name: d.client_name, client_contact: d.client_contact, client_email: d.client_email,
    client_address: d.client_address, notes: d.notes, vat_pct: +d.vat_pct || 0, subtotal: t.subtotal, vat_amount: t.vat, total: t.total,
    source: d.source || "created", file_path: d.file_path || null, job_card: d.job_card || null,
  };
  if (kind === "invoice" && !head.job_card) head.job_card = jobCardFor(d.number) || null;
  if (kind === "quotation") {
    Object.assign(head, { quote_no: d.number || null, valid_until: d.second_date || null,
      status: d.status || (d.source === "imported" ? (d.job_card ? "accepted" : "sent") : "draft") });
  } else {
    Object.assign(head, {
      invoice_no: d.number || null, due_on: d.second_date || null, amount_paid: +d.amount_paid || 0, paid_on: d.paid_on || null,
      status: d.status || (d.source === "imported" ? ((+d.amount_paid || 0) >= t.total - 0.005 && t.total > 0 ? "paid" : "issued") : "draft"),
    });
    if (d.quotation_ref) { // link an imported invoice to its quotation when we have it
      const { data: q } = await supabase.from("quotations").select("id,job_card").eq("quote_no", d.quotation_ref).maybeSingle();
      if (q) { head.quotation_id = q.id; head.job_card = head.job_card || q.job_card; }
    }
  }
  const table = kind === "quotation" ? "quotations" : "invoices";
  const linesTable = kind === "quotation" ? "quotation_lines" : "invoice_lines";
  const fk = kind === "quotation" ? "quotation_id" : "invoice_id";
  const { data, error } = await supabase.from(table).insert(head).select(kind === "invoice" ? "id,invoice_no,job_card" : "id").single();
  if (error) throw new Error(error.code === "23505" ? "A document with this number (or an invoice for this quotation) already exists." : error.message);
  const rows = d.lines.filter((l) => l.size || l.colour || l.quality || l.description).map((l, i) => ({
    [fk]: data.id, position: i, size: l.size, quality: l.quality, description: withColour(l), qty: +l.qty || 0, unit_price: +l.unit_price || 0,
  }));
  if (rows.length) {
    const r = await supabase.from(linesTable).insert(rows);
    if (r.error) { await supabase.from(table).delete().eq("id", data.id); throw new Error(r.error.message); }
  }
  // Invoice number was left blank and generated by the database: give the job card the same number now
  if (kind === "invoice" && !data.job_card && data.invoice_no) {
    const jc = jobCardFor(data.invoice_no);
    const u = await supabase.from("invoices").update({ job_card: jc }).eq("id", data.id);
    if (u.error) throw new Error(`The invoice ${data.invoice_no} was saved, but its job card ${jc} could not be set: ${u.error.message}`);
  }
}

/* ---------- editor shared by "new quotation" and "import review" ---------- */
function DocEditor({ kind, initial, saveLabel = "Save", onSaved, onCancel, beforeSave }) {
  const { S } = useApp();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [parsing, setParsing] = useState(false);
  const [pmsg, setPmsg] = useState("");
  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const setLine = (i, k, v) => setD((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const t = calc(d.lines, d.vat_pct);
  const cell = { margin: 0, padding: "8px 9px", fontSize: 14 };
  const grid = { display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 1.5fr 70px 100px 100px 30px", gap: 6, alignItems: "center", marginBottom: 6, minWidth: 780 };

  // Cost of production with the tracker's formula: pattern height x material rates + sewing
  const costed = d.lines.map((l) => { const z = sz(S, String(l.size || "").trim()); return { l, q: +l.qty || 0, uc: z ? cost(S, z) : null }; });
  const known = costed.filter((r) => r.uc != null && r.q > 0);
  const unknown = costed.filter((r) => r.uc == null && r.q > 0 && (r.l.size || r.l.description)).length;
  const prodCost = known.reduce((a, r) => a + r.uc * r.q, 0);

  async function readList() {
    setParsing(true); setPmsg(""); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/documents/parse-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ text: d.notes, sizes: S.sizes.map((z) => z.n) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Could not read the list.");
      const total = j.lines.reduce((a, l) => a + l.qty, 0);
      // Prices the list does not state come from the tracker price list for this order quantity
      const parsed = j.lines.map((l) => { const z = sz(S, l.size); return { size: l.size, colour: l.colour, quality: "", description: l.description, qty: l.qty, unit_price: l.unit_price ?? (z ? price(S, z, total) : 0), src: "list" }; });
      setD((p) => ({
        ...p,
        lines: [...p.lines.filter((l) => l.src !== "list" && hasContent(l)), ...parsed],
        warnings: [...(p.warnings || []).filter((w) => !w.startsWith("Order list:")), ...j.warnings.map((w) => "Order list: " + w)],
      }));
      setPmsg(`${parsed.length} lines read from the list and sorted by size and colour. Prices the list did not give were filled from the tracker price list. Check them. The pasted text is still in the notes and prints on the document, so clear it if you don't want that.`);
    } catch (e) { setErr(e.message); }
    setParsing(false);
  }
  const field = (k, label, type = "text") => (
    <label className="ax-f" style={{ margin: 0 }}>{label}<input type={type} value={d[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></label>
  );

  async function save() {
    setBusy(true); setErr("");
    try {
      const file_path = beforeSave ? await beforeSave() : d.file_path;
      await saveDoc(kind, { ...d, file_path });
      onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="ax-item" style={{ display: "block" }}>
      {d.warnings?.length > 0 && (
        <div style={{ background: "#fff4d6", color: "#6b4a00", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
          <b>Check these before saving:</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{d.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 14 }}>
        {field("number", kind === "quotation" ? "Quotation no. (blank = auto)" : "Invoice no. (blank = auto)")}
        {field("issued_on", "Date issued", "date")}
        {field("second_date", kind === "quotation" ? "Valid until" : "Due date", "date")}
        {kind === "invoice" || d.source === "imported" ? field("job_card", "Job card no. (blank = auto, same as invoice no.)") : null}
        {field("client_name", "Client name")}
        {field("client_contact", "Contact / phone")}
        {field("client_email", "Client email")}
        {field("client_address", "Client address")}
        {field("vat_pct", "VAT %", "number")}
        {kind === "invoice" && field("amount_paid", "Amount paid so far", "number")}
        {kind === "invoice" && field("paid_on", "Date of payment", "date")}
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ ...grid, fontSize: 12, fontWeight: 700, color: "#5b6b82" }}>
          <span>Size</span><span>Colour</span><span>Quality</span><span>Description</span><span>Qty</span><span>Unit price</span><span>Total</span><span />
        </div>
        {d.lines.map((l, i) => (
          <div key={i} style={grid}>
            <input className="ax-sel" style={cell} value={l.size} onChange={(e) => setLine(i, "size", e.target.value)} />
            <input className="ax-sel" style={cell} value={l.colour || ""} onChange={(e) => setLine(i, "colour", e.target.value)} />
            <input className="ax-sel" style={cell} value={l.quality} onChange={(e) => setLine(i, "quality", e.target.value)} />
            <input className="ax-sel" style={cell} value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} />
            <input className="ax-sel" style={cell} type="number" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} />
            <input className="ax-sel" style={cell} type="number" value={l.unit_price} onChange={(e) => setLine(i, "unit_price", e.target.value)} />
            <span>{money((+l.qty || 0) * (+l.unit_price || 0))}</span>
            <button type="button" className="ax-link" onClick={() => set("lines", d.lines.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="ax-btn alt" onClick={() => set("lines", [...d.lines, blankLine()])}>+ Add size / line</button>
        <button type="button" className="ax-btn alt" onClick={() => set("lines", sortLines(S, d.lines))}>Sort by size and colour</button>
      </div>
      <label className="ax-f" style={{ marginTop: 14 }}>Order details / notes
        <textarea rows={6} value={d.notes} onChange={(e) => set("notes", e.target.value)}
          placeholder="Paste the order list here, for example: 5 black medium, 3 black large, 2 white XL"
          style={{ width: "100%", boxSizing: "border-box", font: "inherit", padding: 10, borderRadius: 8, border: "1px solid #c9d3df" }} />
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <button type="button" className="ax-btn" disabled={parsing || !String(d.notes || "").trim()} onClick={readList}>{parsing ? "Reading..." : "Read order list with AI"}</button>
        <small>The AI turns the pasted list into lines, sorted by size and colour.</small>
      </div>
      {pmsg && <div className="ax-msg" style={{ marginTop: 8 }}>{pmsg}</div>}
      <div style={{ textAlign: "right", fontSize: 14, margin: "8px 0" }}>
        Subtotal {money(t.subtotal)} · VAT {money(t.vat)} · <b>Total {money(t.total)}</b>
      </div>
      {known.length > 0 && (
        <div className="ax-item" style={{ display: "block", margin: "10px 0" }}>
          <b>Cost of production</b> <small>(pattern height × material rates + sewing, from Costing and prices)</small>
          <table style={{ width: "100%", fontSize: 13, marginTop: 6, borderCollapse: "collapse" }}>
            <thead><tr>{["Size", "Colour", "Qty", "Unit cost", "Line cost"].map((h, i) => <th key={h} style={{ textAlign: i > 1 ? "right" : "left", padding: "4px 6px" }}>{h}</th>)}</tr></thead>
            <tbody>{known.map(({ l, q, uc }, i) => (
              <tr key={i}><td style={{ padding: "4px 6px" }}>{l.size}</td><td style={{ padding: "4px 6px" }}>{l.colour}</td>
                <td style={{ padding: "4px 6px", textAlign: "right" }}>{q}</td><td style={{ padding: "4px 6px", textAlign: "right" }}>{money(uc)}</td><td style={{ padding: "4px 6px", textAlign: "right" }}>{money(uc * q)}</td></tr>
            ))}</tbody>
          </table>
          <div style={{ textAlign: "right", marginTop: 8, fontSize: 14 }}>
            Production cost <b>{money(prodCost)}</b>
            {unknown === 0 && <> · Document total {money(t.total)} · Gross profit <b>{money(t.total - prodCost)}</b> ({t.total ? Math.round(((t.total - prodCost) / t.total) * 100) : 0}%)</>}
          </div>
          {unknown > 0 && <div style={{ fontSize: 13, marginTop: 4 }}>{unknown} line{unknown > 1 ? "s have" : " has"} no matching size, so profit is not shown. Set the size to one from the tracker.</div>}
        </div>
      )}
      {err && <div className="ax-msg err">{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="ax-btn" disabled={busy} onClick={save}>{busy ? "Saving..." : saveLabel}</button>
        {onCancel && <button className="ax-btn alt" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

/* ---------- printable view (matches your invoice layout) ---------- */
const hideIfMissing = (e) => { e.currentTarget.style.display = "none"; };
const R = ({ l, v, bold, top }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontWeight: bold ? 700 : 400, borderTop: top ? "1px solid #000" : "none", marginTop: top ? 4 : 0 }}>
    <span>{l}</span><span>{v}</span>
  </div>
);

function Viewer({ kind, row, onClose }) {
  const [lines, setLines] = useState(null);
  useEffect(() => {
    supabase.from(kind === "quotation" ? "quotation_lines" : "invoice_lines").select("*")
      .eq(kind === "quotation" ? "quotation_id" : "invoice_id", row.id).order("position")
      .then(({ data }) => setLines(data || []));
  }, [kind, row.id]);

  const isInv = kind === "invoice";
  const no = isInv ? row.invoice_no : row.quote_no;
  const paid = +row.amount_paid || 0;
  const balance = (+row.total || 0) - paid;
  const hasSQ = (lines || []).some((l) => l.size || l.quality);
  const status = !isInv ? "" : row.status === "void" ? "VOID" : row.status === "draft" ? "DRAFT"
    : balance <= 0.005 && row.total > 0 ? "PAID" : paid > 0 ? "BALANCE DUE" : "UNPAID";
  const cols = hasSQ ? ["Description", "Size", "Quality", "Qty", "Unit Price", "Amount"] : ["Description", "Qty", "Unit Price", "Amount"];
  const right = (i) => i >= cols.length - 3;
  const th = (i) => ({ padding: "9px 10px", background: "#000", color: "#fff", textAlign: right(i) ? "right" : "left", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" });
  const td = (i) => ({ padding: "10px", textAlign: right(i) ? "right" : "left", borderBottom: "1px solid #333" });
  const meta = (label, value, bold) => value ? (
    <div key={label}><b style={{ display: "inline-block", width: 92 }}>{label}:</b><span style={bold ? { fontWeight: 700 } : null}>{value}</span></div>
  ) : null;

  return (
    <div className="doc-modal">
      <div className="no-print" style={{ maxWidth: 800, margin: "0 auto 10px", display: "flex", gap: 8 }}>
        <button className="ax-btn" onClick={() => window.print()}>Print / Save as PDF</button>
        <button className="ax-btn alt" onClick={onClose}>Close</button>
      </div>
      <div id="print-area" className="doc-sheet" style={{ minHeight: 1000, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <img src="/logo.png" alt="" style={{ height: 80 }} onError={hideIfMissing} />
          <div style={{ fontSize: 40, fontWeight: 800 }}>{isInv ? "INVOICE" : "QUOTATION"}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginTop: 22, fontSize: 14, lineHeight: 1.6 }}>
          <div><b>{COMPANY.name}</b>{COMPANY.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
          <div>
            {meta(isInv ? "Invoice No" : "Quotation No", no)}
            {meta("Date", fmtDate(row.issued_on))}
            {isInv && paid > 0 && meta(balance <= 0.005 ? "Paid" : "Part Paid", fmtDate(row.paid_on))}
            {meta(isInv ? "Due" : "Valid until", fmtDate(isInv ? row.due_on : row.valid_until))}
            {meta("Job Card", row.job_card)}
            {isInv && meta("Status", status, true)}
          </div>
        </div>

        <div style={{ marginTop: 28, fontSize: 12, fontWeight: 700, borderBottom: "1px solid #000", paddingBottom: 6 }}>BILLED TO</div>
        <div style={{ margin: "12px 0 26px", fontSize: 14, lineHeight: 1.6 }}>
          <b>{row.client_name}</b>
          {[row.client_contact, row.client_email, row.client_address].filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr>{cols.map((c, i) => <th key={c} style={th(i)}>{c}</th>)}</tr></thead>
          <tbody>
            {(lines || []).map((l) => {
              const cells = hasSQ ? [l.description, l.size, l.quality, l.qty, money(l.unit_price), money(l.line_total)] : [l.description, l.qty, money(l.unit_price), money(l.line_total)];
              return <tr key={l.id}>{cells.map((c, i) => <td key={i} style={td(i)}>{c}</td>)}</tr>;
            })}
          </tbody>
        </table>

        <div style={{ marginLeft: "auto", width: 280, marginTop: 16, fontSize: 14 }}>
          <R l="Subtotal" v={money(row.subtotal)} />
          {+row.vat_pct > 0 && <R l={`VAT (${row.vat_pct}%)`} v={money(row.vat_amount)} />}
          {isInv && paid > 0 && <R l="Amount Paid" v={"-" + money(paid)} />}
          <R l={isInv ? "Balance Due" : "Total"} v={money(isInv ? balance : row.total)} bold top />
        </div>

        <div style={{ marginTop: 50, fontSize: 14, lineHeight: 1.7 }}>
          {isInv && paid > 0 && <div>Part payment of {money(paid)} received{row.paid_on ? ` on ${fmtDate(row.paid_on)}` : ""}.</div>}
          {isInv && paid > 0 && balance > 0.005 && <div><b>Remaining balance of {money(balance)} is still outstanding.</b></div>}
          {row.notes && <div>{row.notes}</div>}
          {BANK.length > 0 && isInv && <div style={{ marginTop: 10 }}>{BANK.map((l, i) => <div key={i}>{l}</div>)}</div>}
          <div>Thank you for your business.</div>
        </div>
        <img src="/stamp.png" alt="" style={{ height: 150, position: "absolute", right: 60, bottom: 110 }} onError={hideIfMissing} />
        <div style={{ position: "absolute", left: 32, right: 32, bottom: 24, borderTop: "1px solid #000", paddingTop: 8, textAlign: "center", fontSize: 11 }}>{FOOTER}</div>
      </div>
    </div>
  );
}

/* ---------- quotations ---------- */
function QuotationsTab({ canEdit }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("quotations").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) setMsg(error.message);
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = (fn) => async () => { setMsg(""); try { await fn(); await load(); } catch (e) { setMsg(e.message); } };
  const setStatus = (r, status) => run(async () => {
    const { error } = await supabase.from("quotations").update({ status }).eq("id", r.id);
    if (error) throw error;
  });
  const accept = (r) => run(async () => {
    const custom = prompt("Job card number? Leave blank to generate one.", "");
    if (custom === null) return;
    const { data, error } = await supabase.rpc("accept_quotation", { p_id: r.id, p_job_card: custom || null });
    if (error) throw error;
    setMsg(`Accepted. Job card ${data} created.`);
  });
  const invoice = (r) => run(async () => {
    const { error } = await supabase.rpc("invoice_from_quotation", { p_id: r.id });
    if (error) throw error;
    setMsg("Invoice created from the job card. Open the Invoices tab.");
  });

  if (!rows) return <p>Loading...</p>;
  const shown = rows.filter((r) => [r.quote_no, r.client_name, r.job_card].join(" ").toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input className="ax-sel" style={{ width: 260, margin: 0 }} placeholder="Search number, client, job card" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {canEdit && <button className="ax-btn" onClick={() => setCreating(true)}>+ New quotation</button>}
      </div>
      {msg && <div className="ax-msg">{msg}</div>}
      {creating && <DocEditor kind="quotation" initial={blankDoc()} saveLabel="Save quotation" onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {shown.map((r) => (
        <div className="ax-item" key={r.id}>
          <div className="grow"><b>{r.quote_no}</b> · {r.client_name || "(no client)"}<small>{r.issued_on || "no date"} · {money(r.total)}{r.job_card ? ` · Job card ${r.job_card}` : ""}{r.source === "imported" ? " · imported" : ""}</small></div>
          {badge(r.status)}
          <button className="ax-btn alt" onClick={() => setView(r)}>View / Print</button>
          {canEdit && (r.status === "draft" || r.status === "sent") && <>
            <button className="ax-btn" onClick={accept(r)}>Accept → job card</button>
            <button className="ax-btn bad" onClick={setStatus(r, "declined")}>Declined</button>
          </>}
          {canEdit && r.status === "draft" && <button className="ax-btn alt" onClick={setStatus(r, "sent")}>Mark sent</button>}
          {canEdit && r.status === "accepted" && <button className="ax-btn" onClick={setStatus(r, "completed")}>Work done</button>}
          {canEdit && r.status === "completed" && <button className="ax-btn" onClick={invoice(r)}>Create invoice</button>}
        </div>
      ))}
      {!shown.length && <p>No quotations yet.</p>}
      {view && <Viewer kind="quotation" row={view} onClose={() => setView(null)} />}
    </>
  );
}

/* ---------- invoices ---------- */
function InvoicesTab({ canEdit }) {
  const { S } = useApp();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  const [view, setView] = useState(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) setMsg(error.message);
    setRows(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const update = async (r, patch) => {
    const { error } = await supabase.from("invoices").update(patch).eq("id", r.id);
    if (error) setMsg(error.message); else load();
  };
  const recordPayment = (r) => () => {
    const owing = (+r.total || 0) - (+r.amount_paid || 0);
    const amt = parseFloat(prompt(`Payment received? (balance ${money(owing)})`, owing.toFixed(2)));
    if (!(amt > 0)) return;
    const on = prompt("Date received (YYYY-MM-DD)", today());
    if (!on) return;
    const paid = (+r.amount_paid || 0) + amt;
    update(r, { amount_paid: paid, paid_on: on, status: paid >= (+r.total || 0) - 0.005 ? "paid" : "issued" });
  };
  if (!rows) return <p>Loading...</p>;
  const shown = rows.filter((r) => [r.invoice_no, r.client_name, r.job_card].join(" ").toLowerCase().includes(filter.toLowerCase()));
  // Invoices for completed tracker jobs that are not already saved as a document in the database
  const fromTracker = (S.orders || [])
    .filter((o) => isCompleted(S, o))
    .filter((o) => !rows.some((r) => (r.job_card && r.job_card === o.jc) || (r.invoice_no && r.invoice_no === o.inv)))
    .filter((o) => [o.inv, o.jc, o.placed, o.ent].join(" ").toLowerCase().includes(filter.toLowerCase()))
    .map((o) => ({ o, c: jobCalc(S, o) }))
    .map(({ o, c }) => ({ o, c, st: invoiceStatus(o, c) }))
    .sort((a, b) => String(b.o.closed?.at || b.o.date || "").localeCompare(String(a.o.closed?.at || a.o.date || "")));
  return (
    <>
      <input className="ax-sel" style={{ width: 260, margin: "0 0 12px" }} placeholder="Search number, client, job card" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {msg && <div className="ax-msg err">{msg}</div>}
      {fromTracker.map(({ o, c, st }) => {
        const d = String(o.closed?.at || o.date || "").slice(0, 10);
        return (
          <div className="ax-item" key={"trk-" + o.jc}>
            <div className="grow"><b>{o.inv}</b> · {o.placed || "(no client)"}{o.ent ? ` · ${o.ent}` : ""}
              <small>{fmtDate(d) || "no date"} · {money(c.net)}{st.paid > 0 ? ` · paid ${money(st.paid)} · balance ${money(st.bal)}` : ""} · Job card {o.jc} · completed job</small></div>
            {badge(st.full ? "paid" : "issued")}
            <Link className="ax-btn alt" href={`/orders/${o.jc}/invoice`}>View / Print</Link>
          </div>
        );
      })}
      {shown.map((r) => {
        const balance = (+r.total || 0) - (+r.amount_paid || 0);
        return (
          <div className="ax-item" key={r.id}>
            <div className="grow"><b>{r.invoice_no}</b> · {r.client_name || "(no client)"}
              <small>{fmtDate(r.issued_on) || "no date"} · {money(r.total)}{+r.amount_paid > 0 ? ` · paid ${money(r.amount_paid)} · balance ${money(balance)}` : ""}{r.job_card ? ` · Job card ${r.job_card}` : ""}{r.source === "imported" ? " · imported" : ""}</small></div>
            {badge(r.status)}
            <button className="ax-btn alt" onClick={() => setView(r)}>View / Print</button>
            {canEdit && r.status === "draft" && <button className="ax-btn" onClick={() => update(r, { status: "issued" })}>Issue</button>}
            {canEdit && r.status === "issued" && balance > 0.005 && <button className="ax-btn" onClick={recordPayment(r)}>Record payment</button>}
            {canEdit && (r.status === "draft" || r.status === "issued") && <button className="ax-btn bad" onClick={() => update(r, { status: "void" })}>Void</button>}
          </div>
        );
      })}
      {!shown.length && !fromTracker.length && <p>No invoices yet.</p>}
      {view && <Viewer kind="invoice" row={view} onClose={() => setView(null)} />}
    </>
  );
}

/* ---------- import with AI ---------- */
const toB64 = (f) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1]);
  r.onerror = () => rej(new Error("Could not read the file."));
  r.readAsDataURL(f);
});
const fromAi = (d) => ({
  kind: d.doc_type === "invoice" ? "invoice" : "quotation",
  doc: {
    number: d.doc_number, issued_on: d.issued_on, second_date: d.second_date, client_name: d.client_name, client_contact: d.client_contact,
    client_email: d.client_email, client_address: d.client_address, job_card: d.job_card, quotation_ref: d.quotation_ref, vat_pct: d.vat_pct ?? 0, amount_paid: d.amount_paid ?? 0, paid_on: d.paid_on || "",
    notes: d.notes, lines: d.lines.length ? d.lines : [blankLine()], source: "imported", warnings: d.warnings,
  },
});

function ImportTab() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const patch = (id, v) => setItems((p) => p.map((x) => (x.id === id ? { ...x, ...v } : x)));

  async function onPick(e) {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    const fresh = files.map((file) => ({ id: crypto.randomUUID(), file, status: "reading" }));
    setItems((p) => [...p, ...fresh]);
    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    for (const it of fresh) {
      try {
        if (it.file.size > 15 * 1048576) throw new Error("File is over 15 MB.");
        const res = await fetch("/api/documents/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ files: [{ fileName: it.file.name, mimeType: it.file.type, base64Data: await toB64(it.file) }] }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Extraction failed.");
        const r = j.results[0];
        if (!r.ok) throw new Error(r.error);
        patch(it.id, { status: "done", ...fromAi(r.data) });
      } catch (err) { patch(it.id, { status: "error", error: err.message }); }
    }
    setBusy(false);
  }

  const upload = (it) => async () => {
    const path = `imports/${crypto.randomUUID()}-${it.file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("documents").upload(path, it.file, { contentType: it.file.type });
    if (error) throw new Error("Could not store the original file: " + error.message);
    return path;
  };

  return (
    <>
      <p>Upload old quotations or invoices (PDF or photo). The AI reads the number, date issued, client, and every size and quality ordered. Check the result, then save it to your history.</p>
      <label className="ax-btn" style={{ display: "inline-block" }}>
        {busy ? "Reading..." : "Choose files"}
        <input type="file" multiple accept="application/pdf,image/*" onChange={onPick} disabled={busy} style={{ display: "none" }} />
      </label>
      <div style={{ marginTop: 16 }}>
        {items.map((it) => (
          <div key={it.id} style={{ marginBottom: 16 }}>
            <b>{it.file.name}</b>{" "}
            {it.status === "reading" && <span className="ax-badge pending">reading...</span>}
            {it.status === "error" && <span className="ax-msg err"> {it.error}</span>}
            {it.status === "saved" && <span className="ax-badge approved">saved to history</span>}
            {it.status === "done" && (
              <>
                <label style={{ marginLeft: 10, fontSize: 13 }}>This is a{" "}
                  <select value={it.kind} onChange={(e) => patch(it.id, { kind: e.target.value })}>
                    <option value="quotation">quotation</option><option value="invoice">invoice</option>
                  </select>
                </label>
                <DocEditor key={it.id} kind={it.kind} initial={it.doc} saveLabel="Save to history" beforeSave={upload(it)} onSaved={() => patch(it.id, { status: "saved" })} />
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- page ---------- */
export default function DocumentsPage() {
  const me = useAuth();
  const [tab, setTab] = useState("quotations");
  if (!me.user) return <div className="ax-page"><p>Quotations and invoices need Supabase sign-in.</p></div>;
  if (!me.can("documents.view")) return <div className="ax-page"><p>You don't have access to this page.</p></div>;
  const canEdit = me.can("documents.edit");
  return (
    <div className="ax-page">
      <style>{`
        .doc-modal{position:fixed;inset:0;background:#0008;z-index:9998;overflow:auto;padding:16px}
        .doc-sheet{background:#fff;color:#111;max-width:800px;margin:0 auto;padding:32px;font-family:system-ui,sans-serif}
        @media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body *{visibility:hidden}#print-area,#print-area *{visibility:visible}#print-area{position:absolute;left:0;top:0;width:100%}.no-print{display:none}}
      `}</style>
      <Link href="/">← Back to tracker</Link>
      <h1>Quotations & invoices</h1>
      <div className="ax-tabs">
        <button className="ax-btn alt" onClick={() => setTab("quotations")}>Quotations</button>
        <button className="ax-btn alt" onClick={() => setTab("invoices")}>Invoices</button>
        {canEdit && <button className="ax-btn alt" onClick={() => setTab("import")}>Import with AI</button>}
      </div>
      {tab === "quotations" && <QuotationsTab canEdit={canEdit} />}
      {tab === "invoices" && <InvoicesTab canEdit={canEdit} />}
      {tab === "import" && canEdit && <ImportTab />}
    </div>
  );
}
