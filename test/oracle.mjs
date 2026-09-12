#!/usr/bin/env node
// Checking this tool's reading against exiftool's, which is the reference implementation
// for every format here.
//
// The point is not to depend on exiftool -- shotsort never runs it, and this file is the
// only place in the repository that knows it exists. The point is that a byte-level
// fixture is only worth as much as its realism: a parser and the fixture that exercises it
// can share the same misunderstanding of a format and agree with each other forever. Put
// the fixture to exiftool and that stops being possible, because exiftool was written from
// the real files.
//
// Nothing here runs when exiftool is not installed, so a machine without it still gets a
// full test suite; it gets one check fewer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as fixtures from './fixtures.mjs';
import { readCameraClockFromFile } from '../src/formats/registry.mjs';
import { formatCameraClock } from '../src/clock.mjs';

const WHEN_A_CAMERA_WOULD_WRITE_IT = '2021:03:04 05:06:07';
const WHEN_SPELLED_OUT_WITH_DASHES = '2021-03-04 05:06:07';
const WHEN_SPELLED_OUT_WITH_A_ZONE = '2021-03-04T05:06:07+0200';
const WHEN_WRITTEN_IN_WORDS = 'Thu Mar 04 05:06:07 2021';
const WHEN_WRITTEN_THE_WAY_MAIL_HEADERS_DO = 'Thu, 04 Mar 2021 05:06:07 +0000';
const A_CLOCK_THE_READER_MUST_PASS_OVER = '2001-01-01 00:00:00';
const THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS = '2021-03-04 05:06:07';

// Every tag exiftool would call a shooting time, in the order this tool trusts them.
const WHAT_EXIFTOOL_CALLS_A_SHOOTING_TIME = [
  'DateTimeOriginal', 'CreationDate', 'ContentCreateDate', 'CreateDate',
  'DateCreated', 'CreationTime', 'MediaCreateDate', 'ModifyDate',
];

const EXIT_EVERYTHING_AGREED = 0;
const EXIT_SOMETHING_DISAGREED = 1;

// A fixture exiftool reads differently, and why that is the right outcome rather than a
// fault to fix. Anything not named here has to agree with exiftool exactly.
const WHERE_THE_TWO_ARE_MEANT_TO_PART = {
  'jpeg-behind-more-segments-than-are-walked.JPG':
    'the walk stops after a ceiling no real photo reaches; exiftool has no ceiling',
  'movie-whose-box-runs-to-the-end.MOV':
    'a movie box sized to the end of the file is read here and skipped by exiftool',
  'movie-with-an-apple-date-in-an-iso-metadata-box.MP4':
    'exiftool reads Apple keys only from a QuickTime metadata box; this reads either',
};

