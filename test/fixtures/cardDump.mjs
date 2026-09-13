import path from 'node:path';
import { PANASONIC_RAW_SIGNATURE, tiffFile } from './tiff.mjs';
import { jpegFile } from './jpeg.mjs';
import { panasonicRawWithDateOnlyInEmbeddedJpeg } from './panasonic.mjs';
import { movieFile } from './quicktime.mjs';
import { writeFixtureFile } from '../support/files.mjs';

const PRETEND_HLG_PHOTO_FILL_BYTE = 3;
const BYTES_IN_PRETEND_HLG_PHOTO = 64;
const TRANSPORT_STREAM_SYNC_BYTE = 0x47;

const BYTES_IN_PRETEND_AVCHD_CLIP = 2048;
const BYTES_IN_PRETEND_CLIP_INFO_SIDECAR = 64;
const BYTES_MAKING_THE_SECOND_PHOTO_DIFFERENT = 64;
const SECOND_PHOTO_FILL_BYTE = 9;

export function buildCardDump(directory, { everyFileStampedAt = null } = {}) {
  const stampFor = (whenItWasShot) => new Date(everyFileStampedAt ?? whenItWasShot);
  const firstCardFolder = path.join(directory, 'DCIM', '100_PANA');
  const secondCardFolder = path.join(directory, 'DCIM', '101_PANA');
  const avchdStreamFolder = path.join(directory, 'PRIVATE', 'AVCHD', 'BDMV', 'STREAM');
  const avchdClipInfoFolder = path.join(directory, 'PRIVATE', 'AVCHD', 'BDMV', 'CLIPINF');

  const rawAndJpegOfTheSameShot = '2026:08:27 09:07:01';
  writeFixtureFile(path.join(firstCardFolder, 'P1000001.JPG'), jpegFile(rawAndJpegOfTheSameShot), stampFor('2026-08-27T09:07:01'));
  writeFixtureFile(path.join(firstCardFolder, 'P1000001.RW2'),
    tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: rawAndJpegOfTheSameShot }), stampFor('2026-08-27T09:07:01'));

  writeFixtureFile(path.join(firstCardFolder, 'P1000002.JPG'), jpegFile('2026:08:27 10:15:00'), stampFor('2026-08-27T10:15:00'));
  writeFixtureFile(path.join(firstCardFolder, 'P1000002.RW2'),
    tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: null }), stampFor('2026-08-27T10:15:00'));

  writeFixtureFile(path.join(firstCardFolder, 'P1000003.RW2'),
    panasonicRawWithDateOnlyInEmbeddedJpeg('2026:08:27 11:00:00'), stampFor('2026-08-27T11:00:00'));

  writeFixtureFile(path.join(firstCardFolder, 'P1000004.HSP'),
    Buffer.alloc(BYTES_IN_PRETEND_HLG_PHOTO, PRETEND_HLG_PHOTO_FILL_BYTE), stampFor('2026-08-27T12:00:00'));

  writeFixtureFile(path.join(firstCardFolder, 'P1000005.MP4'), movieFile('2026-08-28 00:20:00'), stampFor('2026-08-28T00:20:00'));
  writeFixtureFile(path.join(firstCardFolder, 'P1000006.MP4'),
    movieFile('2026-08-28 14:00:00', { creationTimeIs64Bit: true, videoDataUses64BitBoxSize: true }), stampFor('2026-08-28T14:00:00'));
  writeFixtureFile(path.join(firstCardFolder, 'P1000007.MOV'), movieFile('2026-08-29 08:30:00'), stampFor('2026-08-29T08:30:00'));

  const differentPhotoReusingTheSameFileNumber = Buffer.concat([
    jpegFile('2026:08:27 18:00:00'),
    Buffer.alloc(BYTES_MAKING_THE_SECOND_PHOTO_DIFFERENT, SECOND_PHOTO_FILL_BYTE),
  ]);
  writeFixtureFile(path.join(secondCardFolder, 'P1000001.JPG'), differentPhotoReusingTheSameFileNumber, stampFor('2026-08-27T18:00:00'));

  writeFixtureFile(path.join(avchdStreamFolder, '00000.MTS'),
    Buffer.alloc(BYTES_IN_PRETEND_AVCHD_CLIP, TRANSPORT_STREAM_SYNC_BYTE), stampFor('2026-08-29T21:10:00'));
  writeFixtureFile(path.join(avchdClipInfoFolder, '00000.CPI'), Buffer.alloc(BYTES_IN_PRETEND_CLIP_INFO_SIDECAR));
  writeFixtureFile(path.join(directory, '.Spotlight-V100', 'junk.JPG'), jpegFile('1999:01:01 00:00:00'));

  return directory;
}
