import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Not using the generic Database<> schema param here: the installed
// @supabase/supabase-js version requires a Relationships/Views/Functions
// shape that fights simple hand-written table types. Reads are typed via
// `.returns<T>()` at the call site instead; inserts pass plain objects.
export const supabase = createClient(
  supabaseUrl || "https://unavailable.supabase.co",
  supabaseAnonKey || "public-anon-key",
);
