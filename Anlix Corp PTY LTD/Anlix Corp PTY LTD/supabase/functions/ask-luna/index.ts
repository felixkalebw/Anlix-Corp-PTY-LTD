// Supabase Edge Function: ask-luna
// Answers questions about the Anlix Corp tracker data with OpenAI GPT-6 Luna.
//
// Secrets (Supabase > Edge Functions > Secrets). The key stays on the server, never in the browser:
//   OPENAI_API_KEY      required. Your OpenAI secret key.
//   AI_MODEL            optional. Defaults to gpt-6-luna.
//   AI_ALLOWED_EMAILS   optional. Comma-separated emails allowed to ask. Any signed-in staff member if empty.
//   ALLOWED_ORIGIN      optional. For example https://your-site.netlify.app. Defaults to any site.
//
// Staff must be signed in to the tracker, so no passcode is needed. Keep "Verify JWT" switched on.
// Deploy:  supabase functions deploy ask-luna
// The ai_log table used at the end is created by supabase/schema.sql.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
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

  // 4. Ask GPT-6 Luna with the key held only on the server
  const key = Deno.env.get('OPENAI_API_KEY')
  const model = Deno.env.get('AI_MODEL') ?? 'gpt-6-luna'
  if (!key) return json({ error: 'OPENAI_API_KEY is not set on the server' }, 500)
  let answer = ''
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        instructions: SYSTEM,
        input: `Business data (JSON):\n${JSON.stringify(body.snapshot)}\n\nQuestion: ${question}`,
        reasoning: { effort: 'low' },
        max_output_tokens: 1500,
      }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error?.message ?? `OpenAI returned error ${r.status}`)
    answer = d.output_text ??
      (d.output ?? [])
        .flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content ?? [])
        .filter((c: { type?: string }) => c.type === 'output_text')
        .map((c: { text?: string }) => c.text ?? '')
        .join('\n')
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }

  // 5. Log who asked what (ignored if the table does not exist)
  await supa.from('ai_log').insert({ user_id: user.id, email: user.email, question })
  return json({ answer: answer || 'No answer returned.' })
})
