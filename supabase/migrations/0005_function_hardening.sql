-- Tightens what is reachable over the REST API, following the database linter.
--
-- Two of these functions are triggers and were never meant to be callable at
-- all; one is a helper that policies use internally. None of them belong on the
-- public API surface.
--
-- The three capture_* functions stay deliberately executable by `anon`, and the
-- linter will keep flagging them. That is the design: the customer filming
-- their house has no account, and granting these three narrow, token-scoped
-- functions is a far smaller exposure than shipping the service-role key to
-- the request path. Each one resolves exactly one survey, by a 32-character
-- unguessable token, and can touch nothing else.

-- Pin the search path so the trigger cannot be redirected by a caller's own.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger functions: invoked by the database, never by a client.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Used inside row-level security policies, which are evaluated as the querying
-- role — so `authenticated` needs it, and nobody else does.
revoke all on function public.current_company_id() from public, anon;
grant execute on function public.current_company_id() to authenticated;

-- Housekeeping: the row-level security self-test used during setup.
drop function if exists public.__rls_selftest();
