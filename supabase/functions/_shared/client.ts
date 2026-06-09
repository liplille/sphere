// Client Supabase avec la clé service_role — contourne RLS.
// À utiliser UNIQUEMENT dans les Edge Functions, JAMAIS côté navigateur.
//
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement
// par Supabase dans le runtime des Edge Functions — pas besoin de les
// déclarer via `supabase secrets set`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
