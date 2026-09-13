import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OLYMPUS_RAW_SIGNATURE, OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES, PANASONIC_RAW_SIGNATURE, TIFF_STANDARD_SIGNATURE,
  TIFF_VALUE_TYPE_LONG, bigEndianTiffFile, bigTiffFile, tiffFile,
} from '../fixtures/tiff.mjs';
import {
  jpegFile, jpegFileBehindAsManySegmentsAsAPhotoReallyHas, jpegFileBuriedUnderManySegments,
  jpegFileWithARestartMarkerFirst,
} from '../fixtures/jpeg.mjs';
import {
  movieFile, movieFileCarryingACanonThumbnail, movieFileSayingWhichZoneItsClockIsIn,
  movieFileWhoseMovieBoxRunsToTheEnd, movieFileWithAnAppleCreationDate,
} from '../fixtures/quicktime.mjs';
import { heifStill } from '../fixtures/heif.mjs';
import { canonCiffRawFile, canonRawFile } from '../fixtures/canon.mjs';
import { fujifilmRawFile } from '../fixtures/fujifilm.mjs';
import { minoltaRawFile } from '../fixtures/minolta.mjs';
import { sigmaRawFile } from '../fixtures/sigma.mjs';
import { aviFileRecordingWhenItWasShot, aviFileSayingOnlyWhenItWasCreated, webPStill } from '../fixtures/riff.mjs';
import { pngStill, pngStillDatedOnlyByWhenItWasLastWritten, pngStillDatedOnlyInItsText } from '../fixtures/png.mjs';
import { matroskaMovie } from '../fixtures/matroska.mjs';
import { windowsMediaMovie } from '../fixtures/asf.mjs';
import { jpegXlStill } from '../fixtures/jpegXl.mjs';
import { digitalVideoClip } from '../fixtures/digitalVideo.mjs';
import { redcodeClip } from '../fixtures/redcode.mjs';
import { everyFixtureFormatIsBuiltFrom } from '../fixtures/catalogue.mjs';
import { byteSourceForBuffer } from '../../src/bytes.mjs';
import { FORMATS_IN_THE_ORDER_THEY_ARE_TRIED } from '../../src/formats/registry.mjs';
import { formatCameraClock } from '../../src/clock.mjs';
import { DATE_SOURCE } from '../../src/dateSource.mjs';
import { clockInside, clockTextInside } from '../support/inMemory.mjs';

test('a parser reads bytes with no file under them', async (context) => {
  await context.test('a JPEG is read straight out of a Buffer',
    () => assert.equal(formatCameraClock(clockInside(jpegFile('2026:08:27 10:30:00')).clock), '2026-08-27 10:30:00'));
  await context.test('and the date is marked as having come from inside the file',
    () => assert.equal(clockInside(jpegFile('2026:08:27 10:30:00')).source, DATE_SOURCE.exifMetadata));
  await context.test('a Panasonic raw is read the same way', () => assert.equal(
    formatCameraClock(clockInside(tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: '2026:08:27 11:00:00' })).clock),
    '2026-08-27 11:00:00',
  ));
  await context.test('a movie is marked as having come from a video header, not from Exif',
    () => assert.equal(clockInside(movieFile('2026-08-28 09:00:00')).source, DATE_SOURCE.videoHeader));
  await context.test('bytes that are no format at all yield no date rather than throwing',
    () => assert.equal(clockInside(Buffer.alloc(512, 0x41)), null));
  await context.test('an empty file yields no date', () => assert.equal(clockInside(Buffer.alloc(0)), null));
});

test('every fixture in the catalogue, read whole', async (context) => {
  for (const { fileName, bytes, readAs } of everyFixtureFormatIsBuiltFrom()) {
    await context.test(`${fileName} reads as ${readAs ?? 'no date'}`, () => assert.equal(clockTextInside(bytes), readAs));
  }
});

