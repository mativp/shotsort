// The only two questions planning asks of the disk: is something already sitting at this
// path, and if so is it the same photo. Keeping them behind this pair of methods is what
// lets the whole of plan.mjs be worked out without a filesystem under it.
import fs from 'node:fs';

const BYTES_COMPARED_PER_READ = 1024 * 1024;

function filesHaveIdenticalContents(firstPath, secondPath, sizeInBytes) {
  let firstDescriptor;
  let secondDescriptor;
  try {
    if (fs.statSync(secondPath).size !== sizeInBytes) return false;
    firstDescriptor = fs.openSync(firstPath, 'r');
    secondDescriptor = fs.openSync(secondPath, 'r');

    const firstChunk = Buffer.alloc(BYTES_COMPARED_PER_READ);
    const secondChunk = Buffer.alloc(BYTES_COMPARED_PER_READ);
    for (let position = 0; position < sizeInBytes;) {
      const bytesFromFirst = fs.readSync(firstDescriptor, firstChunk, 0, BYTES_COMPARED_PER_READ, position);
      if (bytesFromFirst === 0) return false;
      const bytesFromSecond = fs.readSync(secondDescriptor, secondChunk, 0, bytesFromFirst, position);
      if (bytesFromSecond !== bytesFromFirst) return false;
      if (!firstChunk.subarray(0, bytesFromFirst).equals(secondChunk.subarray(0, bytesFromFirst))) return false;
      position += bytesFromFirst;
    }
    return true;
  } catch {
    return false;
  } finally {
    if (firstDescriptor !== undefined) fs.closeSync(firstDescriptor);
    if (secondDescriptor !== undefined) fs.closeSync(secondDescriptor);
  }
}

// Planning asks about the same pair twice -- once when telling two photos of one name
// apart, once when choosing where the second of them goes -- and a pair of raw files is
// tens of megabytes, so the answer is remembered for as long as the plan is being made.
export function destinationProbeOverTheFilesystem() {
  const answerForEachPair = new Map();

  return {
    exists: (candidatePath) => fs.existsSync(candidatePath),
    contentsMatch: (firstPath, secondPath, sizeInBytes) => {
      const pair = firstPath < secondPath ? `${firstPath}\0${secondPath}` : `${secondPath}\0${firstPath}`;
      const alreadyAnswered = answerForEachPair.get(pair);
      if (alreadyAnswered !== undefined) return alreadyAnswered;
      const theyMatch = filesHaveIdenticalContents(firstPath, secondPath, sizeInBytes);
      answerForEachPair.set(pair, theyMatch);
      return theyMatch;
    },
  };
}
