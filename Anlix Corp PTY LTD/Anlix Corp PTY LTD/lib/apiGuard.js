// lib/apiGuard.js
// Shared security helpers for API routes: verified sign-in, permission check, rate limiting,
// size-capped body reading and safe error responses.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Errors whose message is safe to show to the user. Everything else becomes a generic message.
export class UserError extends Error {}

export const fail = (status, error) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export const ok = (data) =>
  NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });

export function serverError(label, e) {
  if (e instanceof UserError) return fail(400, e.message);
  console.error(`${label} error:`, e?.message || e);
  return fail(500, "Something went wrong. Please try again.");
}

// Verifies the Supabase access token, then checks the permission through the has_perm RPC.
// Returns { user } on success or { res } (a ready error response) on failure.
export async function authorize(req, perm) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.error("Supabase environment variables are missing.");
    return { res: fail(500, "Server is not configured.") };
  }
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length > 4096) return { res: fail(401, "Please sign in.") };

  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Confirm the token is a real, unexpired session before trusting anything else.
  const { data: u, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !u?.user?.id) return { res: fail(401, "Please sign in again.") };

  const { data: allowed, error: permErr } = await sb.rpc("has_perm", { p: perm });
  if (permErr || allowed !== true) return { res: fail(403, "You don't have permission to do this.") };

  return { user: u.user };
}

// Simple in-memory limiter. Fine for a single Render instance; use a database table or Redis if you scale out.
const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > 3600000) buckets.delete(k);
  }
  return true;
}

// Reads a JSON body but stops as soon as it goes over maxBytes, so a huge upload cannot exhaust memory.
export async function readJson(req, maxBytes) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > maxBytes) return { tooLarge: true };
  const reader = req.body?.getReader();
  if (!reader) return { body: null };
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      reader.cancel().catch(() => {});
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  try {
    return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { body: null };
  }
}
