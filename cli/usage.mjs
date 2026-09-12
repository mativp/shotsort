import {
  DEFAULT_LAYOUT, EARLIEST_HOUR_A_DAY_MAY_START_AT, LATEST_HOUR_A_DAY_MAY_START_AT,
} from '../src/clock.mjs';
import { UNDATED_FOLDER_NAME } from '../src/plan.mjs';

export const PROGRAM_NAME = 'shotsort';

export const EXIT_CODE = {
  everythingPlaced: 0,
  somethingFailedOrNothingFound: 1,
  badCommandLine: 2,
};

export const USAGE = `Usage: ${PROGRAM_NAME} [OPTION]... FOLDER...

Sort photos and video into one folder per shooting day, using the date the
camera recorded inside each file. Files are copied, never moved, unless you
ask for --move, so the originals survive a mistake.

Every file is examined and its destination decided before anything is written,
so nothing moves until the whole plan is settled. --dry-run prints that plan.

The FOLDER to sort always has to be named: ${PROGRAM_NAME} run with no arguments
prints this text and sorts nothing, and it never falls back to the folder you
happen to be standing in.

  -s, --source FOLDER   the folder to sort. The same as naming it without a
                        flag, and worth spelling out whenever --dest is used
                        too, so it is plain which folder is read and which is
                        written. May be given more than once
  -d, --dest FOLDER     put the day folders in FOLDER instead of inside the
                        source folder. With copying left as the default, this
                        builds a sorted library and leaves the source exactly
                        as it came off the card
  -n, --dry-run         print the plan and change nothing. The plan shown is
                        the one that would be carried out, computed by the
                        same code
  -m, --move            move the files rather than copying them, leaving each
                        source folder empty and then removing it. Without this
                        the originals are left exactly where they are, so the
                        source folder ends up holding both them and the sorted
                        copies unless --dest sends the copies elsewhere

      --layout FORMAT   how to name each day folder. %Y is the year, %m the
                        month, %d the day, and %F all three joined by dashes.
                        A slash makes a subfolder, so --layout '%Y/%F' gives
                        2026/2026-08-27. Must be a relative path holding at
                        least one date escape. Default: ${DEFAULT_LAYOUT}
      --day-start HOUR  the hour at which one shooting day becomes the next.
                        The default, ${EARLIEST_HOUR_A_DAY_MAY_START_AT}, turns the day at midnight, so a wedding
                        shot from 20:00 on the 27th until 01:30 on the 28th is
                        split between 2026-08-27 and 2026-08-28. --day-start 4
                        turns the day at 04:00 instead, filing everything shot
                        before 04:00 under the previous day, so that whole
                        night lands in 2026-08-27 together. An hour from
                        ${EARLIEST_HOUR_A_DAY_MAY_START_AT} to ${LATEST_HOUR_A_DAY_MAY_START_AT}

Every file is filed under the clock the camera was set to when it was taken,
stills and video alike, so the folder a file lands in never depends on where
the computer sorting it happens to be. For video that means preferring a clock
the camera spelled a timezone out for -- the user data Canon and Nikon write,
Apple's creation date, the thumbnail Canon stores beside the clip -- and only
then the movie header, which some makers write in UTC and others in local time.

AVCHD clips and HLG photos record no date this can read. The only date left for
those is the one the filesystem keeps, which is the real shooting time when the
copy off the card preserved it, and meaningless when it did not, because cp
without -p replaces it with the moment of the copy.
So by default the filesystem date is used for such a file only when it still
looks like a shooting time, and the file goes to ${UNDATED_FOLDER_NAME}/ when it does not.
These two settle it by hand instead:

      --use-filesystem-date
                        date every file that records no date inside itself by
                        the date the filesystem keeps, without checking that
                        date first
      --ignore-filesystem-date
                        date none of them that way: every file that records no
                        date inside itself goes to ${UNDATED_FOLDER_NAME}/

  -v, --verbose         print every file as it is placed, as
                        "source -> destination". Files already in the right
                        place are not printed
  -q, --quiet           print nothing but errors
      --json            print the plan and the result as JSON on standard
                        output: every file with the folder chosen for it, the
                        clock the date came from, and what was done
  -h, --help            print this text and exit, exactly as running
                        ${PROGRAM_NAME} with no arguments does
  -V, --version         print the version and exit

Short options may be run together: -nv is -n -v. A -- argument ends option
parsing.

Reads JPEG, TIFF, MPO, HEIF and AVIF stills; DNG and the raw of Panasonic
(RW2), Canon (CR2, CR3, CRW), Nikon (NEF, NRW), Sony (ARW, ARQ, SR2), Olympus
and OM System (ORF), Fujifilm (RAF), Pentax (PEF), Minolta (MRW) and Sigma
(X3F); and MP4, MOV, M4V, 3GP, MTS, M2TS, AVI and the clips action cameras and
drones write. A Canon THM sidecar dates the clip beside it, as does a JPEG on
another card slot when only one shot on the card goes by that name.

Nothing is ever overwritten. When one day holds two different photos with the
same file name, as happens when a card's numbering wraps or two card folders
are copied together, each goes into a numbered subfolder of that day instead:
2026-09-01/01/A9999.RW2 for the earlier one, 2026-09-01/02/A9999.RW2 for the
later. Names that clash with nothing stay directly in the day folder, and a
file already sitting where it belongs is left alone.

Exit status:
  ${EXIT_CODE.everythingPlaced}   every file was placed
  ${EXIT_CODE.somethingFailedOrNothingFound}   some files were not placed, or none were found
  ${EXIT_CODE.badCommandLine}   the command line was wrong, naming no folder to sort included, so
      running ${PROGRAM_NAME} with no arguments at all prints this text and exits ${EXIT_CODE.badCommandLine}

Examples:
  ${PROGRAM_NAME} -s ~/Import -d ~/Pictures/2026
        Read ~/Import and build the sorted day folders under ~/Pictures/2026,
        leaving ~/Import exactly as it came off the card. This is the usual
        way to run it.

  ${PROGRAM_NAME} -n -s ~/Import -d ~/Pictures/2026
        Print what that would do, and do none of it.

  ${PROGRAM_NAME} ~/Import
        Sort ~/Import in place. Day folders appear inside it holding copies,
        and the originals stay in DCIM, so the folder briefly holds both.

  ${PROGRAM_NAME} -m ~/Import
        The same, moving the files rather than copying them, so nothing is
        duplicated and the emptied DCIM folders are removed afterwards.

  ${PROGRAM_NAME} .
        Sort the folder you are standing in.

  ${PROGRAM_NAME} --layout '%Y/%F' ~/Import
        Sort ~/Import into 2026/2026-08-27 rather than 2026-08-27.

  ${PROGRAM_NAME} --day-start 4 ~/Import
        Sort ~/Import, keeping shots taken after midnight with the evening
        they belong to.

  ${PROGRAM_NAME} -v -m ~/Import
        Sort ~/Import, printing every file as it moves.
`;
