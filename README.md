# Removals Survey

Video surveying for removals companies. The customer films a walkthrough of their house
on their phone — talking as they go — and the app turns that into a room-by-room
inventory, a volume figure, a materials order and a crew and vehicle plan.

Videos are stored, not thrown away: every recording stays attached to its survey and can
be replayed, re-analysed or handed to a different surveyor.

## What it does

**Capture.** Each survey gets an unguessable link you send the customer. No login, no app
install. They can record there and then, or upload a video they've already taken. While
they record, the video is streamed to the server in five-second chunks, so a flat battery
halfway round the house costs you the last five seconds rather than the whole survey. Their
narration is transcribed live in the browser where it's supported.

**Analysis.** Keyframes are sampled from the video in the browser and sent, with the
narration transcript, to Claude acting as a surveyor. Sonnet is the default; each survey
records the model that produced it, so you can re-analyse the same recording on Opus and
compare the two inventories side by side before deciding what to run. It returns a room-by-room inventory
with quantities, who is packing each room, access observations, and — importantly — a list
of things it could not determine and a human must confirm.

**Estimating.** Everything downstream is deterministic and recomputed on every read, so
correcting an item moves the quote immediately. Nothing is cached and nothing goes stale.

**Pricing.** A rate card per company — crew rate, vehicle day rates, mileage,
materials, minimum charge, VAT — turns the estimate into a quote and a warehouse
picking list, both printable. Nothing is stored: change a rate and every open
survey reprices.

**Correction.** The inventory is fully editable. Quantities, volumes, fragile and dismantle
flags, packing level per room, access at both ends, distance. Items you add by hand survive
a re-analysis.

## Running it

```bash
npm install
cp .env.example .env.local     # add your ANTHROPIC_API_KEY
npm run dev
```

Then open http://localhost:3000.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Enables AI video analysis. Without it the app falls back to reading the narration transcript only. |
| `ANTHROPIC_MODEL` | Defaults to `claude-sonnet-5`. Set `claude-opus-5` for the harder tier. |
| `REMOVALS_SURVEY_DATA_DIR` | Where the SQLite database and video files are written. Defaults to `./data`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Set these three to switch to Postgres, accounts and object storage. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe key, used for signing in. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Optional.** Needed for Supabase video storage and the retention purge; the request path never uses it. |
| `VIDEO_STORAGE` | `local` or `supabase`. See the size ceiling below before choosing `supabase`. |
| `NEXT_PUBLIC_BASE_URL` | Used to build customer capture links. Falls back to the request's own host. |
| `TRANSCRIPTION_API_KEY` | Enables server-side transcription of narration. Strongly recommended — see below. |
| `TRANSCRIPTION_API_URL` | Defaults to OpenAI. Any Whisper-compatible endpoint works. |
| `TRANSCRIPTION_MODEL` | Defaults to `whisper-1`. |
| `NEXT_PUBLIC_COMPANY_NAME` | Named in the recording notice and the privacy notice. Both are shown to real customers. |
| `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` | Where a customer sends a deletion request. |
| `NEXT_PUBLIC_COMPANY_ADDRESS` | Optional postal address for the privacy notice. |
| `VIDEO_RETENTION_DAYS` | How long videos are kept. Defaults to 90. The customer is told this number. |
| `RETENTION_PURGE_TOKEN` | Shared secret for the purge endpoint. Unset means the purge refuses to run. |

```bash
npm test        # 114 tests over estimating, pricing, uploads, retention and access control
npm run build   # production build + type check
```

The same three run in CI on every push (`.github/workflows/ci.yml`). The build is
there deliberately: it catches what the other two cannot — a server component
importing something that only exists in the browser, a page that throws while
rendering.

## Running it on Supabase

With no Supabase keys the app uses local SQLite and local disk, has no accounts, and is
wide open — fine for `npm run dev`, not for anything real. Set the three Supabase variables
and it switches to Postgres, real accounts and object storage, with no code change: the
database and storage sit behind driver interfaces (`src/lib/db/`, `src/lib/storage/`) and
the routes never learn which one they're talking to.

To set it up:

1. Create a Supabase project and apply everything in `supabase/migrations/` in order.
   `0001` builds the schema and row-level security, `0002` the private video bucket, `0003`
   the capture-link functions, `0004` the video policies, `0005` the API-surface hardening.
