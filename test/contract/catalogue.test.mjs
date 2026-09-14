import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { everyFixtureFormatIsBuiltFrom } from '../fixtures/catalogue.mjs';
import { byteSourceForBuffer } from '../../src/bytes.mjs';
import { formatCameraClock } from '../../src/clock.mjs';
import { MEDIA_FILE_EXTENSIONS } from '../../src/extensions.mjs';
import { FORMATS_IN_THE_ORDER_THEY_ARE_TRIED } from '../../src/formats/registry.mjs';

const formatNamed = new Map(FORMATS_IN_THE_ORDER_THEY_ARE_TRIED.map((format) => [format.name, format]));

function whatTheReaderItNamesReads({ bytes, readBy }) {
  const reader = formatNamed.get(readBy);
  const byteSource = byteSourceForBuffer(bytes);
  if (reader.recognisedBy !== null && !reader.recognisedBy(byteSource)) return 'a file its reader does not recognise';
  const clock = reader.read(byteSource);
  return clock === null ? null : formatCameraClock(clock);
}

test('the catalogue of fixtures', async (context) => {
  const catalogue = everyFixtureFormatIsBuiltFrom();

  await context.test('every fixture names a reader the registry has', () => assert.deepEqual(
    catalogue.filter(({ readBy }) => !formatNamed.has(readBy)).map(({ fileName, readBy }) => `${fileName}: ${readBy}`),
    [],
  ));
  await context.test('every fixture, handed to the reader it names, reads as its record says', () => assert.deepEqual(
    catalogue.filter((fixture) => formatNamed.has(fixture.readBy) && whatTheReaderItNamesReads(fixture) !== fixture.readAs)
      .map((fixture) => `${fixture.fileName}: ${fixture.readBy} read ${whatTheReaderItNamesReads(fixture)}`),
    [],
  ));
  await context.test('every format the program can read has a fixture of its own', () => assert.deepEqual(
    [...formatNamed.keys()].filter((name) => !catalogue.some(({ readBy }) => readBy === name)),
    [],
  ));
  await context.test('every fixture is named the way the program would pick the file up', () => assert.deepEqual(
    catalogue.filter(({ fileName }) => !MEDIA_FILE_EXTENSIONS.has(path.extname(fileName).toUpperCase())).map(({ fileName }) => fileName),
    [],
  ));
});
