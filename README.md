# shotsort

Sort a folder of camera files into one folder per shooting day, using the date
the camera wrote inside each file. No dependencies, no exiftool.

## Install

```sh
npm install -g shotsort
```

Or run it without installing anything:

```sh
npx shotsort ~/Import
```

Node 18 or newer. Then `shotsort --help`, or `man shotsort` for the full
manual.

From a clone instead:

```sh
git clone https://github.com/mativp/shotsort.git
cd shotsort
npm install -g .
```

If your npm does not install man pages, copy it yourself:

```sh
cp man/shotsort.1 /usr/local/share/man/man1/
```

## Use

Copy everything off the card however you like, then point it at the folder:

```sh
shotsort                                # print the options, sort nothing
shotsort -n -s ~/Import -d ~/Photos     # see the plan, change nothing
shotsort -s ~/Import -d ~/Photos        # sort it
```

Files are **copied, never moved**, unless you ask for `--move`. A mistaken run
therefore costs nothing but disk space, and the folder you copied off the card
stays exactly as it came. Running it a second time does nothing.

Every file is examined and its destination decided **before anything is
written**, so nothing moves until the whole plan is settled — and `-n` prints
that same plan without carrying it out.

Sorting a folder in place works too, and then the day folders sit alongside the
`DCIM` you copied:

```sh
shotsort ~/Import      # ~/Import holds both DCIM and the sorted copies
shotsort -m ~/Import   # the files move instead, and DCIM is removed after
```

You always have to name the folder. Run with no arguments `shotsort` prints
its options and sorts nothing, and it never falls back to the folder you
happen to be standing in — sort the current one with `shotsort .` if that is
what you mean.

## Options

### Where things go

| | |
|---|---|
| `-s`, `--source FOLDER` | The folder to sort. The same as naming it without a flag, and worth spelling out whenever `--dest` is used too, so it is plain which folder is read and which is written. May be given more than once. |
| `-d`, `--dest FOLDER` | Put the day folders in `FOLDER` instead of inside the source folder. With copying left as the default, this builds a sorted library and leaves the source exactly as it came off the card. |
| `-n`, `--dry-run` | Print the plan and change nothing. The plan shown is the one that would be carried out, computed by the same code. |
| `-m`, `--move` | Move the files rather than copying them, leaving each source folder empty and then removing it. Without this the originals are left exactly where they are, so the source folder ends up holding both them and the sorted copies unless `--dest` sends the copies elsewhere. |
| `--layout FORMAT` | How to name each day folder. `%Y` is the year, `%m` the month, `%d` the day, and `%F` all three joined by dashes. A slash makes a subfolder, so `--layout '%Y/%F'` gives `2026/2026-08-27`. Must be a relative path holding at least one date escape. Default `%Y-%m-%d`. |
| `--day-start HOUR` | The hour at which one shooting day becomes the next. See below. An hour from 0 to 12, default `0`. |

#### `--day-start`

A wedding shot from 20:00 on the 27th until 01:30 on the 28th is one evening's
work, but with the day turning at midnight it lands in two folders:

```
shotsort ~/Import                shotsort --day-start 4 ~/Import
  2026-08-27/  ← 20:00-23:59       2026-08-27/  ← the whole night
  2026-08-28/  ← 00:00-01:30
```

`--day-start 4` moves the boundary to 04:00, so anything shot before 04:00 is
filed under the previous day. Any hour from 0 to 12.

#### Building a library

```sh
shotsort -s ~/Import -d ~/Pictures/2026
```

Reads `~/Import`, writes the day folders into `~/Pictures/2026`, and leaves
`~/Import` exactly as it came off the card. Add `-m` to move rather than copy;
drop `-d` and the day folders appear inside the source folder instead.

### Files that record no date

