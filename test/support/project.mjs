import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const readProjectFile = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

export function projectFilesUnder(topLevelDirectory) {
  const walk = (directory) => fs.readdirSync(path.join(projectRoot, directory), { withFileTypes: true })
    .flatMap((directoryEntry) => {
      const relativePath = path.posix.join(directory, directoryEntry.name);
      if (directoryEntry.isDirectory()) return walk(relativePath);
      return directoryEntry.name.endsWith('.mjs') ? [relativePath] : [];
    });
  return walk(topLevelDirectory);
}

export const sourceFiles = () => ['bin', 'cli', 'src'].flatMap(projectFilesUnder);

export const withoutCommentLines = (sourceText) => sourceText.replace(/^\s*\/\/.*$/gm, '');

const WHAT_MAY_STAND_BETWEEN_TWO_IMPORTS = /^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#![^\n]*)/;
const AN_IMPORT_OR_RE_EXPORT = /^(?:(?:import|export)\b[^;]*?\bfrom\s*|import\s*)['"]([^'"]+)['"]\s*;/;

function theImportsAtTheTopOf(sourceText) {
  const specifiers = [];
  let rest = sourceText;
  for (;;) {
    const between = WHAT_MAY_STAND_BETWEEN_TWO_IMPORTS.exec(rest);
    if (between) {
      rest = rest.slice(between[0].length);
      continue;
    }
    const statement = AN_IMPORT_OR_RE_EXPORT.exec(rest);
    if (!statement) return { specifiers, afterThem: rest };
    specifiers.push(statement[1]);
    rest = rest.slice(statement[0].length);
  }
}

export function importsOf(relativePath) {
  const { specifiers } = theImportsAtTheTopOf(readProjectFile(relativePath));
  return {
    modules: specifiers.filter((specifier) => specifier.startsWith('.'))
      .map((specifier) => path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), specifier))),
    outsideTheProject: specifiers.filter((specifier) => !specifier.startsWith('.')),
  };
}

const AN_IMPORT_ANYWHERE_ELSE = /^\s*(?:import|export)\b[^;]*?\bfrom\s*['"]|^\s*import\s*['"]|\bimport\s*\(|\brequire\s*\(|\bgetBuiltinModule\s*\(/m;

export const importsBelowTheTopOf = (relativePath) =>
  AN_IMPORT_ANYWHERE_ELSE.test(withoutCommentLines(theImportsAtTheTopOf(readProjectFile(relativePath)).afterThem));
