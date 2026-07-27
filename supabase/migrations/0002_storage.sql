-- Private bucket for survey videos.
--
-- No policies are granted to authenticated users: survey video is footage of
-- the inside of a customer's home, and it is only ever reached through the
-- app's own endpoint, which checks the caller can see the parent survey and
-- then hands back a short-lived signed URL. Nothing is world-readable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'survey-videos',
  'survey-videos',
  false,
  2147483648, -- 2 GB; a long walkthrough at phone bitrates
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/3gpp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
