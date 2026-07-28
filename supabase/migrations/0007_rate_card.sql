-- What a company charges.
--
-- Kept on the company rather than in configuration because it is the one part
-- of the estimating chain that is genuinely theirs: two removals firms looking
-- at the same house agree on the cubic feet and disagree on the price. It also
-- means row-level security already protects it — a rate card is commercially
-- sensitive, and the existing company scoping is exactly the boundary wanted.
--
-- Null means "never set", which the app shows as a warning rather than
-- silently quoting from example figures.

alter table public.companies
  add column if not exists rate_card jsonb;

comment on column public.companies.rate_card is
  'Crew, vehicle, mileage and materials rates used to price a survey. Null until the company sets it.';

-- companies had a select policy and nothing else, so writing the rate card
-- would have been refused by row-level security — and a Postgres update that
-- matches no rows is not an error, so the settings page would have reported
-- success and saved nothing.
--
-- Restricted to admins: a rate card is the company's margin, and a surveyor
-- correcting an inventory has no reason to be able to move it.
drop policy if exists "admins update own company" on public.companies;
create policy "admins update own company" on public.companies
  for update
  using (
    id = public.current_company_id()
    and exists (
      select 1 from public.profiles
       where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (id = public.current_company_id());
