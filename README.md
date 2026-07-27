# MoveMan Survey

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
narration transcript, to Claude acting as a surveyor. It returns a room-by-room inventory
with quantities, who is packing each room, access observations, and — importantly — a list
of things it could not determine and a human must confirm.

**Estimating.** Everything downstream is deterministic and recomputed on every read, so
correcting an item moves the quote immediately. Nothing is cached and nothing goes stale.

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
| `ANTHROPIC_MODEL` | Defaults to `claude-opus-5`. |
| `MOVEMAN_DATA_DIR` | Where the SQLite database and video files are written. Defaults to `./data`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Set these three to switch to Postgres, accounts and object storage. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe key, used for signing in. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Bypasses row-level security — never expose it. |
| `NEXT_PUBLIC_BASE_URL` | Used to build customer capture links. Falls back to the request's own host. |
| `TRANSCRIPTION_API_KEY` | Enables server-side transcription of narration. Strongly recommended — see below. |
| `TRANSCRIPTION_API_URL` | Defaults to OpenAI. Any Whisper-compatible endpoint works. |
| `TRANSCRIPTION_MODEL` | Defaults to `whisper-1`. |

```bash
npm test        # 56 tests over the estimating engine, transcripts and access control
npm run build   # production build + type check
```

## Running it on Supabase

With no Supabase keys the app uses local SQLite and local disk, has no accounts, and is
wide open — fine for `npm run dev`, not for anything real. Set the three Supabase variables
and it switches to Postgres, real accounts and object storage, with no code change: the
database and storage sit behind driver interfaces (`src/lib/db/`, `src/lib/storage/`) and
the routes never learn which one they're talking to.

To set it up:

1. Create a Supabase project and apply the migrations in `supabase/migrations/` in order —
   `0001_init.sql` builds the schema and row-level security, `0002_storage.sql` creates the
   private video bucket.
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
because someone filming their house has no account. Those routes authenticate on the
survey's unguessable capture token instead and are served with the service role, and the
one test file you should never delete is `tests/auth-paths.test.ts`, which pins exactly
which paths are public.

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
tests/                56 tests over estimating, transcripts and access control
```

Video frames are extracted in the browser with a canvas, and audio with the Web Audio API,
so there is no ffmpeg dependency and the server never decodes media — it only stores bytes
and forwards frames or WAV chunks. Video is served with HTTP range support so the surveyor
can scrub rather than wait for a download.

The capture page holds a screen wake lock while recording, so a phone that would otherwise
sleep mid-walkthrough doesn't stop the recorder. The lock is re-taken whenever the page
becomes visible again, and a browser that refuses it just records as before.

## Before this goes near a customer

- **Run it on Supabase, not the local driver.** Without the Supabase keys there are no
  accounts and no isolation: anyone who reaches the app sees every survey, and the database
  is a file on disk that can't scale past one instance. See the setup above.
- **The Supabase path has not been exercised against a live project.** The schema, policies,
  drivers and auth are written and the access-control logic is tested, but no query has run
  against a real Postgres. Apply the migrations to a scratch project and walk one survey
  end to end before trusting it.
- **No pricing.** The app produces volume, materials, crew, vehicles and hours. Your rate
  card turns that into money, and that's deliberately not baked in.
- **Live video is one-way.** The customer records and it streams to the server as they go.
  A two-way call where the surveyor talks them round the house needs WebRTC signalling and
  a TURN server; the capture flow is structured so that can be added alongside.
- **Retention.** Survey videos are personal data showing the inside of someone's home.
  Nothing deletes them at present — add a retention policy that matches your privacy notice.