const fixtureFiles = () => [
  ['jpeg.JPG', fixtures.jpegFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['jpeg-with-a-restart-marker-first.JPG', fixtures.jpegFileWithARestartMarkerFirst(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['jpeg-behind-the-segments-a-photo-has.JPG',
    fixtures.jpegFileBehindAsManySegmentsAsAPhotoReallyHas(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['jpeg-behind-more-segments-than-are-walked.JPG',
    fixtures.jpegFileBuriedUnderManySegments(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['tiff.TIF', fixtures.tiffFile({
    signature: fixtures.TIFF_STANDARD_SIGNATURE, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })],
  ['tiff-written-big-endian.TIF', fixtures.bigEndianTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['tiff-with-only-a-modify-date.TIF', fixtures.tiffFileWithTheDateInItsMainDirectory(
    fixtures.TIFF_TAG_MODIFY_DATE, WHEN_A_CAMERA_WOULD_WRITE_IT,
  )],
  ['big-tiff.TIF', fixtures.bigTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['big-tiff-written-big-endian.TIF', fixtures.bigTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT, { bigEndian: true })],
  ['big-tiff-pointing-with-a-narrow-offset.TIF', fixtures.bigTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT, {
    bigEndian: true, pointerType: fixtures.TIFF_VALUE_TYPE_LONG,
  })],
  ['panasonic.RW2', fixtures.tiffFile({
    signature: fixtures.PANASONIC_RAW_SIGNATURE, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })],
  ['panasonic-dated-only-in-its-preview.RW2',
    fixtures.panasonicRawWithDateOnlyInEmbeddedJpeg(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['olympus.ORF', fixtures.tiffFile({
    signature: fixtures.OLYMPUS_RAW_SIGNATURE, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })],
  ['olympus-on-a-later-body.ORF', fixtures.tiffFile({
    signature: fixtures.OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })],
  ['canon.CR3', fixtures.canonRawFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['canon-ciff.CRW', fixtures.canonCiffRawFile(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['fujifilm.RAF', fixtures.fujifilmRawFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['minolta.MRW', fixtures.minoltaRawFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['sigma.X3F', fixtures.sigmaRawFile(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['heif.HEIC', fixtures.heifStill(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['jpeg-xl.JXL', fixtures.jpegXlStill(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['png.PNG', fixtures.pngStill(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['png-dated-only-in-its-text.PNG', fixtures.pngStillDatedOnlyInItsText(WHEN_WRITTEN_THE_WAY_MAIL_HEADERS_DO)],
  ['png-dated-only-by-when-it-was-written.PNG',
    fixtures.pngStillDatedOnlyByWhenItWasLastWritten(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['webp.WEBP', fixtures.webPStill(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['movie.MP4', fixtures.movieFile(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['movie-with-a-64-bit-clock.MP4', fixtures.movieFile(WHEN_SPELLED_OUT_WITH_DASHES, { creationTimeIs64Bit: true })],
  ['movie-whose-box-runs-to-the-end.MOV', fixtures.movieFileWhoseMovieBoxRunsToTheEnd(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['movie-saying-which-zone-it-is-in.MOV',
    fixtures.movieFileSayingWhichZoneItsClockIsIn(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_SPELLED_OUT_WITH_A_ZONE)],
  ['movie-carrying-a-canon-thumbnail.MOV',
    fixtures.movieFileCarryingACanonThumbnail(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['movie-with-an-apple-date.MOV',
    fixtures.movieFileWithAnAppleCreationDate(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_SPELLED_OUT_WITH_A_ZONE)],
  ['movie-with-an-apple-date-in-an-iso-metadata-box.MP4',
    fixtures.movieFileWithAnAppleCreationDate(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_SPELLED_OUT_WITH_A_ZONE,
      { isoStyleMetadataBox: true })],
  ['avi-recording-when-it-was-shot.AVI', fixtures.aviFileRecordingWhenItWasShot(WHEN_WRITTEN_IN_WORDS)],
  ['avi-saying-only-when-it-was-created.AVI', fixtures.aviFileSayingOnlyWhenItWasCreated(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['matroska.MKV', fixtures.matroskaMovie(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['windows-media.WMV', fixtures.windowsMediaMovie(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['digital-video.DV', fixtures.digitalVideoClip(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['redcode.R3D', fixtures.redcodeClip(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['redcode-whose-header-does-not-say-where-the-directory-is.R3D',
    fixtures.redcodeClip(WHEN_SPELLED_OUT_WITH_DASHES, { headerSaysWhereTheDirectoryIs: false })],
];

const exiftoolIsInstalled = () => spawnSync('exiftool', ['-ver'], { encoding: 'utf8' }).status === 0;

function askExiftool(filePaths) {
  const answer = spawnSync('exiftool', [
    '-json', '-ignoreMinorErrors', '-quiet', '-quiet',
    ...WHAT_EXIFTOOL_CALLS_A_SHOOTING_TIME.map((tag) => `-${tag}`),
    ...filePaths,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const printed = (answer.stdout ?? '').trim();
  return printed === '' ? [] : JSON.parse(printed);
}

// exiftool writes a date its own way -- colons between the numbers, sometimes a zone or a
// trailing Z -- so both sides are reduced to the same shape before they are compared.
const asAPlainDate = (written) => {
  if (written === undefined || written === null) return null;
  const parts = /^(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(String(written));
  return parts === null ? null : `${parts[1]}-${parts[2]}-${parts[3]} ${parts[4]}:${parts[5]}:${parts[6]}`;
};

function main() {
  if (!exiftoolIsInstalled()) {
    console.log('  skip  exiftool is not installed, so the fixtures were not checked against it\n');
    return EXIT_EVERYTHING_AGREED;
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shotsort-oracle-'));
  const built = fixtureFiles();
  for (const [name, bytes] of built) fs.writeFileSync(path.join(directory, name), bytes);

  const answers = askExiftool(built.map(([name]) => path.join(directory, name)));
  const answerFor = new Map(answers.map((answer) => [path.basename(answer.SourceFile), answer]));

  let disagreementCount = 0;
  for (const [name] of built) {
    const filePath = path.join(directory, name);
    const found = readCameraClockFromFile(filePath, fs.statSync(filePath).size);
    const ours = found === null ? null : formatCameraClock(found.clock);

    const answer = answerFor.get(name) ?? {};
    const theirs = WHAT_EXIFTOOL_CALLS_A_SHOOTING_TIME
      .map((tag) => asAPlainDate(answer[tag])).find((date) => date !== null) ?? null;

    const meantToPart = WHERE_THE_TWO_ARE_MEANT_TO_PART[name];
    const agreed = meantToPart === undefined
      ? ours === THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS && theirs === THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS
      : ours !== theirs;

    console.log(`${agreed ? '  ok  ' : '  FAIL'} ${name}${meantToPart === undefined ? '' : ` -- ${meantToPart}`}`);
    if (agreed) continue;
    disagreementCount++;
    console.log(`        this tool read ${ours ?? 'nothing'}, exiftool read ${theirs ?? 'nothing'}`);
  }

  fs.rmSync(directory, { recursive: true, force: true });
  console.log(disagreementCount === 0
    ? `\n  all ${built.length} fixtures read the way exiftool reads them\n`
    : `\n  ${disagreementCount} fixtures are not read the way exiftool reads them\n`);
  return disagreementCount === 0 ? EXIT_EVERYTHING_AGREED : EXIT_SOMETHING_DISAGREED;
}

process.exit(main());
