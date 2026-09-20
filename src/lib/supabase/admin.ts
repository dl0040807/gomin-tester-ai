import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only client using the service role key — bypasses RLS.
// Never import this from a Client Component; only from Server Components
// and Route Handlers, and only to serve the public invite-response flow
// where the visitor has no Supabase session of their own.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