2. Create your company and attach yourself to it:

   ```sql
   insert into companies (name) values ('Your Removals Ltd');
   update profiles
      set company_id = (select id from companies limit 1), role = 'admin'
    where id = '<your auth user id>';
   ```

3. Add users through the Supabase dashboard and set each one's `company_id`. A new user
   gets a profile row automatically but no company, so they see nothing until you assign
   one — deliberately, so a half-finished invite can't read customer data.

**How access control works.** Every survey belongs to a company, and row-level security
restricts reads and writes to the company of the signed-in user. Middleware redirects
signed-out users to `/login` — except on the customer capture routes, which must stay open
because someone filming their house has no account. The one test file you should never
delete is `tests/auth-paths.test.ts`, which pins exactly which paths are public.

**The capture link never uses the service role.** The obvious way to serve a route with no
session is to give the app the service-role key, but that hands a credential which bypasses
row-level security entirely to the one route anybody on the internet can reach with a
guessed URL. Instead the token is checked *inside the database*: three `security definer`
functions (`survey_by_capture_token`, `capture_set_transcript`, `capture_upsert_video`) are
granted to the anonymous role, and each resolves exactly one survey by its token and can
touch nothing else. The whole request path — office and customer alike — runs on the
publishable key.

Supabase's database linter will flag those three functions as "public can execute security
definer function". That is expected and reviewed: it is the design, and the alternative is
strictly worse. Everything else the linter flagged has been fixed in `0005`.

**Where the video ends up, and the ceiling you will meet first.** Object storage caps
how big a single object can be, and on Supabase that cap comes from the project's plan —
**50 MB on the free plan**. A phone records at roughly 2.5 Mbps, so 50 MB is under three
minutes. A survey longer than that uploads every chunk successfully and then fails at the
very end, when the assembled file is pushed to the bucket, after the customer has finished
filming and walked away.

So `VIDEO_STORAGE=local` is the right default for most deployments: the app already
requires a persistent volume for staging chunks, so keeping the finished file there adds
no new requirement and no size limit. Use `supabase` when the volume is the thing you
don't trust, and only with a plan whose object limit covers a full survey.

**How video storage works.** Chunks are staged on local disk while the customer is still
filming — that's what makes a flat battery mid-survey survivable — and the finished file is
uploaded to a private bucket in one go, with the staging copy deleted. Playback hands the
browser a one-hour signed URL, so video never passes back through the app. The trade-off is
that the server needs transient disk for the length of an active recording; if you deploy
somewhere without writable disk, drop the chunked capture path and accept whole-file uploads
only.

### Transcription