Stills and video are both filed by the clock the camera was set to, so nothing
here applies to them. AVCHD clips (`.MTS`, `.M2TS`) and HLG photos (`.HSP`) are
the exception: no date this reads is stored inside them, leaving only the date
the filesystem keeps. Read [What it reads](#what-it-reads) for why that date is
sometimes worthless and how `shotsort` tells the difference.

| | |
|---|---|
| `--use-filesystem-date` | Date every file that records no date inside itself by the date the filesystem keeps, without checking that date first. |
| `--ignore-filesystem-date` | Date none of them that way: every file that records no date inside itself goes to `undated/`. |

### Output

| | |
|---|---|
| `-v`, `--verbose` | Print every file as it is placed, as `source -> destination`. Files already in the right place are not printed. |
| `-q`, `--quiet` | Print nothing but errors. |
| `--json` | Print the plan and the result as JSON on standard output: every file with the folder chosen for it, the clock the date came from, and what was done, and a summary carrying everything the notes on standard error would have said. |

### Help

| | |
|---|---|
| `-h`, `--help` | Print the usage text and exit, exactly as running `shotsort` with no arguments does. |
| `-V`, `--version` | Print the version and exit. |

Short options may be run together: `-nv` is `-n -v`. A `--` argument ends
option parsing.

### Exit status

| | |
|---|---|
| `0` | Every file was placed. |
| `1` | Some files were not placed, or none were found. |
| `2` | The command line was wrong, naming no folder to sort included. Running `shotsort` with no arguments at all therefore prints the usage text and exits `2`. |

## How files are grouped

The day comes from the date inside the file, so two frames that happen to share
a file number are told apart by when they were shot, not by which card folder
they came from:

```
DCIM/100_PANA/P1000001.RW2   27 May   →   2026-05-27/P1000001.RW2
DCIM/102_PANA/P1000001.RW2   30 May   →   2026-05-30/P1000001.RW2
```

Different days, so nothing clashes and no subfolders are needed. Shoot both on
the same day and the one name now belongs to two different photographs, so each
gets a numbered subfolder of that day, oldest first:

```
DCIM/100_PANA/P1000001.RW2   27 May, 14:00   →   2026-05-27/01/P1000001.RW2
DCIM/100_PANA/P1000001.JPG   27 May, 14:00   →   2026-05-27/01/P1000001.JPG
DCIM/102_PANA/P1000001.RW2   27 May, 21:30   →   2026-05-27/02/P1000001.RW2
DCIM/102_PANA/P1000001.JPG   27 May, 21:30   →   2026-05-27/02/P1000001.JPG
```

The raw and the JPEG of one shot stay together, because they are numbered by
shooting time and share it. A file whose name clashes with nothing stays
directly in the day folder, and two copies of the *same* photograph are a
duplicate rather than a clash, so they collapse into one file.

## What it reads

Stills: JPEG, MPO, TIFF, HSP, HIF, HEIC, AVIF, and Canon THM sidecars.
Raw: RW2, RAW, RWL (Panasonic), CR2, CR3, CRM, CRW (Canon), NEF, NRW (Nikon),
ARW, ARQ, SR2, SRF (Sony), ORF (Olympus, OM System), RAF (Fujifilm), PEF
(Pentax), MRW (Minolta), X3F (Sigma), SRW, ERF, 3FR, IIQ, MOS, MEF, DCR, KDC,
and DNG from anyone.
Video: MP4, MOV, M4V, 3GP, MTS, M2TS, AVI, and the LRV, INSV and 360 clips
action cameras and drones write.

The extension decides only which files are picked up; which parser runs is
decided by the file's leading bytes, so a mislabelled file still reads
correctly.

Most of those raws are a TIFF container and one parser reads them all — Olympus
and Panasonic simply stamp a different signature in the header, and BigTIFF
widens every count and offset from four bytes to eight. Four more wrap a TIFF
block somewhere else and hand it to that same parser: Canon CR3 and CRM bury
one in `moov/uuid/CMT2`, HEIF and AVIF store one as an item the `meta` box
points at, Fujifilm RAF gives the offset of a complete JPEG in bytes 84–87 of
its header, and Minolta MRW wraps one in a `\0TTW` block.

Two predate all of that and keep a plain Unix timestamp instead: Canon CRW
holds one in the CIFF heap its trailing pointer leads to, and Sigma X3F as a
`TIME` property in a UTF-16 property list. Both are read as the camera's own
clock and both are checked for a plausible year, so a misread yields no date
rather than a wrong one.

**Not read yet:** AVCHD clips (`.MTS`, `.M2TS`) and HLG photos (`.HSP`). Also
unread, and unlikely to change: the cinema containers `.MXF`, `.BRAW` and
`.R3D`, and Matroska `.MKV`, whose only standard date is UTC with no local
clock to recover.

The date comes from the first of these that answers:

1. **EXIF** `DateTimeOriginal` / `CreateDate` / `ModifyDate` — every still and
   every raw listed above.
2. **The JPEG embedded in a raw**, for raws that carry the date nowhere else.
3. **A video clock that names its own timezone** — the `©day` user data Canon
   and Nikon write, Apple's `com.apple.quicktime.creationdate`, or the EXIF in
   the thumbnail Canon stores beside the clip. The local time is taken as the
   camera's own clock and the offset discarded, which is the point: it is what
   the photographer saw on the back of the camera.
4. **`moov/mvhd`**, read verbatim, when the clip named no zone. Panasonic
   writes the camera's clock there, so nothing is converted.
5. **The other format of the same shot** — the JPEG beside a raw, or the THM
   beside a Canon AVI. Matched on folder and file name, and failing that on
   file name alone, but only when exactly one shot on the whole card goes by
   that name, so a dual-slot body that split raw and JPEG across two cards
   still pairs up while two cameras that both wrote `DSC_0001` do not.
6. **The date the filesystem keeps**, for AVCHD clips and HLG photos. Days
   containing such files are marked `~`.

Step 5 is only worth anything if whatever copied the card kept those dates.
`cp` without `-p` does not: it stamps every file with the moment of the copy.
`shotsort` notices — a filesystem date well after the newest date any file
actually records is the moment of a copy, not a shooting time — and puts those
files in `undated/` rather than a wrong day. Copy with `ditto`, `cp -p` or
`rsync -a` and they sort correctly.

## Safety

Nothing is ever overwritten. When one day holds two different photos with the
same file name, each goes into a numbered subfolder of that day, oldest first:

```
2026-09-01/01/A9999.RW2      shot at 10:00
2026-09-01/02/A9999.RW2      shot at 22:00
2026-09-01/A9999.JPG         clashes with nothing, so it stays put
```

That case is real rather than theoretical: a camera reuses file numbers when
its counter wraps, and again across `100_PANA` and `101_PANA`. The formats of
a single shot are not affected, since a `.RW2` and a `.JPG` do not share a
name. A name already taken by *identical* bytes means the file is already
sorted, so it is skipped (`--move` drops the stray original instead); that
check is a full byte comparison, not a guess from the size. Under `--move`, a
move within one filesystem is a rename; across filesystems the copy is verified
before the original goes. Only already-empty folders are removed, and never one
you named.

## Test

```sh
npm test          # both suites
npm run lint      # eslint
npm run coverage  # both suites under Node's coverage reporter
```

Two suites, no test framework:

`test/unittest.mjs` runs without a filesystem. Format readers are handed a
`Buffer` and the planner a stub that answers "does this path exist" and "are
these the same photo" from a plain object, so a plan can be checked for what it
decided rather than for the files it left behind.

`test/selftest.mjs` is end to end. It builds a synthetic card dump — raw/JPEG
pairs, a raw recording no date, a raw dated only by the JPEG it embeds, clips
either side of midnight, AVCHD outside DCIM, a name collision between card
folders — runs the real command against it, and checks where every file lands.
It also checks that `--help`, the man page and this README agree on every
option, and that the modules which decide things never import `node:fs`.
