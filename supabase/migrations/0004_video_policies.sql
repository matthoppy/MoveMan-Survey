-- Finishes removing the service role from the request path.
--
-- Videos previously had no insert or update policy, on the assumption that
-- every write came from the service role. Now that the capture link writes
-- through token-scoped functions instead, the only remaining writer is a
-- signed-in surveyor attaching a video the customer emailed over — so that
-- belongs under row-level security like everything else.

drop policy if exists "create company videos" on public.videos;
create policy "create company videos" on public.videos
  for insert with check (
    exists (
      select 1 from public.surveys s
      where s.id = videos.survey_id and s.company_id = public.current_company_id()
    )
  );

drop policy if exists "update company videos" on public.videos;
create policy "update company videos" on public.videos
  for update using (
    exists (
      select 1 from public.surveys s
      where s.id = videos.survey_id and s.company_id = public.current_company_id()
    )
  ) with check (
    exists (
      select 1 from public.surveys s
      where s.id = videos.survey_id and s.company_id = public.current_company_id()
    )
  );

-- Appending to a recording in progress needs the file it is being written to,
-- and the customer's browser has no session to look it up with. Scoped to the
-- token's own survey so a stray video id cannot reach another one's recording.
create or replace function public.capture_video_by_id(p_token text, p_video_id uuid)
returns setof public.videos
language sql
stable
security definer
set search_path = public
as $$
  select v.*
    from public.videos v
    join public.surveys s on s.id = v.survey_id
   where v.id = p_video_id and s.capture_token = p_token
   limit 1;
$$;

revoke all on function public.capture_video_by_id(text, uuid) from public;
grant execute on function public.capture_video_by_id(text, uuid) to anon, authenticated;
