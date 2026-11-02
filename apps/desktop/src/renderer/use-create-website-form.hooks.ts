/**
 * @file The create-website onboarding form: its pure rules (slug, readiness, the create input) and
 * the hook that holds its fields. Split out of `App.hooks.ts` (which still re-exports all of it)
 * with no behaviour change.
 */
import { useRef, useState, type Dispatch, type FormEvent, type RefObject, type SetStateAction } from 'react';
import { SITE_NAME_ERROR, siteNameError } from '../contracts/site-name.js';
import { humanSiteError } from './site-shell-policy.js';
import type { CreateSiteInput, DatabaseProviderKind } from '../contracts/project.js';

function refValue(ref: RefObject<HTMLInputElement | null>): string {
  return ref.current?.value ?? '';
}

/** Pure — no React/DOM dependency, so this is unit-testable on its own. */
export function computeCanCreate(input: {
  slug: string;
  database: DatabaseProviderKind;
  supabaseReady: boolean;
  customReady: boolean;
}): boolean {
  if (input.slug.length === 0) return false;
  if (input.database === 'sqlite') return true;
  return input.database === 'supabase' ? input.supabaseReady : input.customReady;
}

/** Select and trim only the selected database's endpoint; SQLite has none.
 * Pure: no side effects or errors. Time and space are O(n) in the chosen endpoint's length.
 */
function createProjectDatabaseEndpoint(input: {
  database: DatabaseProviderKind;
  supabaseUrl: string;
  customConnection: string;
}, _options = {}): string | undefined {
  if (input.database === 'supabase') return input.supabaseUrl.trim();
  if (input.database === 'custom') return input.customConnection.trim();
  return undefined;
}

/** Pure — takes every value it needs as an explicit argument rather than closing over component
 *  state, so the submit handler that calls it stays a thin orchestrator. */
export function buildCreateProjectInput(input: {
  displayName: string;
  database: DatabaseProviderKind;
  customProviderLabel: string;
  supabaseUrl: string;
  customConnection: string;
  supabaseKey: string;
  customCredential: string;
}): CreateSiteInput {
  const endpoint = createProjectDatabaseEndpoint(input);
  let credentialValue = '';
  if (input.database === 'supabase') credentialValue = input.supabaseKey;
  if (input.database === 'custom') credentialValue = input.customCredential;

  return {
    displayName: input.displayName,
    database: {
      kind: input.database,
      ...(input.database === 'custom' && input.customProviderLabel.trim() ? { label: input.customProviderLabel.trim() } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(credentialValue ? { credential: credentialValue } : {}),
    },
  };
}

/**
 * The typed website name reduced to a compact identifier, read by {@link computeCanCreate}
 * as "a name has been entered". The form describes the actual chosen-folder behaviour separately.
 *
 * Unicode-aware by necessity, not by preference. The original `[^a-z0-9]+` deleted every character
 * of a name written in any non-Latin script, so the slug came back empty and `computeCanCreate`
 * refused to enable "Create website": there was no name an operator could type in Japanese, Hindi,
 * Greek, Cyrillic or Arabic that this form would accept at all. It also mangled accented Latin
 * names — `Café Münster` was previewed back as `caf-m-nster`.
 *
 * `\p{M}` is in the keep-set alongside letters and numbers because several scripts write their
 * vowels as combining marks rather than letters; without it `हिन्दी` splits into separator-joined
 * fragments. Anything else still collapses to a separator, so a name with no letters or digits in
 * it (`"!!!"`, whitespace) still yields `''` — the signal the create gate depends on.
 *
 * @complexity O(n) in name length.
 */
export function siteSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

export interface CreateWebsiteFormState {
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  database: DatabaseProviderKind;
  setDatabase: Dispatch<SetStateAction<DatabaseProviderKind>>;
  supabaseUrl: string;
  setSupabaseUrl: Dispatch<SetStateAction<string>>;
  setHasSupabaseKey: Dispatch<SetStateAction<boolean>>;
  customProvider: string;
  setCustomProvider: Dispatch<SetStateAction<string>>;
  customConnection: string;
  setCustomConnection: Dispatch<SetStateAction<string>>;
  setHasCustomCredential: Dispatch<SetStateAction<boolean>>;
  supabaseKeyRef: RefObject<HTMLInputElement | null>;
  customCredentialRef: RefObject<HTMLInputElement | null>;
  slug: string;
  canCreate: boolean;
  isSubmitting: boolean;
  formError: string | null;
  nameError?: string | null;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

/**
 * The create-website onboarding form: every field, its derived validity, and submission.
 *
 * `hasSupabaseKey`/`hasCustomCredential` track only whether a secret was typed, never the secret
 * itself — the two password inputs stay uncontrolled (`supabaseKeyRef`/`customCredentialRef`) so
 * React holds no copy of a credential anywhere in state or a re-render.
 */
export function useCreateWebsiteForm(
  onCreate: (input: CreateSiteInput) => Promise<void>,
): CreateWebsiteFormState {
  const [name, setName] = useState('');
  const [database, setDatabase] = useState<DatabaseProviderKind>('sqlite');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [hasSupabaseKey, setHasSupabaseKey] = useState(false);
  const [customProvider, setCustomProvider] = useState('');
  const [customConnection, setCustomConnection] = useState('');
  // Tracked but not read below — see the parity note on `hasSupabaseKey`. A custom provider's
  // credential is optional (the form says so), so `customReady` never gates on it; kept as state
  // so a future required-credential provider has somewhere to plug in without a new field.
  const [, setHasCustomCredential] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const supabaseKeyRef = useRef<HTMLInputElement>(null);
  const customCredentialRef = useRef<HTMLInputElement>(null);
  const slug = siteSlug(name);
  const supabaseReady = supabaseUrl.trim().length > 0 && hasSupabaseKey;
  const customReady = customProvider.trim().length > 0 && customConnection.trim().length > 0;
  const nameError = name.length > 0 ? siteNameError({ name }) : null;
  const canCreate = siteNameError({ name }) === null && computeCanCreate({ slug, database, supabaseReady, customReady });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (siteNameError({ name })) { setFormError(SITE_NAME_ERROR); return; }
    if (!canCreate || isSubmitting) return;

    const input = buildCreateProjectInput({
      displayName: name,
      database,
      customProviderLabel: customProvider,
      supabaseUrl,
      customConnection,
      supabaseKey: refValue(supabaseKeyRef),
      customCredential: refValue(customCredentialRef),
    });
    // Cleared immediately, before the async call, so the DOM never holds the
    // secret longer than it takes to read it — even if the submit fails.
    if (supabaseKeyRef.current) supabaseKeyRef.current.value = '';
    if (customCredentialRef.current) customCredentialRef.current.value = '';

    setFormError(null);
    setIsSubmitting(true);
    try {
      await onCreate(input);
    } catch (error) {
      setFormError(humanSiteError({ error, fallback: 'Could not create website.' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    name,
    setName,
    database,
    setDatabase,
    supabaseUrl,
    setSupabaseUrl,
    setHasSupabaseKey,
    customProvider,
    setCustomProvider,
    customConnection,
    setCustomConnection,
    setHasCustomCredential,
    supabaseKeyRef,
    customCredentialRef,
    slug,
    canCreate,
    isSubmitting,
    formError,
    nameError,
    handleSubmit,
  };
}
