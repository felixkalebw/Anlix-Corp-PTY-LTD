# Anlix Corp order tracker (Next.js, JSX)

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase URL and anon key (leave it out to run local-only).
3. `npm run dev`, then open http://localhost:3000
4. In Supabase: run `supabase/schema.sql`, deploy `supabase/functions/ai-manager` (see the comments at the top of that file).

Screens not ported from the HTML version yet: production board, inventory, quality control, finance ledger, backups.
Their data is kept intact when this app saves, so nothing is lost if you still use the HTML file for them.