test('the clips off a tape camcorder', async (context) => {
  // A DV clip writes its year as two digits, so which century it is in has to be decided.
  // Tape camcorders were sold through both, and a file from either has to land in its own.
  await context.test('a tape shot in the nineties is filed in the nineteen hundreds', () => assert.equal(
    formatCameraClock(clockInside(digitalVideoClip('1997-03-04 05:06:07')).clock),
    '1997-03-04 05:06:07',
  ));
  await context.test('and one shot since is filed in the two thousands', () => assert.equal(
    formatCameraClock(clockInside(digitalVideoClip('2021-03-04 05:06:07')).clock),
    '2021-03-04 05:06:07',
  ));
});

test('the mark on a file is the last word on it', async (context) => {
  // A JPEG whose Exif says nothing must not go on to be tried as a movie: the registry
  // stops at the format the file's own mark named.
  const jpegWithNoExif = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(64, 0), Buffer.from([0xff, 0xd9])]);
  await context.test('a JPEG carrying no Exif is a JPEG with no date, not something to try as a movie',
    () => assert.equal(clockInside(jpegWithNoExif), null));
});

// The registry only offers a reader a file its mark already matched, so a reader could in
// principle trust that and read anything it was handed. None of them does, and this is what
// says so: every reader that has a mark of its own is put to every fixture the mark refuses.
test('every reader refuses a file that is not its format', async (context) => {
  const fixtures = everyFixtureFormatIsBuiltFrom();
  const readAnyway = [];

  for (const format of FORMATS_IN_THE_ORDER_THEY_ARE_TRIED) {
    if (format.recognisedBy === null) continue;
    for (const { fileName, bytes } of fixtures) {
      const byteSource = byteSourceForBuffer(bytes);
      if (format.recognisedBy(byteSource)) continue;
      if (format.read(byteSource) !== null) readAnyway.push(`${format.name} read ${fileName}`);
    }
  }

  await context.test('a reader handed a file its own mark refuses reads nothing out of it',
    () => assert.deepEqual(readAnyway, []));
});

test('containers that are legal but unusual', async (context) => {
  await context.test('a jpeg whose first marker carries no length is still read', () => assert.equal(
    formatCameraClock(clockInside(jpegFileWithARestartMarkerFirst('2026:07:04 08:00:00')).clock),
    '2026-07-04 08:00:00',
  ));
  await context.test('a movie box declaring that it runs to the end of the file is still read', () => assert.equal(
    formatCameraClock(clockInside(movieFileWhoseMovieBoxRunsToTheEnd('2026-07-04 10:00:00')).clock),
    '2026-07-04 10:00:00',
  ));
  await context.test('a jpeg hiding its exif behind more segments than are worth walking gives up rather than hanging',
    () => assert.equal(clockInside(jpegFileBuriedUnderManySegments('2026:07:04 09:00:00')), null));

});

test('the raw every maker writes', async (context) => {
  const ordinaryTiff = (dateTimeOriginal) => tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal });
  const olympusRaw = (signature, dateTimeOriginal) => tiffFile({ signature, dateTimeOriginal });

  const rawFromEachMaker = [
    ['a Canon CR2', ordinaryTiff('2026:08:27 09:00:00'), '2026-08-27 09:00:00'],
    ['a Nikon NEF', ordinaryTiff('2026:08:27 09:01:00'), '2026-08-27 09:01:00'],
    ['a Nikon NRW', ordinaryTiff('2026:08:27 09:02:00'), '2026-08-27 09:02:00'],
    ['a Sony ARW', ordinaryTiff('2026:08:27 09:03:00'), '2026-08-27 09:03:00'],
    ['a Pentax PEF', ordinaryTiff('2026:08:27 09:04:00'), '2026-08-27 09:04:00'],
    ['an Olympus ORF', olympusRaw(OLYMPUS_RAW_SIGNATURE, '2026:08:27 09:05:00'), '2026-08-27 09:05:00'],
    ['an OM System ORF', olympusRaw(OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES, '2026:08:27 09:06:00'), '2026-08-27 09:06:00'],
  ];
  for (const [whatItIs, contents, whenItWasShot] of rawFromEachMaker) {
    await context.test(`${whatItIs} is read for the date the camera wrote in it`,
      () => assert.equal(clockTextInside(contents), whenItWasShot));
  }

  await context.test('a raw written most significant byte first is read the same as one written the other way round',
    () => assert.equal(clockTextInside(bigEndianTiffFile('2026:08:27 09:07:00')), '2026-08-27 09:07:00'));
  await context.test('a raw whose signature belongs to no maker this knows is still read, the way exiftool reads one', () => assert.equal(
    clockTextInside(tiffFile({ signature: 0x4949, dateTimeOriginal: '2026:08:27 09:08:00' })),
    '2026-08-27 09:08:00',
  ));
  await context.test('a big tiff pointing at its exif with a narrow offset is read whichever way round its bytes are', () => assert.equal(
    clockTextInside(bigTiffFile('2026:08:27 09:09:00', { bigEndian: true, pointerType: TIFF_VALUE_TYPE_LONG })),
    '2026-08-27 09:09:00',
  ));
  await context.test('a photo carrying the segments a colour managed photo really carries is read', () => assert.equal(
    clockTextInside(jpegFileBehindAsManySegmentsAsAPhotoReallyHas('2026:08:27 09:10:00')),
    '2026-08-27 09:10:00',
  ));
});

