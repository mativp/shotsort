import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { byteSourceForBuffer } from '../../src/bytes.mjs';
import { MEDIA_FILE_EXTENSIONS } from '../../src/extensions.mjs';
import { FORMATS_IN_THE_ORDER_THEY_ARE_TRIED } from '../../src/formats/registry.mjs';
import { everyFixtureFormatIsBuiltFrom } from '../fixtures/catalogue.mjs';

const readsAFixtureIn = (catalogue, format) => catalogue.some(({ bytes }) => {
  const byteSource = byteSourceForBuffer(bytes);
  return (format.recognisedBy === null || format.recognisedBy(byteSource)) && format.read(byteSource) !== null;
});

test('the catalogue of fixtures', async (context) => {
  const catalogue = everyFixtureFormatIsBuiltFrom();

  await context.test('every format the program can read is read out of at least one fixture', () => assert.deepEqual(
    FORMATS_IN_THE_ORDER_THEY_ARE_TRIED.filter((format) => !readsAFixtureIn(catalogue, format)).map((format) => format.name),
    [],
  ));
  await context.test('every fixture is named the way the program would pick the file up', () => assert.deepEqual(
    catalogue.filter(({ fileName }) => !MEDIA_FILE_EXTENSIONS.has(path.extname(fileName).toUpperCase())).map(({ fileName }) => fileName),
    [],
  ));
});
