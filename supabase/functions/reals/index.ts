// /functions/v1/reals — implémenté à une étape ultérieure (voir specs).
import { handleCors, corsHeaders } from "../_shared/cors.ts";

Deno.serve((req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  return new Response(
    JSON.stringify({ error: "Not implemented yet" }),
    { status: 501, headers: { ...corsHeaders(req.headers.get("origin")), "content-type": "application/json" } },
  );
});
