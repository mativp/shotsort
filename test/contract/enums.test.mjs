import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACEMENT } from '../../src/plan.mjs';
import { FILESYSTEM_DATE_USE } from '../../src/dating.mjs';
import { DATE_SOURCE } from '../../src/dateSource.mjs';
import { readProjectFile, sourceFiles } from '../support/project.mjs';

test('every enum member the code refers to exists', async (context) => {
  const enumsByName = { PLACEMENT, FILESYSTEM_DATE_USE, DATE_SOURCE };
  const referenceToAnEnumMember = /\b(PLACEMENT|FILESYSTEM_DATE_USE|DATE_SOURCE)\.([A-Za-z][A-Za-z0-9]*)/g;
  const referencesThatResolveToNothing = sourceFiles().flatMap((file) => [...readProjectFile(file).matchAll(referenceToAnEnumMember)]
    .filter(([, enumName, memberName]) => enumsByName[enumName][memberName] === undefined)
    .map(([reference]) => `${file}: ${reference}`));

  await context.test('every enum member the code refers to actually exists',
    () => assert.deepEqual(referencesThatResolveToNothing, []));
});