// Everything that is neither a TIFF, a JPEG nor a box tree. These are the formats a
// camera, a phone or a camcorder writes that used to leave a file undated.
test('the formats that are built some other way', async (context) => {
  const eachOne = [
    ['a screenshot carrying exif', pngStill('2026:08:27 10:00:00'), '2026-08-27 10:00:00'],
    ['a png dated only in its text', pngStillDatedOnlyInItsText('Thu, 27 Aug 2026 10:01:00 +0000'), '2026-08-27 10:01:00'],
    ['a webp off a phone', webPStill('2026:08:27 10:02:00'), '2026-08-27 10:02:00'],
    ['a jpeg xl', jpegXlStill('2026:08:27 10:03:00'), '2026-08-27 10:03:00'],
    ['an avi recording when it was shot', aviFileRecordingWhenItWasShot('Thu Aug 27 10:04:00 2026'), '2026-08-27 10:04:00'],
    ['an avi saying only when it was created', aviFileSayingOnlyWhenItWasCreated('2026-08-27 10:05:00'), '2026-08-27 10:05:00'],
    ['a matroska recording', matroskaMovie('2026-08-27 10:06:00'), '2026-08-27 10:06:00'],
    ['a windows media clip', windowsMediaMovie('2026-08-27 10:07:00'), '2026-08-27 10:07:00'],
    ['a tape camcorder clip', digitalVideoClip('2026-08-27 10:08:00'), '2026-08-27 10:08:00'],
    ['a cinema camera take', redcodeClip('2026-08-27 10:10:00'), '2026-08-27 10:10:00'],
    ['a cinema camera take whose header does not say where its directory is', redcodeClip('2026-08-27 10:11:00', { headerSaysWhereTheDirectoryIs: false }), '2026-08-27 10:11:00'],
    ['a png dated only by when it was written', pngStillDatedOnlyByWhenItWasLastWritten('2026-08-27 10:09:00'), '2026-08-27 10:09:00'],
  ];
  for (const [whatItIs, contents, whenItWasShot] of eachOne) {
    await context.test(`${whatItIs} is read for the date inside it`,
      () => assert.equal(clockTextInside(contents), whenItWasShot));
  }

  await context.test('a png with nothing in it to go on is left undated rather than guessed at',
    () => assert.equal(clockTextInside(pngStillDatedOnlyInItsText('no date here at all')), null));
});

