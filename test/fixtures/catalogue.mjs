import {
  OLYMPUS_RAW_SIGNATURE, OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES, PANASONIC_RAW_SIGNATURE, TIFF_STANDARD_SIGNATURE,
  TIFF_TAG_MODIFY_DATE, TIFF_VALUE_TYPE_LONG, bigEndianTiffFile, bigTiffFile, tiffFile,
  tiffFileWithTheDateInItsMainDirectory,
} from './tiff.mjs';
import {
  jpegFile, jpegFileBehindAsManySegmentsAsAPhotoReallyHas, jpegFileBuriedUnderManySegments,
  jpegFileWithARestartMarkerFirst, panasonicRawWithDateOnlyInEmbeddedJpeg,
} from './jpeg.mjs';
import {
  movieFile, movieFileCarryingACanonThumbnail, movieFileSayingWhichZoneItsClockIsIn,
  movieFileWhoseMovieBoxRunsToTheEnd, movieFileWithAnAppleCreationDate,
} from './quicktime.mjs';
import { windowsMediaMovie } from './asf.mjs';
import { canonCiffRawFile, canonRawFile } from './canon.mjs';
import { digitalVideoClip } from './digitalVideo.mjs';
import { fujifilmRawFile } from './fujifilm.mjs';
import { heifStill } from './heif.mjs';
import { jpegXlStill } from './jpegXl.mjs';
import { matroskaMovie } from './matroska.mjs';
import { minoltaRawFile } from './minolta.mjs';
import { pngStill, pngStillDatedOnlyByWhenItWasLastWritten, pngStillDatedOnlyInItsText } from './png.mjs';
import { redcodeClip } from './redcode.mjs';
import { aviFileRecordingWhenItWasShot, aviFileSayingOnlyWhenItWasCreated, webPStill } from './riff.mjs';
import { sigmaRawFile } from './sigma.mjs';

export const WHEN_A_CAMERA_WOULD_WRITE_IT = '2021:03:04 05:06:07';
export const WHEN_SPELLED_OUT_WITH_DASHES = '2021-03-04 05:06:07';
export const WHEN_SPELLED_OUT_WITH_A_ZONE = '2021-03-04T05:06:07+0200';
export const WHEN_WRITTEN_IN_WORDS = 'Thu Mar 04 05:06:07 2021';
export const WHEN_WRITTEN_THE_WAY_MAIL_HEADERS_DO = 'Thu, 04 Mar 2021 05:06:07 +0000';
export const A_CLOCK_THE_READER_MUST_PASS_OVER = '2001-01-01 00:00:00';
export const THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS = '2021-03-04 05:06:07';

const fixture = (fileName, bytes, { readAs = THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS, exiftoolReadsItDifferentlyBecause } = {}) =>
  ({ fileName, bytes, readAs, exiftoolReadsItDifferentlyBecause });

