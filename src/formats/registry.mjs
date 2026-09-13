// Every format this can read, in the order it tries them.
//
// `recognisedBy` decides more than which reader runs: a format that recognised the file
// by its own mark is the last word on that file, so a JPEG carrying no Exif is a JPEG
// with no date rather than something to go on and try as a movie. The two entries with no
// mark to go on are attempts, and an attempt that finds nothing falls through to the next.
import { openFileAsByteSource } from '../bytes.mjs';
import { DATE_SOURCE } from '../dateSource.mjs';
import { readCameraClockFromJpeg, startsWithAJpegSignature } from './jpeg.mjs';
import { readCameraClockFromTiff, startsWithATiffByteOrderMark } from './tiff.mjs';
import { readCameraClockFromCanonCiffRaw, readCameraClockFromCanonRaw, startsWithACanonCiffMark } from './canon.mjs';
import { readCameraClockFromFujifilmRaw, startsWithAFujifilmRawMark } from './fujifilm.mjs';
import { readCameraClockFromMinoltaRaw, startsWithAMinoltaRawMark } from './minolta.mjs';
import { readCameraClockFromSigmaRaw, startsWithASigmaRawMark } from './sigma.mjs';
import { readCameraClockFromHeifStill } from './heif.mjs';
import { readCameraClockFromJpegXl, startsWithAJpegXlContainerSignature } from './jpegXl.mjs';
import { readCameraClockFromPng, startsWithAPngSignature } from './png.mjs';
import { readCameraClockFromRiff, startsWithARiffMark } from './riff.mjs';
import { readCameraClockFromMatroska, startsWithAnEbmlHeader } from './matroska.mjs';
import { readCameraClockFromAsf, startsWithAnAsfHeaderObject } from './asf.mjs';
import { readCameraClockFromDigitalVideo, startsWithADvBlockMark } from './digitalVideo.mjs';
import { readCameraClockFromRedcode, startsWithARedcodeMark } from './redcode.mjs';
import { readCameraClockFromMovie } from './quicktime.mjs';

const NOTHING_MARKS_THIS_FORMAT_SO_IT_IS_ONLY_WORTH_ATTEMPTING = null;

export const FORMATS_IN_THE_ORDER_THEY_ARE_TRIED = [
  {
    name: 'JPEG',
    recognisedBy: startsWithAJpegSignature,
    read: (byteSource) => readCameraClockFromJpeg(byteSource),
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'PNG',
    recognisedBy: startsWithAPngSignature,
    read: readCameraClockFromPng,
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'RIFF, which is AVI and WebP',
    recognisedBy: startsWithARiffMark,
    read: readCameraClockFromRiff,
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'Matroska, which is MKV and WebM',
    recognisedBy: startsWithAnEbmlHeader,
    read: readCameraClockFromMatroska,
    source: DATE_SOURCE.videoHeader,
  },
  {
    name: 'ASF, which is WMV',
    recognisedBy: startsWithAnAsfHeaderObject,
    read: readCameraClockFromAsf,
    source: DATE_SOURCE.videoHeader,
  },
  {
    name: 'DV, off a tape camcorder',
    recognisedBy: startsWithADvBlockMark,
    read: readCameraClockFromDigitalVideo,
    source: DATE_SOURCE.videoHeader,
  },
  {
    name: 'Redcode, off a RED cinema camera',
    recognisedBy: startsWithARedcodeMark,
    read: readCameraClockFromRedcode,
    source: DATE_SOURCE.videoHeader,
  },
  {
    name: 'JPEG XL',
    recognisedBy: startsWithAJpegXlContainerSignature,
    read: readCameraClockFromJpegXl,
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'Canon CIFF raw',
    recognisedBy: startsWithACanonCiffMark,
    read: readCameraClockFromCanonCiffRaw,
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'TIFF and the raw dressed up as one',
    recognisedBy: startsWithATiffByteOrderMark,
    read: (byteSource) => readCameraClockFromTiff(byteSource, 0, { readEmbeddedJpeg: readCameraClockFromJpeg }),
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'Fujifilm raw',
    recognisedBy: startsWithAFujifilmRawMark,
    read: readCameraClockFromFujifilmRaw,
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'Minolta raw',
    recognisedBy: startsWithAMinoltaRawMark,
    read: readCameraClockFromMinoltaRaw,
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'Sigma raw',
    recognisedBy: startsWithASigmaRawMark,
    read: readCameraClockFromSigmaRaw,
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'Canon CR3',
    recognisedBy: NOTHING_MARKS_THIS_FORMAT_SO_IT_IS_ONLY_WORTH_ATTEMPTING,
    read: readCameraClockFromCanonRaw,
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'HEIF still',
    recognisedBy: NOTHING_MARKS_THIS_FORMAT_SO_IT_IS_ONLY_WORTH_ATTEMPTING,
    read: readCameraClockFromHeifStill,
    source: DATE_SOURCE.exifMetadata,
  },
  {
    name: 'movie',
    recognisedBy: NOTHING_MARKS_THIS_FORMAT_SO_IT_IS_ONLY_WORTH_ATTEMPTING,
    read: readCameraClockFromMovie,
    source: DATE_SOURCE.videoHeader,
  },
];

export function readCameraClockFromByteSource(byteSource) {
  for (const format of FORMATS_IN_THE_ORDER_THEY_ARE_TRIED) {
    const clock = format.read(byteSource);
    if (clock !== null) return { clock, source: format.source };
    if (format.recognisedBy !== null && format.recognisedBy(byteSource)) return null;
  }
  return null;
}

export function readCameraClockFromFile(filePath, sizeInBytes) {
  let byteSource;
  try {
    byteSource = openFileAsByteSource(filePath, sizeInBytes);
    return readCameraClockFromByteSource(byteSource);
  } catch {
    return null;
  } finally {
    byteSource?.close();
  }
}
