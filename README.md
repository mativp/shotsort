# shotsort

[![tests](https://github.com/mativp/shotsort/actions/workflows/test.yml/badge.svg)](https://github.com/mativp/shotsort/actions/workflows/test.yml)
[![lines](https://img.shields.io/badge/lines-%E2%89%A599%25-brightgreen)](#test)
[![branches](https://img.shields.io/badge/branches-%E2%89%A598%25-brightgreen)](#test)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](#test)

Sort a folder of camera files into one folder per shooting day, using the date
the camera wrote inside each file. No dependencies, no exiftool.

## Buy me a coffee

`shotsort` is free and always will be. If it saved you an afternoon of dragging
folders around, buy me a coffee.

<a href="https://buymeacoffee.com/mativp"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" height="48"></a>

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

Copy everything off the card however you like — Finder, `ditto`, `rsync` — then
point `shotsort` at the folder. Three commands cover nearly every use:

```sh
shotsort -n .                        # see the plan, change nothing
shotsort .                           # sort the folder you are standing in
shotsort -s . -d ~/Pictures/2026     # copy it into a library elsewhere
```

Start with `-n`. It settles the whole plan and prints it, and writes nothing:

```console
$ cd ~/Import
$ shotsort -n .
2026-08-27     142 files     1.9 GB
2026-08-28      96 files     1.3 GB
2026-08-29 ~   211 files     3.0 GB
undated          4 files   812.0 MB
453 to copy  (dry run)
```

One line per day folder it would make, then the total. Drop the `-n` and the
same run happens for real and ends `453 copied` instead.

The `~` marks a day holding files that record no date inside themselves, and
`undated/` collects the ones whose filesystem date could not be trusted
either. Both are explained on standard error as they happen, and at length
under [Files that record no date](#files-that-record-no-date).

Files are **copied, never moved**, unless you ask for `--move`. A mistaken run
therefore costs nothing but disk space, and the folder you copied off the card
stays exactly as it came. Running the same command a second time copies
nothing:

```console
$ shotsort -s . -d ~/Pictures/2026
...
453 copied
$ shotsort -s . -d ~/Pictures/2026
...
0 copied, 453 duplicates skipped
```

Every file is examined and its destination decided **before anything is
written**, so nothing moves until the whole plan is settled — and `-n` prints
that same plan, computed by the same code, without carrying it out.

### The commands you are likely to need

These are written with `.`, the folder you are standing in, because that is
where you usually are just after copying a card. Any of them takes a path
instead — `~/Import`, `/Volumes/UNTITLED` — and works the same.

| Command | What it does |
|---|---|
| `shotsort -n .` | Print the plan for the current folder. Writes nothing. |
| `shotsort .` | Sort the current folder in place. Day folders appear beside the `DCIM` you copied, holding copies. |
| `shotsort -m .` | The same, moving instead of copying, so nothing is duplicated and the emptied `DCIM` folders are removed. |
| `shotsort -s . -d ~/Pictures/2026` | Copy the current folder into a library elsewhere and leave the current folder exactly as it is. |
| `shotsort -n -s . -d ~/Pictures/2026` | Print what that would do, and do none of it. |
| `shotsort -s /Volumes/UNTITLED -d ~/Pictures/2026` | Build the library straight off the card in the reader. Copying is the default, so the card is only ever read. |
| `shotsort -s ~/CardA -s ~/CardB -d ~/Pictures/2026` | Sort two cards in one pass, so a raw on one and its JPEG on the other still pair up. |
| `shotsort -v -m -s . -d ~/Pictures/2026` | Move, printing `source -> destination` for every file as it goes. |
| `shotsort --day-start 4 .` | Keep a shoot that ran past midnight in the evening it began. |
| `shotsort --layout '%Y/%F' -s . -d ~/Pictures` | Put a year level above the days: `2026/2026-08-27`. |
| `shotsort -n --json .` | Print the plan as JSON, one record per file, for a script to read. |
| `shotsort --ignore-filesystem-date .` | Never guess from filesystem dates: anything with no date inside it goes to `undated/`. |

`-n` and `-v` answer different questions. `-n` prints the plan as a summary of
the day folders; `-v` prints a line per file *as it is placed*, so under `-n`
it has nothing to print. For a per-file preview, ask for the plan as JSON:

```console
$ shotsort -n --json . | head -12
{
  "actions": [
    {
      "src": "/Users/you/Import/DCIM/100_PANA/P1000001.RW2",
      "target": "/Users/you/Import/2026-08-27/P1000001.RW2",
      "folder": "2026-08-27",
      "stamp": "2026-08-27 14:02:11",
      "dateFrom": "exif",
      "size": 23068672,
      "verdict": "place",
      "error": null
    },
```

You always have to name the folder. Run with no arguments `shotsort` prints a
short version of its options and the commands above, and sorts nothing; it
never falls back to the folder you happen to be standing in, so sort the
current one with `shotsort .` if that is what you mean. `shotsort --help` is
the whole manual, and `man shotsort` the same again in its proper place.

## Options

### Where things go

| Option | What it does |
|---|---|
| `-s`, `--source FOLDER` | The folder to sort. The same as naming it without a flag, and worth spelling out whenever `--dest` is used too, so it is plain which folder is read and which is written. May be given more than once. |
| `-d`, `--dest FOLDER` | Put the day folders in `FOLDER` instead of inside the source folder. With copying left as the default, this builds a sorted library and leaves the source exactly as it came off the card. |
| `-n`, `--dry-run` | Print the plan and change nothing. The plan shown is the one that would be carried out, computed by the same code. |
| `-m`, `--move` | Move the files rather than copying them, leaving each source folder empty and then removing it. Without this the originals are left exactly where they are, so the source folder ends up holding both them and the sorted copies unless `--dest` sends the copies elsewhere. |
| `--layout FORMAT` | How to name each day folder. `%Y` is the year, `%m` the month, `%d` the day, and `%F` all three joined by dashes. A slash makes a subfolder, so `--layout '%Y/%F'` gives `2026/2026-08-27`. Must be a relative path holding at least one date escape. Default `%Y-%m-%d`. |
| `--day-start HOUR` | The hour at which one shooting day becomes the next. See below. Any hour of the clock, 0 to 23, default `0`. |

#### `--day-start`

A wedding shot from 20:00 on the 27th until 01:30 on the 28th is one evening's
work, but with the day turning at midnight it lands in two folders:

```
shotsort ~/Import                shotsort --day-start 4 ~/Import
  2026-08-27/  ← 20:00-23:59       2026-08-27/  ← the whole night
  2026-08-28/  ← 00:00-01:30
```

`--day-start 4` moves the boundary to 04:00, so anything shot before 04:00 is
filed under the previous day.

Any hour of the clock will do, 0 to 23, and the rule is the same all the way
round: everything shot before the hour you name belongs to the day before. A
small hour suits a shoot that habitually runs past midnight; an hour like
`--day-start 18` suits work that begins in the evening and is named for the
night it belongs to rather than the date it ends on.

### Files that record no date

Stills and video are both filed by the clock the camera was set to, so nothing
here applies to them. AVCHD clips (`.MTS`, `.M2TS`, `.M2T`), MPEG program
streams (`.MPG`, `.VOB`, `.M2V`) and HLG photos (`.HSP`) are the exception:
no date this reads — or exiftool reads — is stored inside them, leaving only
the date the filesystem keeps. Read [What it reads](#what-it-reads) for why that date is
sometimes worthless and how `shotsort` tells the difference.

| Option | What it does |
|---|---|
| `--use-filesystem-date` | Date every file that records no date inside itself by the date the filesystem keeps, without checking that date first. |
| `--ignore-filesystem-date` | Date none of them that way: every file that records no date inside itself goes to `undated/`. |

### Output

| Option | What it does |
|---|---|
| `-v`, `--verbose` | Print every file as it is placed, as `source -> destination`. Files already in the right place are not printed. Nothing is being placed under `-n`, so the two together print no more than `-n` alone; `-n --json` is the per-file preview. |
| `-q`, `--quiet` | Print nothing but errors. |
| `--json` | Print the plan and the result as JSON on standard output: every file with the folder chosen for it, the clock the date came from, and what was done, and a summary carrying everything the notes on standard error would have said. With `-n` this is the whole plan, file by file, before anything is written. |

### Help

| Option | What it does |
|---|---|
| `-h`, `--help` | Print the full manual — every option, how the date is found, what it reads — and exit. Run with no arguments, `shotsort` prints a short version of it instead. |
| `-V`, `--version` | Print the version and exit. |

Short options may be run together: `-nv` is `-n -v`. A `--` argument ends
option parsing, so a folder whose name begins with a dash still sorts:
`shotsort -n -- -weird-folder`.

### Exit status

| Code | Meaning |
|---|---|
| `0` | Every file was placed. |
| `1` | Some files were not placed, or none were found. |
| `2` | The command line was wrong, naming no folder to sort included. Running `shotsort` with no arguments at all therefore prints the short version and exits `2`. |

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

**Stills** — JPEG, JPE, JPS, MPO, INSP, TIFF, BTF, PNG, APNG, WEBP, JXL, HSP,
HIF, HEIC, HEIF, AVIF, and Canon THM sidecars.

**Raw** — RW2, RAW, RWL (Panasonic), CR2, CR3, CRM, CRW (Canon), NEF, NRW
(Nikon), ARW, ARQ, SR2, SRF (Sony), ORF, ORI (Olympus, OM System), RAF
(Fujifilm), PEF (Pentax), MRW (Minolta), X3F (Sigma), SRW, ERF, 3FR, FFF, IIQ,
MOS, MEF, DCR, KDC, K25, GPR, JXR, HDP, WDP, and DNG from anyone.

**Video** — MP4, MOV, QT, M4V, MQV, 3GP, 3GPP, 3G2, 3GP2, MTS, M2TS, M2T, AVI,
MKV, WEBM, WMV, ASF, DIVX, MPG, MPEG, M2V, VOB, DV, F4V, R3D, and the LRV, LRF,
GLV, INSV and 360 clips action cameras and drones write.

The extension decides only which files are picked up; the parser is chosen by
the file's leading bytes, so a mislabelled file still reads correctly. No list
of camera makers is consulted anywhere, so next year's raw reads today.

**Not dated:** AVCHD (`.MTS`, `.M2TS`, `.M2T`), MPEG program streams (`.MPG`,
`.VOB`, `.M2V`) and HLG photos (`.HSP`) record no date this or exiftool can
read, so they fall through to a sibling or the filesystem. `.TS` is not picked
up at all: no date either way, and a folder of TypeScript is the likelier
meaning.

The date is the first of these to answer:

1. **EXIF** `DateTimeOriginal` / `CreateDate` / `ModifyDate`, wherever the file
   hides it — plain, in the JPEG inside a raw, or in the TIFF block that a CR3,
   HEIF, AVIF, JXL, PNG, WebP, RAF or MRW wraps somewhere of its own.
2. **The format's own clock**, for the CRW, X3F, AVI, Matroska, ASF, DV and
   Redcode files that keep a date of their own making. Each is read as the
   camera's clock and checked for a plausible year, so a misread gives no date
   rather than a wrong one.
3. **A video clock, the one naming its timezone first** — Canon and Nikon's
   `©day`, Apple's `com.apple.quicktime.creationdate`, the EXIF in Canon's
   thumbnail. Its local time is kept and the offset discarded, that being what
   the photographer saw on the back of the camera. Failing that, `moov/mvhd`
   verbatim, where Panasonic writes the camera's clock already.
4. **The other format of the same shot** — the JPEG beside a raw, the THM
   beside a Canon AVI. Matched on folder and name, or on name alone when
   exactly one shot on the whole card goes by that name.
5. **The date the filesystem keeps.** Days holding such files are marked `~`.

Step 5 is worth having only if whatever copied the card kept those dates, and
`cp` without `-p` does not: it stamps every file with the moment of the copy.
`shotsort` spots that — a filesystem date well after the newest date any file
records is a copy, not a shoot — and sends those files to `undated/` rather than
a wrong day. Copy with `ditto`, `cp -p` or `rsync -a`.

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
npm test                # every suite
npm run lint            # eslint
npm run coverage        # every suite under Node's coverage reporter
npm run coverage:check  # the same, failing below the floors the badges state
```

Three suites, no test framework:

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

`test/oracle.mjs` builds every format fixture and puts it to `exiftool`, which
is the reference implementation for all of these formats, and fails when the two
read a different date out of the same bytes. This is the only file in the
repository that knows exiftool exists — shotsort never runs it — and the check
skips itself when exiftool is not installed. It is here because a parser and the
fixture that exercises it can share one misunderstanding of a format and agree
with each other forever; exiftool was written from real files, so putting the
fixture to it stops that. Three fixtures are recorded as reading differently on
purpose, each with the reason.

### What the numbers mean

The line and branch figures on the badges are a floor, enforced by `npm run
coverage:check` on every pull request. They are not a target reached by counting
lines: most of the branches in a format reader are the ones that fire on a file
that went wrong, so the suite cuts every fixture short a byte at a time and reads
what is left, then puts each of those bytes back as `0x00` and as `0xff` and
reads it again. A file that stops half way has to read as nothing, or as the
moment it holds, and never as a different shot; a file that went bad has to read
as something rather than throw. Between them those two sweeps run some 170,000
reads over every format in the catalogue, and they are what the branch figure is
made of.

The mutation score is measured by hand rather than in CI, because a run takes
minutes where the suite takes seconds. It is the sharper number: it changes the
program in one small way at a time — a `<` for a `<=`, a constant for another, a
condition for `true` — and reports every change no check noticed. A line the
suite runs but never checks counts as covered and survives mutation, which is why
this is the figure that says whether the tests assert anything rather than merely
execute the code. Survivors are treated as real gaps rather than noise. Stryker
is not a dependency of this package and is not in the manifest; the two configs
are committed so a run is reproducible. Each module is put to the cheapest suite
that exercises it — the ones that decide things to the unit suite, the ones whose
job is the disk to the end to end suite:

```sh
npm install --no-save @stryker-mutator/core
npx stryker run                          # the modules that decide things
npx stryker run stryker.disk.json        # the modules that touch the disk
```
