import path from 'node:path';
import { byteSourceForBuffer } from '../../src/bytes.mjs';
import { readCameraClockFromByteSource } from '../../src/formats/registry.mjs';
import { cameraClockFromExifText, formatCameraClock } from '../../src/clock.mjs';

export const clockInside = (buffer) => readCameraClockFromByteSource(byteSourceForBuffer(buffer));

export const clockTextInside = (buffer) => {
  const found = clockInside(buffer);
  return found === null ? null : formatCameraClock(found.clock);
};

// A probe that answers from a list of paths rather than from a disk. `sameBytes` names the
// groups of paths that hold one photo; anything not named holds bytes of its own.
// Every path the planner hands back has been through path.resolve, which on Windows means
// a drive letter and backslashes. These tests spell a card the Unix way because it reads
// better, so both what goes in and what is expected back is put through the same resolve.
// On Unix it changes nothing; on Windows it is the difference between comparing two paths
// and comparing two notations.
export const asThisPlatformSpellsIt = (unixPath) => path.resolve(unixPath);

export const probeOver = (pathsThatExist, sameBytes = []) => ({
  exists: (candidatePath) => pathsThatExist.map(asThisPlatformSpellsIt).includes(candidatePath),
  contentsMatch: (firstPath, secondPath) =>
    sameBytes.some((group) => group.map(asThisPlatformSpellsIt).includes(firstPath)
      && group.map(asThisPlatformSpellsIt).includes(secondPath)),
});

export const candidate = (filePath, { clock = null, dateSource = null, sizeInBytes = 1000, fileTimestamp = new Date(2026, 7, 27, 12) } = {}) =>
  ({ path: asThisPlatformSpellsIt(filePath), sortRoot: asThisPlatformSpellsIt('/card'), sizeInBytes, fileTimestamp, clock, dateSource });

export const exif = (text) => cameraClockFromExifText(text);