test('the containers that hold their Exif somewhere else', async (context) => {
  const shotAt = '2026:08:27 09:07:01';
  const whenItWasShot = '2026-08-27 09:07:01';

  await context.test('a Canon CR3 is read from the Exif Canon buries in moov/uuid/CMT2',
    () => assert.equal(clockTextInside(canonRawFile(shotAt)), whenItWasShot));
  await context.test('a Canon CRM, which is the same container, is read the same way',
    () => assert.equal(clockTextInside(canonRawFile(shotAt)), whenItWasShot));
  await context.test('a Fujifilm RAF is read from the JPEG its header points at',
    () => assert.equal(clockTextInside(fujifilmRawFile(shotAt)), whenItWasShot));

  const heifShapes = [
    ['the usual shape', {}],
    ['an item location written the older way, without a construction method', { itemLocationVersion: 0 }],
    ['long item ids throughout', { itemLocationVersion: 2, itemEntryVersion: 3 }],
    ['a payload that does not spell out the Exif marker', { spellsOutTheExifMarker: false }],
  ];
  for (const [whatIsUnusualAboutIt, shape] of heifShapes) {
    await context.test(`a HEIF still is read for its date, with ${whatIsUnusualAboutIt}`,
      () => assert.equal(clockTextInside(heifStill(shotAt, shape)), whenItWasShot));
  }

  await context.test('a BigTIFF raw is read, its counts and offsets being eight bytes wide rather than four',
    () => assert.equal(clockTextInside(bigTiffFile(shotAt)), whenItWasShot));
  await context.test('and the same file written most significant byte first',
    () => assert.equal(clockTextInside(bigTiffFile(shotAt, { bigEndian: true })), whenItWasShot));
});

test('the raw formats that predate TIFF', async (context) => {
  const whenItWasShot = '2026-08-27 09:07:01';

  await context.test('a Minolta MRW is read from the TIFF block it wraps',
    () => assert.equal(clockTextInside(minoltaRawFile('2026:08:27 09:07:01')), whenItWasShot));
  await context.test('a Canon CRW is read from the capture time in its CIFF heap, nested directory and all',
    () => assert.equal(clockTextInside(canonCiffRawFile(whenItWasShot)), whenItWasShot));
  await context.test('a Sigma X3F is read from the TIME property in its property list',
    () => assert.equal(clockTextInside(sigmaRawFile(whenItWasShot)), whenItWasShot));

  const aCrwThatIsNotReallyOne = Buffer.alloc(128);
  aCrwThatIsNotReallyOne.write('II', 0, 'latin1');
  aCrwThatIsNotReallyOne.writeUInt32LE(26, 2);
  aCrwThatIsNotReallyOne.write('HEAPCCDR', 6, 'latin1');
  await context.test('a CIFF file holding no capture time reports none rather than inventing one',
    () => assert.equal(clockTextInside(aCrwThatIsNotReallyOne), null));
  await context.test('and a Sigma raw whose directory pointer leads nowhere does the same', () => assert.equal(
    clockTextInside(Buffer.concat([Buffer.from('FOVb', 'latin1'), Buffer.alloc(60, 9)])),
    null,
  ));
});

test('video filed by the clock the camera was set to', async (context) => {
  const theClockOnTheCamera = '2026-08-27 09:07:01';
  const theSameMomentInUtc = '2026-08-27 07:07:01';

  await context.test('a clip whose movie header is in UTC is filed by the local time its user data spells out', () => assert.equal(
    clockTextInside(movieFileSayingWhichZoneItsClockIsIn(theSameMomentInUtc, '2026-08-27T09:07:01+0200')),
    theClockOnTheCamera,
  ));
  await context.test('a Canon clip is filed by the Exif in the thumbnail Canon stores beside the video', () => assert.equal(
    clockTextInside(movieFileCarryingACanonThumbnail(theSameMomentInUtc, '2026:08:27 09:07:01')),
    theClockOnTheCamera,
  ));
  await context.test('an iPhone clip is filed by the creation date Apple writes into its metadata keys', () => assert.equal(
    clockTextInside(movieFileWithAnAppleCreationDate(theSameMomentInUtc, '2026-08-27T09:07:01+0200')),
    theClockOnTheCamera,
  ));

  await context.test('a spelled-out date that says only that it is UTC is passed over, leaving the movie header to answer', () => assert.equal(
    clockTextInside(movieFileSayingWhichZoneItsClockIsIn(theClockOnTheCamera, '2026-08-27T09:07:01Z')),
    theClockOnTheCamera,
  ));
  await context.test('a clip that spells out no zone at all is still read from its movie header, as Panasonic clips are',
    () => assert.equal(clockTextInside(movieFile(theClockOnTheCamera)), theClockOnTheCamera));
});
