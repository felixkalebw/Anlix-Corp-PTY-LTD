import { createClient } from "@supabase/supabase-js";

// If you already have a browser Supabase client in /lib, keep yours and change the import in the other files.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
