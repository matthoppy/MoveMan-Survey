-- The customer capture path, without the service role.
--
-- Someone filming their own house has no account, so the capture routes have
-- no session to run under. The obvious fix — give the app the service role key
-- — hands the customer-facing path a credential that bypasses row-level
-- security entirely, which is a lot of authority to expose on the one route
-- anybody on the internet can reach with a guessed URL.
--
-- Instead the capture token is checked inside the database. These functions are
-- security definer, so they can reach past RLS, but each one will only ever
-- touch the single survey whose token was supplied. Possession of the token is
-- the credential, and the blast radius is exactly one survey.

-- Returns the survey behind a capture link, or nothing.
create or replace function public.survey_by_capture_token(p_token text)
returns setof public.surveys
language sql
stable
security definer
set search_path = public
as $$
  select * from public.surveys where capture_token = p_token limit 1;
$$;

-- Stores narration captured while the customer films.
create or replace function public.capture_set_transcript(
  p_token text,
  p_text text,
  p_append boolean default false
)
returns public.surveys
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.surveys;
begin
  update public.surveys
     set transcript = case
           when p_append then trim(both from coalesce(transcript, '') || ' ' || coalesce(p_text, ''))
           else coalesce(p_text, '')
         end
   where capture_token = p_token
  returning * into result;

  if not found then
    raise exception 'unknown capture token' using errcode = 'no_data_found';
  end if;

  return result;
end;
$$;

-- Registers or updates the recording arriving from a capture link, and moves
-- the survey on once the upload is complete.
create or replace function public.capture_upsert_video(
  p_token text,
  p_video_id uuid,
  p_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_duration_sec double precision,
  p_mode text,
  p_complete boolean
)
returns public.videos
language plpgsql
security definer
set search_path = public
as $$
declare
  target_survey uuid;
  result public.videos;
begin
  select id into target_survey from public.surveys where capture_token = p_token;
  if target_survey is null then
    raise exception 'unknown capture token' using errcode = 'no_data_found';
  end if;

  if p_video_id is null then
    insert into public.videos (survey_id, filename, mime_type, size_bytes, duration_sec, mode, complete)
    values (target_survey, p_filename, p_mime_type, coalesce(p_size_bytes, 0), p_duration_sec, p_mode, coalesce(p_complete, false))
    returning * into result;
  else
    -- Scoped to this survey, so a token cannot be used to touch another's video.
    update public.videos
       set size_bytes = coalesce(p_size_bytes, size_bytes),
           duration_sec = coalesce(p_duration_sec, duration_sec),
           complete = coalesce(p_complete, complete)
     where id = p_video_id and survey_id = target_survey
    returning * into result;

    if not found then
      raise exception 'that recording belongs to a different survey' using errcode = 'check_violation';
    end if;
  end if;

  if coalesce(p_complete, false) then
    update public.surveys
       set status = 'video_received'
     where id = target_survey and status = 'awaiting_video';
  end if;

  return result;
end;
$$;

-- Only these three are reachable without a session; the tables stay closed.
revoke all on function public.survey_by_capture_token(text) from public;
revoke all on function public.capture_set_transcript(text, text, boolean) from public;
revoke all on function public.capture_upsert_video(text, uuid, text, text, bigint, double precision, text, boolean) from public;

grant execute on function public.survey_by_capture_token(text) to anon, authenticated;
grant execute on function public.capture_set_transcript(text, text, boolean) to anon, authenticated;
grant execute on function public.capture_upsert_video(text, uuid, text, text, bigint, double precision, text, boolean) to anon, authenticated;
