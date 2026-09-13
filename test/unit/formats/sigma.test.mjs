import test from 'node:test';
import assert from 'node:assert/strict';
import { sigmaCaptureTimeProperty, sigmaPropertySection, sigmaRawFileHolding } from '../../fixtures/sigma.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';

const SHOT = '2026-08-27 11:20:00';
const MOST_PROPERTIES_READ = 256;
const MOST_SECTIONS_READ = 64;

const propertiesWithTheTime = (howManyBefore = 1) => [
  ...[...Array(howManyBefore).keys()].map((index) => [`P${index}`, '1']),
  sigmaCaptureTimeProperty(SHOT),
];
const aPropertySection = (layout) => ({ type: 'PROP', bytes: sigmaPropertySection(propertiesWithTheTime(), layout) });
const aSectionOfAnotherKind = { type: 'IMAG', bytes: Buffer.alloc(16) };
const readFrom = (sections, layout) => clockTextInside(sigmaRawFileHolding(sections, layout));

test('the section directory a Sigma raw ends with', async (context) => {
  await context.test('a directory without its own mark is not read', () => assert.equal(readFrom([aPropertySection()], { directoryMark: 'SECx' }), null));
  await context.test('the property section is found when it is not the first', () => assert.equal(readFrom([aSectionOfAnotherKind, aPropertySection()]), SHOT));
  await context.test('a section past the count the directory declares is not read', () => assert.equal(
    readFrom([aSectionOfAnotherKind, aPropertySection()], { sectionsInTheDirectory: 1 }),
    null,
  ));
  await context.test('a directory listing as many sections as are worth reading is read', () => assert.equal(
    readFrom([...Array.from({ length: MOST_SECTIONS_READ - 1 }, () => aSectionOfAnotherKind), aPropertySection()]),
    SHOT,
  ));
  await context.test('and one listing a section more is not', () => assert.equal(
    readFrom([...Array.from({ length: MOST_SECTIONS_READ }, () => aSectionOfAnotherKind), aPropertySection()]),
    null,
  ));
  await context.test('a table of properties in a section not typed PROP is not read',
    () => assert.equal(readFrom([{ type: 'IMAG', bytes: aPropertySection().bytes }]), null));
  await context.test('a property section with no capture time leaves the next one to be read', () => assert.equal(
    readFrom([{ type: 'PROP', bytes: sigmaPropertySection([['CAMMANUF', 'SIGMA']]) }, aPropertySection()]),
    SHOT,
  ));
});

test('the property section of a Sigma raw', async (context) => {
  await context.test('a section without its own mark is not read', () => assert.equal(readFrom([aPropertySection({ mark: 'SECx' })]), null));
  await context.test('a property past the count the section declares is not read, however it is laid out', () => assert.equal(
    readFrom([aPropertySection({ propertiesInTheTable: 1, anEntryHiddenAtTheStartOfTheText: true })]),
    null,
  ));
  await context.test('a section declaring as many properties as are worth reading is read', () => assert.equal(
    readFrom([{ type: 'PROP', bytes: sigmaPropertySection(propertiesWithTheTime(MOST_PROPERTIES_READ - 1)) }]),
    SHOT,
  ));
  await context.test('and one declaring a property more is not', () => assert.equal(
    readFrom([{ type: 'PROP', bytes: sigmaPropertySection(propertiesWithTheTime(MOST_PROPERTIES_READ)) }]),
    null,
  ));
});