What the customer says is the highest-signal part of a survey — it's what tells you an item
is staying behind, or that they want the kitchen packed. The browser transcribes live while
they record, but only some browsers support that (Firefox doesn't at all), so a share of
surveys would otherwise arrive with no narration at all.

With `TRANSCRIPTION_API_KEY` set, the surveyor can transcribe any recording after the fact,
and analysis does it automatically when a survey has no transcript. The audio is extracted
from the video **in the browser**, downmixed to 16 kHz mono and split into eight-minute
chunks — about a fortieth of the video's size — so the server still never decodes media and
long surveys stay inside the 25 MB limit transcription APIs impose. Chunks overlap by two
seconds and the results are stitched back together on the word overlap, so nothing is lost
at a seam.

It speaks the OpenAI audio-transcriptions API shape, which OpenAI, Groq and self-hosted
whisper.cpp servers all implement — point `TRANSCRIPTION_API_URL` wherever you like.

### Without an API key

The app still works. `offlineAnalyse` reads the transcript for catalogue items, quantities
("six dining chairs", "2 armchairs") and packing intent ("we'll do our own boxes" vs "can
you pack the kitchen"), and produces a deliberately conservative inventory. It flags itself
loudly at the top of every survey it touches, because it has not seen the video and must
not be quoted from unchecked.

## How the numbers are worked out

All of this lives in `src/lib/estimate/` and is pure — same survey in, same numbers out.

**Volume** (`volume.ts`, `catalog.ts`) — 90-odd household items with trade volumes in cubic
feet: a 3-seater is 45, a double bed 45, a double wardrobe 60. The figures are deliberately
generous; under-reading volume is what leaves goods on the pavement. Packed cartons add
their own volume on top.

**Cartons** (`cartons.ts`) — driven by the packing level set against each room, using
per-room-type profiles (a kitchen is carton-heavy and fragile, a study is book-carton heavy
because paper is dense, a bathroom barely registers). A part pack is 40% of a full pack.
Wardrobe cartons follow the wardrobes, and only when the crew is doing the packing.

**Materials** (`materials.ts`) — cartons, tape, paper and bubble wrap from the packing
brief; TV boxes, picture boxes and mattress covers from the inventory; blankets and floor
protection from the volume. Every line records the basis it was derived from, so a surveyor
can argue with a number instead of taking it on trust.

**Labour and crew** (`crew.ts`) — the part that answers "how many men".

- Loading runs at 80 cu ft per person per hour with clear ground-floor access. Unloading is
  20% faster — no decisions about what goes where.
- That rate is then multiplied by an *access factor* for each end of the move. Ground floor
  with the van outside is 1.0. Second floor with no lift is 0.68; a lift caps it at 0.90.
  Long carries, restricted parking, awkward stairs and hoist access all compound on top.
  The floor is 0.3 — beyond that the model isn't calibrated and you should be pricing it by
  hand.
- Packing, dismantling and reassembly are added per carton and per item.
- Driving covers depot → collection → delivery → depot, at a speed set by road type, and
  counts against every crew member because they all travel.
- Crew size is the smallest that fits the work into a normal day, then capped at one person
  per 120 cu ft — past that density people queue on the stairs and extra bodies stop buying
  time. Requirements override that cap: two-person lifts, hoist access, and stair relays
  above the first floor.
- Vehicles are chosen by exhaustive search for the fewest vans that take the load in one
  trip, breaking ties on least wasted capacity. A greedy largest-first fill gets this wrong
  — it puts 900 cu ft into two Lutons instead of one 7.5-tonner.

Warnings are raised rather than silently absorbed: specialist items (pianos, safes,
aquariums), loads within 5% of van capacity, days that won't fit in a day, and journeys
that breach drivers' hours.

The constants are all named and at the top of their files. Tune them to your own crews —
`LOAD_RATE_CUFT_PER_MAN_HOUR` and `CUFT_PER_USEFUL_CREW` are the two that move the answer
most.

## Layout

```
src/lib/estimate/     volume, cartons, materials, crew — pure, tested
src/lib/analysis/     Claude prompt and schema, result normalisation, offline fallback
src/lib/catalog.ts    the volume table and the free-text matcher
src/lib/client/       browser-side frame extraction, speech capture, chunked upload
src/app/capture/      the public page the customer uses
src/app/surveys/      the surveyor's workspace
src/app/api/          surveys, capture, video streaming, analysis
src/lib/db/           sqlite and supabase drivers behind one async interface
src/lib/storage/      local disk and supabase object storage, same idea
supabase/migrations/  schema, row-level security, private video bucket
src/lib/pricing/      rate card, quote arithmetic — pure, tested
tests/                114 tests over estimating, pricing, uploads and access control
```

Video frames are extracted in the browser with a canvas, and audio with the Web Audio API,
so there is no ffmpeg dependency and the server never decodes media — it only stores bytes
and forwards frames or WAV chunks. Video is served with HTTP range support so the surveyor
can scrub rather than wait for a download.

The capture page holds a screen wake lock while recording, so a phone that would otherwise
sleep mid-walkthrough doesn't stop the recorder. The lock is re-taken whenever the page
becomes visible again, and a browser that refuses it just records as before.

## Deploying

The app needs a **Node runtime with a writable disk**, and it needs to run as a
**single instance**. Both fall out of the same design decision, explained below.

### Railway, step by step

1. **New project → Deploy from GitHub repo**, pointed at this repository.
   `railway.json` supplies the build and start commands, the health check and
   `numReplicas: 1`.
2. **Add a volume**, mounted at `/data`. This is the one step that is easy to
   skip and expensive to skip — see below.
3. **Set the variables**:

   ```
   REMOVALS_SURVEY_DATA_DIR=/data
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ANTHROPIC_API_KEY=...
   NEXT_PUBLIC_COMPANY_NAME=Your Removals Ltd
   NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL=privacy@yourfirm.co.uk
   VIDEO_RETENTION_DAYS=90
   RETENTION_PURGE_TOKEN=<a long random string>
   ```

   `PORT` is supplied by Railway. `NEXT_PUBLIC_BASE_URL` can be left unset —
   the capture link is built from the request's own host.
4. **Add a cron job** hitting the retention purge daily:

   ```bash
   curl -fsS -X POST https://your-app.up.railway.app/api/retention/purge \
        -H "authorization: Bearer $RETENTION_PURGE_TOKEN"
   ```
5. **Check `/api/health`.** It reports which services are configured and
   actually writes a file to prove the disk is there. Anything reading
   `DISABLED` or `INCOMPLETE` is something a customer would notice.
6. **Open `/capture/diagnostics` on a real phone** — an iPhone and an Android —
   before sending a link to anybody. Headless Chromium proves the code paths
   and proves nothing about Safari.

Render, Fly.io or any VPS work the same way: build `npm run build`, start
`npm start`, one instance, a persistent disk mounted wherever
`REMOVALS_SURVEY_DATA_DIR` points.

HTTPS is not optional — phone browsers refuse camera access without it, so a
LAN address will not do even for testing.

### Why single-instance, and when that stops being true

While a customer is filming, their browser posts a video chunk every five
seconds and the server appends each one to the same file on local disk. That is
what makes a flat battery mid-survey survivable — the recording is already
saved. It also means every chunk of a given recording has to reach the same
machine, and the same disk has to still be there a minute later.

So these deployment shapes will lose recordings:

- **Serverless** (Vercel, Cloudflare Workers, Lambda) — each request may land on
  a different instance, so chunks scatter and the video is corrupt.
- **More than one instance** behind a load balancer, unless sessions are pinned.
- **No persistent volume** — the container's filesystem is wiped on every
  deploy, taking any recording in progress with it.

None of these fail loudly. You get a video that will not play, which is the
worst way to find out. `/api/health` catches the third case; the first two are
yours to avoid.

A single container comfortably handles a removals office: chunks are small, and
the only sustained work is streaming bytes to disk. If you outgrow it, the fix
is to stage chunks in object storage instead of on disk — `src/lib/storage/` is
the only place that changes, and the driver interface is already there for it.

## Before this goes near a customer

- **Run it on Supabase, not the local driver.** Without the Supabase keys there
  are no accounts and no isolation: anyone who reaches the app sees every
  survey, and the database is a file on disk that cannot scale past one
  instance. See the setup above.
- **Fill in who you are.** `NEXT_PUBLIC_COMPANY_NAME` and
  `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL` are named in the notice the customer
  agrees to before filming. Until they are set, the privacy page says it is not
  fit to show anyone, because a notice that cannot name who holds the footage
  or where to write to have it deleted is not a notice.
- **Turn the retention purge on.** `RETENTION_PURGE_TOKEN` unset means the
  endpoint refuses to run, so nothing is ever deleted — while the notice keeps
  telling customers their video goes after 90 days.
- **Enter your rates.** Until you do, every quote is worked out from example
  figures and says so in red. They are plausible and they are somebody else's
  margin.
- **Turn on leaked-password protection.** Supabase can check new passwords
  against HaveIBeenPwned; it is off by default. One toggle in Auth settings, and
  worth it for an app holding footage of customers' homes.
- **Test on real phones.** `/capture/diagnostics` reports what a handset can
  actually record and whether it can read its own recording back. This is the
  one thing automated tests cannot cover.
- **Judge the AI on real footage.** Everything here is verified against
  synthetic recordings, which proves the plumbing and says nothing about
  whether the model spots a wardrobe in a cluttered bedroom. Record a real
  walkthrough, compare the inventory against the room, and re-run the same
  recording on `claude-opus-5` if it misses things — every survey stores the
  model that produced it, so the two are directly comparable.
- **Confirm the carton sizes.** The large carton is set from real stock
  (610 × 457 × 457mm). The medium, book and wardrobe cartons are standard trade
  sizes and are marked unconfirmed in `src/lib/estimate/cartons.ts`. Volumes are
  derived from the dimensions, so correcting them reprices everything
  downstream.
- **Live video is one-way.** The customer records and it streams to the server
  as they go. A two-way call where the surveyor talks them round the house needs
  WebRTC signalling and a TURN server; the capture flow is structured so that
  can be added alongside.
