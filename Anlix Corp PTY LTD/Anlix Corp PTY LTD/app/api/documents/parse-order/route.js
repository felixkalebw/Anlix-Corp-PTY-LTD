// app/api/documents/parse-order/route.js
// Reads pasted order details (sizes, colours, quantities) with OpenAI GPT-6 Luna and returns tidy order lines.
// Needs OPENAI_API_KEY in the server environment (Render > Environment). Optional: AI_MODEL (defaults to gpt-6-luna).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MODEL = process.env.AI_MODEL || "gpt-6-luna";
const MAX_TEXT = 20000;
const san = (v) => (v == null ? "" : String(v).trim());
const num = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const system = (sizes) => `You read pasted order details for Anlix Corp, a T-shirt and clothing printing business in Botswana, and return JSON only.
The allowed sizes are exactly: ${sizes.join(", ")}.
Return ONLY a JSON object: {"lines":[{"size":"","colour":"","description":"","qty":0,"unit_price":null}],"warnings":[""]}
Rules:
- One line per size and colour combination. Never merge different sizes or colours. Add up the quantities of the same size, colour and garment.
- "size" must be exactly one of the allowed sizes. Convert wording: extra small = XS, small = S, medium = M, large = L, extra large = XL, double extra large or XXL = 2XL, XXXL = 3XL, XXXXL = 4XL. For children, use the allowed kids size that covers the age or size written (for example age 8 or "kids 8" means the size range that includes 8). If you cannot match a size, use an empty string and add a warning that quotes the text.
- "colour" is the garment colour in plain words with a capital letter, for example Black or Royal blue. If none is written, use an empty string.
- "description" is the garment, for example T-shirt, Golf shirt, Long sleeve shirt, Tracksuit, Shorts or Socks. Use T-shirt when the text does not say.
- If the text lists people, for example names and numbers with a size each, count each person as quantity 1 and add up by size and colour. Ignore names and numbers.
- "qty" is a whole number. If a quantity is missing, use 1 and add a warning.
- "unit_price" is a plain number only when a price per item is written, otherwise null.
- Never invent anything. Put anything unclear in "warnings".`;

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const s = text.replace(/^```json\s*/im, "").replace(/^```\s*/im, "").replace(/\s*```\s*$/im, "").trim();
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} }
  return null;
}

async function askLuna(text, sizes) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90000);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: ac.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        instructions: system(sizes),
        input: `Order details to read. Return JSON only.\n\n${text}`,
        text: { format: { type: "json_object" } },
        reasoning: { effort: "low" },
        max_output_tokens: 8000,
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error?.message || `OpenAI error ${res.status}`);
    const out = j?.output_text ?? (j?.output || []).flatMap((o) => o.content || []).filter((c) => c.type === "output_text").map((c) => c.text || "").join("");
    const parsed = parseJson(out);
    if (!parsed) throw new Error("Could not read the AI answer.");
    return parsed;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("The AI took too long. Try a shorter list.");
    throw e;
  } finally { clearTimeout(timer); }
}

const ALIAS = { xxl: "2XL", "xx-large": "2XL", "double xl": "2XL", xxxl: "3XL", "xxx-large": "3XL", xxxxl: "4XL", "extra small": "XS", "x-small": "XS", "x small": "XS", small: "S", medium: "M", large: "L", "extra large": "XL", "x-large": "XL", "x large": "XL" };
const cap = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);

// Clean the answer: only allowed sizes, whole quantities, same size+colour+garment added together, sorted by size then colour
function tidy(p, sizes) {
  const warnings = (Array.isArray(p.warnings) ? p.warnings : []).map(san).filter(Boolean);
  const byLower = new Map(sizes.map((s) => [s.toLowerCase(), s]));
  const map = new Map();
  for (const l of Array.isArray(p.lines) ? p.lines : []) {
    const raw = san(l.size);
    const size = byLower.get(raw.toLowerCase()) || byLower.get((ALIAS[raw.toLowerCase()] || "").toLowerCase()) || "";
    if (raw && !size) warnings.push(`Size "${raw}" is not in the tracker's size list. Pick the right size by hand.`);
    const qty = Math.max(0, Math.round(num(l.qty) ?? 0));
    if (!qty) continue;
    const colour = cap(san(l.colour)), description = san(l.description) || "T-shirt";
    const key = [size, colour.toLowerCase(), description.toLowerCase()].join("|");
    const prev = map.get(key);
    if (prev) prev.qty += qty;
    else map.set(key, { size, colour, description, qty, unit_price: num(l.unit_price) });
  }
  const ix = (s) => { const i = sizes.indexOf(s); return i < 0 ? 999 : i; };
  const lines = [...map.values()].sort((a, b) => ix(a.size) - ix(b.size) || a.colour.localeCompare(b.colour) || a.description.localeCompare(b.description));
  if (!lines.length) warnings.push("No order lines were found in the text.");
  return { lines, warnings };
}

export async function POST(req) {
  try {
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "No OPENAI_API_KEY is set on the server." }, { status: 500 });

    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: allowed, error: permErr } = await sb.rpc("has_perm", { p: "documents.edit" });
    if (permErr || allowed !== true) return NextResponse.json({ error: "You don't have permission to read order lists." }, { status: 403 });

    const body = await req.json().catch(() => null);
    const text = san(body?.text);
    const sizes = Array.isArray(body?.sizes) ? body.sizes.map(san).filter((s) => s && s.length <= 20).slice(0, 60) : [];
    if (!text) return NextResponse.json({ error: "Paste the order details first." }, { status: 400 });
    if (text.length > MAX_TEXT) return NextResponse.json({ error: "The list is too long. Split it into two." }, { status: 400 });
    if (!sizes.length) return NextResponse.json({ error: "The size list is missing." }, { status: 400 });

    const result = tidy(await askLuna(text, sizes), sizes);
    return NextResponse.json({ ...result, model: MODEL });
  } catch (e) {
    console.error("documents/parse-order error:", e);
    return NextResponse.json({ error: e?.message || "Unexpected server error." }, { status: 500 });
  }
}