// Read whole by test/unit/formats.test.mjs, cut short and corrupted by test/unit/robustness.test.mjs,
// and put to exiftool by test/oracle/exiftool.test.mjs.
export const everyFixtureFormatIsBuiltFrom = () => [
  fixture('jpeg.JPG', jpegFile(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('jpeg-with-a-restart-marker-first.JPG', jpegFileWithARestartMarkerFirst(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('jpeg-behind-the-segments-a-photo-has.JPG',
    jpegFileBehindAsManySegmentsAsAPhotoReallyHas(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('jpeg-behind-more-segments-than-are-walked.JPG',
    jpegFileBuriedUnderManySegments(WHEN_A_CAMERA_WOULD_WRITE_IT), {
      readAs: null,
      exiftoolReadsItDifferentlyBecause: 'the walk stops after a ceiling no real photo reaches; exiftool has no ceiling',
    }),
  fixture('tiff.TIF', tiffFile({
    signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })),
  fixture('tiff-written-big-endian.TIF', bigEndianTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('tiff-with-only-a-modify-date.TIF', tiffFileWithTheDateInItsMainDirectory(
    TIFF_TAG_MODIFY_DATE, WHEN_A_CAMERA_WOULD_WRITE_IT,
  )),
  fixture('big-tiff.TIF', bigTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('big-tiff-written-big-endian.TIF', bigTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT, { bigEndian: true })),
  fixture('big-tiff-pointing-with-a-narrow-offset.TIF', bigTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT, {
    bigEndian: true, pointerType: TIFF_VALUE_TYPE_LONG,
  })),
  fixture('panasonic.RW2', tiffFile({
    signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })),
  fixture('panasonic-dated-only-in-its-preview.RW2',
    panasonicRawWithDateOnlyInEmbeddedJpeg(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('olympus.ORF', tiffFile({
    signature: OLYMPUS_RAW_SIGNATURE, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })),
  fixture('olympus-on-a-later-body.ORF', tiffFile({
    signature: OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })),
  fixture('canon.CR3', canonRawFile(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('canon-ciff.CRW', canonCiffRawFile(WHEN_SPELLED_OUT_WITH_DASHES)),
  fixture('fujifilm.RAF', fujifilmRawFile(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('minolta.MRW', minoltaRawFile(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('sigma.X3F', sigmaRawFile(WHEN_SPELLED_OUT_WITH_DASHES)),
  fixture('heif.HEIC', heifStill(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('jpeg-xl.JXL', jpegXlStill(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('png.PNG', pngStill(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('png-dated-only-in-its-text.PNG', pngStillDatedOnlyInItsText(WHEN_WRITTEN_THE_WAY_MAIL_HEADERS_DO)),
  fixture('png-dated-only-by-when-it-was-written.PNG',
    pngStillDatedOnlyByWhenItWasLastWritten(WHEN_SPELLED_OUT_WITH_DASHES)),
  fixture('webp.WEBP', webPStill(WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('movie.MP4', movieFile(WHEN_SPELLED_OUT_WITH_DASHES)),
  fixture('movie-with-a-64-bit-clock.MP4', movieFile(WHEN_SPELLED_OUT_WITH_DASHES, { creationTimeIs64Bit: true })),
  fixture('movie-whose-box-runs-to-the-end.MOV', movieFileWhoseMovieBoxRunsToTheEnd(WHEN_SPELLED_OUT_WITH_DASHES), {
    exiftoolReadsItDifferentlyBecause: 'a movie box sized to the end of the file is read here and skipped by exiftool',
  }),
  fixture('movie-saying-which-zone-it-is-in.MOV',
    movieFileSayingWhichZoneItsClockIsIn(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_SPELLED_OUT_WITH_A_ZONE)),
  fixture('movie-carrying-a-canon-thumbnail.MOV',
    movieFileCarryingACanonThumbnail(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_A_CAMERA_WOULD_WRITE_IT)),
  fixture('movie-with-an-apple-date.MOV',
    movieFileWithAnAppleCreationDate(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_SPELLED_OUT_WITH_A_ZONE)),
  fixture('movie-with-an-apple-date-in-an-iso-metadata-box.MP4',
    movieFileWithAnAppleCreationDate(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_SPELLED_OUT_WITH_A_ZONE,
      { isoStyleMetadataBox: true }), {
      exiftoolReadsItDifferentlyBecause: 'exiftool reads Apple keys only from a QuickTime metadata box; this reads either',
    }),
  fixture('avi-recording-when-it-was-shot.AVI', aviFileRecordingWhenItWasShot(WHEN_WRITTEN_IN_WORDS)),
  fixture('avi-saying-only-when-it-was-created.AVI', aviFileSayingOnlyWhenItWasCreated(WHEN_SPELLED_OUT_WITH_DASHES)),
  fixture('matroska.MKV', matroskaMovie(WHEN_SPELLED_OUT_WITH_DASHES)),
  fixture('windows-media.WMV', windowsMediaMovie(WHEN_SPELLED_OUT_WITH_DASHES)),
  fixture('digital-video.DV', digitalVideoClip(WHEN_SPELLED_OUT_WITH_DASHES)),
  fixture('redcode.R3D', redcodeClip(WHEN_SPELLED_OUT_WITH_DASHES)),
  fixture('redcode-whose-header-does-not-say-where-the-directory-is.R3D',
    redcodeClip(WHEN_SPELLED_OUT_WITH_DASHES, { headerSaysWhereTheDirectoryIs: false })),
  fixture('redcode-of-the-first-version.R3D', redcodeClip(WHEN_SPELLED_OUT_WITH_DASHES, { version: '1' })),
];
