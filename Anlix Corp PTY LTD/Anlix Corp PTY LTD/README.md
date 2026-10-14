# Anlix Corp order tracker (Next.js, JSX)

Job cards linked to quotations and invoices, per-size cost and margin, payments with an audit trail,
break-even analysis, a Power BI-ready Supabase backend, and an AI assistant powered by OpenAI GPT-6 Luna.

## Run it

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL and anon key
   (leave it out to run on this device only).
3. `npm run dev`, then open http://localhost:3000

If you deploy on Netlify or Vercel, set the root directory to `Anlix Corp PTY LTD/Anlix Corp PTY LTD`
and add the same two environment variables there.

## Supabase setup

1. SQL Editor: run `supabase/schema.sql`, then the first-admin statement at the bottom with your email.
2. Edge Functions > Secrets: add `OPENAI_API_KEY` with your OpenAI key.
   Optional: `AI_MODEL` (defaults to `gpt-6-luna`), `AI_ALLOWED_EMAILS`, `ALLOWED_ORIGIN`.
3. Edge Functions: deploy `supabase/functions/ask-luna/index.ts` (editor or `supabase functions deploy ask-luna`).
   Keep "Verify JWT" on. Staff sign in to the tracker, so no passcode is needed.
4. Open the AI assistant screen, sign in, and ask a question.

The OpenAI key needs the Responses permission (under Model capabilities).

Screens not ported from the HTML version yet: production board, inventory, quality control, finance ledger, backups.
Their data is kept intact when this app saves, so nothing is lost if you still use the HTML file for them.
