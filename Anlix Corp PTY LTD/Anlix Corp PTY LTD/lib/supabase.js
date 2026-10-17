// One shared Supabase client for the whole app (it lives in supabaseClient.js).
// Having two separate clients is what caused the "Multiple GoTrueClient instances" warning.
// This file keeps the old import path working. It exports null when the Supabase variables are missing, which means local-only mode.
import { supabase as client, hasSupabase } from './supabaseClient'

export const supabase = hasSupabase ? client : null
