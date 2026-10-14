// app/api/documents/extract/route.js
// Reads an uploaded quotation or invoice (PDF or photo) with Gemini and returns structured data.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_RETRIES = 3;
const MAX_FILES = 10;
const KEYS = [
  process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4, process.env.GEMINI_API_KEY_5,
].filter(Boolean);
const PER_KEY_MS = 12000; // free tier: ~10 requests/minute per key
const cooldowns = new Map(KEYS.map((k) => [k, 0]));
let ki = 0;

const SYSTEM = `You read quotations and invoices for a clothing print business and return structured JSON.
Return ONLY a JSON object with exactly these keys:
{
 "doc_type": "quotation" | "invoice" | "other",
 "doc_number": "the quotation or invoice number printed on the document",
 "issued_on": "YYYY-MM-DD date the document was issued",
 "valid_until_or_due_on": "YYYY-MM-DD (quotation: valid until; invoice: due date) or empty",
 "job_card": "job card / work order / order number printed on the document, else empty",
 "quotation_ref": "for an invoice: the quotation number it refers to, else empty",
 "client_name": "", "client_contact": "", "client_email": "", "client_address": "",
 "vat_pct": number or null, "subtotal": number or null, "vat_amount": number or null, "total": number or null,
 "notes": "terms, remarks or payment details worth keeping",
 "lines": [{"size": "", "quality": "", "description": "", "qty": number, "unit_price": number, "line_total": number or null}],
 "warnings": ["anything unclear, cut off or hard to read"]
}
Rules:
- One entry in "lines" per size and quality combination. Never merge different sizes or qualities into one line.
- "size" is the size exactly as written (for example S, M, XL, Kids 8, A3). "quality" is the grade or quality written for that item (for example Premium, Standard, 180gsm). If the document does not state one, use an empty string.
- Numbers are plain numbers: no currency symbols and no thousands separators.
- Dates are YYYY-MM-DD. If a date is ambiguous or missing, leave it empty and add a warning.
- Never invent values. Anything unreadable becomes an empty string or null, plus a warning.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const san = (v) => (v == null ? "" : String(v).trim());
const num = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(san(v)) ? san(v) : "");

async function timed(url, opts, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  catch (e) { if (e.name === "AbortError") throw new Error(`Timeout after ${ms / 1000}s`); throw e; }
  finally { clearTimeout(t); }
}

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const s = text.replace(/^```json\s*/im, "").replace(/^```\s*/im, "").replace(/\s*```\s*$/im, "").trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}

async function nextKey() {
  const now = Date.now();
  for (let i = 0; i < KEYS.length; i++) {
    const k = KEYS[(ki + i) % KEYS.length];
    if ((cooldowns.get(k) || 0) <= now) { ki = (ki + i + 1) % KEYS.length; cooldowns.set(k, now + PER_KEY_MS); return k; }
  }
  await sleep(Math.min(...cooldowns.values()) - now + 200);
  const k = KEYS[ki % KEYS.length];
  ki = (ki + 1) % KEYS.length;
  cooldowns.set(k, Date.now() + PER_KEY_MS);
  return k;
}

async function callGemini(base64, mime) {
  const wait = Math.max(500, Math.ceil(PER_KEY_MS / KEYS.length));
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const key = await nextKey();
    try {
      const res = await timed(`${BASE}/models/${MODEL}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [
            { text: "Extract this document. Return ONLY the JSON object." },
            { inline_data: { mime_type: mime, data: base64 } },
          ] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 16384, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 1024 } },
        }),
      }, 120000);
      if (res.status === 429 || res.status >= 500) { await sleep(wait); continue; }
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || `Gemini error ${res.status}`);
      }
      const j = await res.json();
      const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      const parsed = parseJson(text);
      if (!parsed) throw new Error("Could not read the AI answer.");
      return parsed;
    } catch (e) {
      if (attempt === MAX_RETRIES - 1) throw e;
      await sleep(wait);
    }
  }
  throw new Error("The AI service is busy. Wait a minute and try again.");
}

function normalize(p) {
  const lines = (Array.isArray(p.lines) ? p.lines : []).map((l) => {
    const qty = num(l.qty) ?? 0;
    const total = num(l.line_total);
    return {
      size: san(l.size), quality: san(l.quality), description: san(l.description), qty,
      unit_price: num(l.unit_price) ?? (total != null && qty ? total / qty : 0),
    };
  }).filter((l) => l.size || l.quality || l.description || l.qty);

  const warnings = (Array.isArray(p.warnings) ? p.warnings : []).map(san).filter(Boolean);
  const vat = num(p.vat_pct) ?? 0;
  const sum = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const stated = num(p.total);
  if (stated != null && Math.abs(sum - stated) > 1 && Math.abs(sum * (1 + vat / 100) - stated) > 1)
    warnings.push(`The lines add up to ${sum.toFixed(2)} but the document says ${stated.toFixed(2)}. Check quantities and prices.`);
  if (!lines.length) warnings.push("No line items were found.");
  if (!isoDate(p.issued_on)) warnings.push("No issue date was found. Enter it before saving.");

  const type = san(p.doc_type).toLowerCase();
  return {
    doc_type: type === "invoice" ? "invoice" : type === "quotation" ? "quotation" : "other",
    doc_number: san(p.doc_number), issued_on: isoDate(p.issued_on), second_date: isoDate(p.valid_until_or_due_on),
    job_card: san(p.job_card), quotation_ref: san(p.quotation_ref),
    client_name: san(p.client_name), client_contact: san(p.client_contact), client_email: san(p.client_email), client_address: san(p.client_address),
    vat_pct: vat, total: stated, notes: san(p.notes), lines, warnings,
  };
}

export async function POST(req) {
  try {
    if (!KEYS.length) return NextResponse.json({ error: "No GEMINI_API_KEY is set on the server." }, { status: 500 });

    // Only signed-in staff who may edit documents can spend AI credits
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: allowed, error: permErr } = await sb.rpc("has_perm", { p: "documents.edit" });
    if (permErr || allowed !== true) return NextResponse.json({ error: "You don't have permission to import documents." }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.files) || !body.files.length)
      return NextResponse.json({ error: "Send a non-empty files array." }, { status: 400 });
    if (body.files.length > MAX_FILES)
      return NextResponse.json({ error: `Max ${MAX_FILES} files per request.` }, { status: 400 });

    const results = [];
    for (const f of body.files) {
      try {
        const name = san(f.fileName) || "document";
        const isPdf = f.mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf");
        const mime = isPdf ? "application/pdf" : (f.mimeType || "").startsWith("image/") ? f.mimeType : "image/jpeg";
        if (!f.base64Data) throw new Error("Empty file.");
        if (Buffer.byteLength(f.base64Data, "base64") > 15 * 1048576) throw new Error("File is over 15 MB.");
        results.push({ fileName: name, ok: true, data: normalize(await callGemini(f.base64Data, mime)) });
      } catch (e) {
        results.push({ fileName: san(f.fileName), ok: false, error: e.message || "Extraction failed." });
      }
    }
    return NextResponse.json({ results, model: MODEL });
  } catch (e) {
    console.error("documents/extract error:", e);
    return NextResponse.json({ error: e?.message || "Unexpected server error." }, { status: 500 });
  }
}
