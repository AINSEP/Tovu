import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as portable from '@jini-ai/integrations/credentialed-http/tools';
import { CustomCredentialNotFoundError } from '@jini-ai/integrations/credentialed-http/sets';
import { createCredentialSaveHandlers, createCredentialToolRegistrations } from '../tool-registrations.js';
import { createCredentialCopyRegistrations } from '../credential-copy-tool.js';
import * as hostErrors from '../store.js';

test('credential tool compatibility entries retain canonical public functions and error identities', () => {
  assert.equal(createCredentialSaveHandlers, portable.createCredentialSaveHandlers);
  assert.equal(createCredentialToolRegistrations, portable.createCredentialToolRegistrations);
  assert.equal(createCredentialCopyRegistrations, portable.createCredentialCopyRegistrations);
  assert.equal(hostErrors.CustomCredentialNotFoundError, CustomCredentialNotFoundError);
});

test('the installed tool declarations retain named security and ordering notes and public factory notes', () => {
  const noted = new Set(['CredentialCardIdentity', 'CustomCredentialToolVocabulary', 'CustomCredentialSecretCards', 'CustomCredentialToolPorts', 'CredentialCopyProjectKeysPort', 'CredentialCopyMessages', 'CredentialCopyToolHost', 'CredentialApprovalDescription', 'CredentialApprovalPort', 'CredentialPluginCardsPort', 'CredentialCreatePrefill', 'CredentialCardFormsPort', 'CredentialSetupDiagnostic', 'CredentialRecoveryPort', 'CredentialPublishPort', 'CredentialLocalePort', 'CredentialToolPolicy', 'CredentialWriteFilesRequest', 'CredentialToolMessages', 'CredentialToolDiagnostics', 'CredentialToolSetsPort', 'CredentialToolActorDeps', 'CredentialToolOperations', 'CredentialToolSurfaces', 'CredentialCopyRequired', 'createCredentialSaveHandlers', 'createCredentialToolRegistrations', 'createCredentialCopyRegistrations']);
  const entry = import.meta.resolve('@jini-ai/integrations/credentialed-http/tools');
  for (const name of ['credential-tool-host', 'credential-tool-operations', 'tool-registrations', 'credential-copy-tool']) {
    const text = readFileSync(new URL(`./${name}.d.ts`, entry), 'utf8');
    const source = ts.createSourceFile(`${name}.d.ts`, text, ts.ScriptTarget.Latest, true);
    const declarations = source.statements.filter(statement => ts.isInterfaceDeclaration(statement)
      || (ts.isFunctionDeclaration(statement) && ['createCredentialSaveHandlers', 'createCredentialToolRegistrations', 'createCredentialCopyRegistrations'].includes(statement.name?.text ?? '')));
    assert.ok(declarations.length, name);
    for (const declaration of declarations) {
      if('name' in declaration && declaration.name && noted.has(declaration.name.getText(source))) assert.match(text.slice(declaration.getFullStart(), declaration.getStart(source)), /@agent-note/, declaration.getText(source));
    }
    assert.doesNotMatch(text, /from\s+["'](?:#src\/|@tovu\/|@jini-ai\/(?!core))/);
  }
});

type Assert<True extends true> = True;
export type RequiredHost = Assert<{} extends Pick<Parameters<typeof portable.createCredentialSaveHandlers>[0], 'host'> ? false : true>;
export type RequiredOperations = Assert<{} extends Pick<Parameters<typeof portable.createCredentialToolRegistrations>[0], 'operations'> ? false : true>;
export type RequiredCopyHost = Assert<{} extends Pick<Parameters<typeof portable.createCredentialCopyRegistrations>[0], 'host'> ? false : true>;
