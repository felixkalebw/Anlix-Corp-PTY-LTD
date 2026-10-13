// Supabase Edge Function: ai-manager
// Deploy:  supabase functions deploy ai-manager
// Secrets: supabase secrets set AI_PROVIDER=anthropic AI_MODEL=<model name> AI_API_KEY=<key> AI_ALLOWED_EMAILS=a@x.com,b@x.com
//          (AI_PROVIDER is "anthropic" or "openai"; AI_ALLOWED_EMAILS is optional; ALLOWED_ORIGIN is optional)
// Optional usage log, run once in the SQL editor:
//   create table if not exists ai_log(id bigint generated always as identity primary key, user_id uuid, email text, question text, created_at timestamptz default now());
//   alter table ai_log enable row level security;
//   create policy "staff log own questions" on ai_log for insert to authenticated with check (auth.uid() = user_id);
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const origin = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const cors = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SYSTEM = `You are the operations assistant for Anlix Corp, a t-shirt printing and production business in Botswana. All money is in Botswana Pula (P).
Rules:
- Use only the JSON data supplied. Every figure in it was already calculated by the application; quote those figures and do not recalculate or invent numbers. Simple arithmetic on supplied figures is allowed, and you must say when you do it.
- State your assumptions. List any data you needed but the JSON does not contain (see missing_data and anything else absent) instead of guessing.
- You can only recommend. You cannot change prices, payments, stock or orders, and you must say that any such change needs a staff member's confirmation.
- Be concise and practical: short paragraphs or a short list, lead with the answer, name job cards and sizes exactly as given.`

const hits = new Map<string, number[]>()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  // 1. Authenticate the staff member
  const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: auth } = await supa.auth.getUser()
  const user = auth?.user
  if (!user) return json({ error: 'Sign in first' }, 401)
  const allowed = (Deno.env.get('AI_ALLOWED_EMAILS') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  if (allowed.length && !allowed.includes((user.email ?? '').toLowerCase())) return json({ error: 'Not permitted' }, 403)

  // 2. Limit usage: 20 questions per hour per person
  const now = Date.now()
  const recent = (hits.get(user.id) ?? []).filter((t) => now - t < 3600_000)
  if (recent.length >= 20) return json({ error: 'Hourly question limit reached. Try again later.' }, 429)
  hits.set(user.id, [...recent, now])

  // 3. Validate input
  const raw = await req.text()
  if (raw.length > 80_000) return json({ error: 'Data too large' }, 413)
  let body: { question?: unknown; snapshot?: unknown }
  try { body = JSON.parse(raw) } catch { return json({ error: 'Invalid request' }, 400) }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : ''
  if (!question || typeof body.snapshot !== 'object' || body.snapshot === null) return json({ error: 'Question and data are required' }, 400)

  // 4. Call the model with the key held only on the server
  const provider = Deno.env.get('AI_PROVIDER') ?? 'anthropic'
  const model = Deno.env.get('AI_MODEL')
  const key = Deno.env.get('AI_API_KEY')
  if (!model || !key) return json({ error: 'AI is not configured on the server' }, 500)
  const prompt = `Business data (JSON):\n${JSON.stringify(body.snapshot)}\n\nQuestion: ${question}`
  let answer = ''
  try {
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error?.message ?? 'Model request failed')
      answer = d.choices?.[0]?.message?.content ?? ''
    } else {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 900, system: SYSTEM, messages: [{ role: 'user', content: prompt }] }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error?.message ?? 'Model request failed')
      answer = (d.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n')
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }

  // 5. Log who asked what (ignored if the table does not exist)
  await supa.from('ai_log').insert({ user_id: user.id, email: user.email, question })
  return json({ answer: answer || 'No answer returned.' })
})
