import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn("Supabase env vars are missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

// The placeholders only stop the build from crashing when the variables are missing.
// Sign-in will not work until the real values are set.
export const supabase = createClient(url || "https://placeholder.supabase.co", key || "placeholder-anon-key");
