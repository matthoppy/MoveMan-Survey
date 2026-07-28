-- Consent, and the ability to prove it.
--
-- A survey video is footage of the inside of someone's home, filmed by them
-- because we asked. Whether they agreed to that has to be a stored fact with a
-- timestamp, not a checkbox on a page that scrolls away — if a customer later
-- asks what was recorded and on whose say-so, "there was some small print"
-- is not an answer.

alter table public.surveys
  add column if not exists consented_at timestamptz;

comment on column public.surveys.consented_at is
  'When the customer accepted the recording notice on the capture page. Null means nobody has agreed to be filmed.';

-- Recorded from the capture link, which has no session — same token-scoped,
-- security-definer pattern as the other three capture functions in 0003.
create or replace function public.capture_record_consent(p_token text)
returns public.surveys
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.surveys;
begin
  -- coalesce, not a plain assignment: re-opening the link to send a second
  -- video must not move the timestamp of when they originally agreed.
  update public.surveys
     set consented_at = coalesce(consented_at, now())
   where capture_token = p_token
  returning * into result;

  if not found then
    raise exception 'unknown capture token' using errcode = 'no_data_found';
  end if;

  return result;
end;
$$;

revoke all on function public.capture_record_consent(text) from public;
grant execute on function public.capture_record_consent(text) to anon, authenticated;

-- The retention purge deletes by age, so this is the index it runs on.
create index if not exists idx_videos_created_at on public.videos (created_at);
