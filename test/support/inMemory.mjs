import path from 'node:path';
import { byteSourceForBuffer } from '../../src/bytes.mjs';
import { readCameraClockFromByteSource } from '../../src/formats/registry.mjs';
import { formatCameraClock } from '../../src/clock.mjs';

export const clockInside = (buffer) => readCameraClockFromByteSource(byteSourceForBuffer(buffer));

export const clockTextInside = (buffer) => {
  const found = clockInside(buffer);
  return found === null ? null : formatCameraClock(found.clock);
};

// The planner hands back paths put through path.resolve, which on Windows adds a drive
// letter and backslashes, so a card spelled the Unix way is resolved the same way.
export const asThisPlatformSpellsIt = (unixPath) => path.resolve(unixPath);

export const probeOver = (pathsThatExist, groupsOfPathsHoldingOnePhoto = []) => ({
  exists: (candidatePath) => pathsThatExist.map(asThisPlatformSpellsIt).includes(candidatePath),
  contentsMatch: (firstPath, secondPath) =>
    groupsOfPathsHoldingOnePhoto.some((group) => group.map(asThisPlatformSpellsIt).includes(firstPath)
      && group.map(asThisPlatformSpellsIt).includes(secondPath)),
});

export const candidate = (filePath, { clock = null, dateSource = null, sizeInBytes = 1000, fileTimestamp = new Date(2026, 7, 27, 12) } = {}) =>
  ({ path: asThisPlatformSpellsIt(filePath), sortRoot: asThisPlatformSpellsIt('/card'), sizeInBytes, fileTimestamp, clock, dateSource });
