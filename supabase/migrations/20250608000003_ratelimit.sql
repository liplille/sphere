-- ============================================================
-- 0003 — Rate limiting (protection des endpoints, dont /intention payant)
-- ============================================================

create table if not exists public.rate_limits (
  bucket       text primary key,            -- ex: "intention-ip:<hash>"
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

alter table public.rate_limits enable row level security;
-- aucune policy publique : seul service_role (via la fonction) y accède
grant all on public.rate_limits to service_role;

-- Fenêtre fixe atomique. Renvoie true si autorisé, false si limite atteinte.
create or replace function public.check_rate_limit(
  p_bucket text, p_max integer, p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.rate_limits%rowtype;
begin
  select * into rec from public.rate_limits where bucket = p_bucket for update;
  if not found then
    insert into public.rate_limits(bucket, window_start, count) values (p_bucket, now(), 1);
    return true;
  end if;
  if now() - rec.window_start > make_interval(secs => p_window_seconds) then
    update public.rate_limits set window_start = now(), count = 1 where bucket = p_bucket;
    return true;
  end if;
  if rec.count >= p_max then
    return false;
  end if;
  update public.rate_limits set count = count + 1 where bucket = p_bucket;
  return true;
end;
$$;

grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
