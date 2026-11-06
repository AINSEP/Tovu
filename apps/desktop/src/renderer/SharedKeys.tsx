/** Desktop adapter for the existing owner-store bridge; no vault, paths or attachment policy here. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { OwnerStoreBridge, OwnerStoreEntry } from '../contracts/owner-store.js';
import { ownerStoreBridge } from './runner-api.js';
import { useSharedKeys } from './SharedKeys.hooks.js';
import { ToolIcon } from './tool-icons.js';

type StoreState = ReturnType<typeof useSharedKeys>;

/** Sites-home entry point. Closing unmounts all password inputs; native dialog restores focus.
 * @example <SharedKeysLauncher />
 */
export function SharedKeysLauncher(_input = {}, _options = {}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="button button--quiet button--icon jini-tooltip" data-tooltip-placement="bottom"
      data-tooltip="Keys shared by all your sites" aria-label="Shared keys" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <ToolIcon kind="keys" />
    </button>
    {open && <SharedKeys onClose={() => setOpen(false)} />}
  </>;
}

/** A native dialog supplies focus containment, Escape, inert background and keyboard access.
 * @param input Close handler and optional fake preload for renderer acceptance tests.
 * @complexity O(e) metadata rows; no secret values are loaded from storage.
 * @example <SharedKeys onClose={close} bridge={bridge} />
 */
export function SharedKeys({ onClose, bridge = ownerStoreBridge({}) }: {
  onClose: () => void; bridge?: OwnerStoreBridge;
}, _options = {}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const state = useSharedKeys({ bridge });
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return <dialog ref={dialog} className="shared-keys" aria-labelledby="shared-keys-title" onCancel={onClose}>
    <header className="shared-keys__head">
      <h2 id="shared-keys-title">Shared keys</h2>
      <button type="button" className="button button--quiet" onClick={onClose}>Close</button>
    </header>
    <p>Save keys to your project. Saving a new key does not attach it to any site.</p>
    {/* Hook-up point: project-key attachments must provide authoritative usedBy site names.
        Legacy owner_grants describe copies, so they must never masquerade as project usage. */}
    <p className="shared-keys__note">Shared OAuth connections show their granted sites. Site selection is managed from each site's connection settings.</p>
    {!state.available && <p role="alert">Shared keys are unavailable. Update or restart the desktop app.</p>}
    {state.error && <p role="alert">{state.error}</p>}
    <p role="status" aria-live="polite">{state.busy ? 'Working…' : state.message}</p>
    {bridge && <>
      <button type="button" className="button button--quiet" disabled={state.busy} onClick={() => void state.run()}>Refresh</button>
      <section aria-label="Saved keys" aria-busy={state.busy}>
        {state.loaded && state.entries.length === 0 && <p>No saved keys yet.</p>}
        {state.entries.map(entry => <SavedKey key={`${entry.id}:${entry.revision}`} entry={entry} bridge={bridge} state={state} />)}
      </section>
      <KeyForm bridge={bridge} state={state} />
      <ImportForm bridge={bridge} state={state} />
    </>}
  </dialog>;
}

/** Metadata stays visible; Replace asks for a fresh secret and never reveals the stored value. */
function SavedKey({ entry, bridge, state }: { entry: OwnerStoreEntry; bridge: OwnerStoreBridge; state: StoreState }) {
  const [replacing, setReplacing] = useState(false);
  if (entry.sharedOAuth) return <SavedOAuthConnection entry={entry} bridge={bridge} state={state} />;
  return <article className="shared-keys__row">
    <h3>{entry.label}</h3>
    <p>{entry.provider} · revision {entry.revision}</p>
    <p>Saved — site usage unavailable</p>
    <>
      <button type="button" className="button button--quiet" disabled={state.busy} onClick={() => setReplacing(!replacing)}>
        {replacing ? 'Cancel replacement' : 'Replace key'}
      </button>
      {replacing && (entry.kind === 'api-connection' ? <ProviderKeyForm bridge={bridge} state={state} entry={entry} /> : <KeyForm bridge={bridge} state={state} entry={entry} />)}
    </>
    <button type="button" className="button button--quiet" disabled={state.busy} onClick={() => void state.run({ action: () => bridge.delete({ id: entry.id, expectedRevision: entry.revision }, {}) })}>Delete unused key</button>
  </article>;
}

/** Shared connections use their fenced lifecycle, never a pasted token or an unused-key delete. */
function SavedOAuthConnection({ entry, bridge, state }: { entry: OwnerStoreEntry; bridge: OwnerStoreBridge; state: StoreState }) {
  const statuses: Record<string, string> = { connected: 'Connected', 'reconnect-required': 'Sign in again',
    'revocation-pending': 'Stopped here; provider revocation pending', disconnected: 'Disconnected' };
  return <article className="shared-keys__row">
    <h3>{entry.label}</h3>
    <p>Shared connection · {statuses[entry.status ?? ''] ?? 'Status unavailable'} · {entry.usedBy?.join(', ') || 'No sites'}</p>
    <button type="button" className="button button--quiet" disabled={state.busy || !bridge.disconnect}
      onClick={() => void state.run({ action: () => bridge.disconnect({ id: entry.id, expectedRevision: entry.revision }, {}) })}>
      {entry.status === 'revocation-pending' ? 'Retry disconnect everywhere' : 'Disconnect this shared connection from every site on this Mac'}
    </button>
  </article>;
}

/** Single-token vendor cards use the existing vendor payload, optimistic revision and safe metadata.
 * Password fields are uncontrolled, cleared before awaiting IPC, and never placed in feedback.
 * @complexity O(input bytes); one put, followed by the state hook's metadata refresh.
 */
function KeyForm({ bridge, state, entry }: { bridge: OwnerStoreBridge; state: StoreState; entry?: OwnerStoreEntry }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const provider = String(fields.get('provider')).trim();
    const replacement = entry ? { id: entry.id, kind: entry.kind, label: entry.label, provider: entry.provider,
      expectedRevision: entry.revision, meta: {}, payload: { token: String(fields.get('token')) } } : {
      kind: 'vendor' as const, label: String(fields.get('label')).trim(), provider,
      expectedRevision: null, meta: { credentialType: 'vendor', worksFor: [provider] },
      payload: { vendorId: provider, token: String(fields.get('token')) },
    };
    const input = { store: 'project' as const, entry: replacement };
    form.reset();
    void state.run({ action: () => bridge.put(input, {}) });
  };
  return <form className="shared-keys__form" onSubmit={submit}>
    <h3>{entry ? 'Replace saved key' : 'Save a key'}</h3>
    <p>For credentials with one API key or token.</p>
    {entry && <p>Replacing preserves the saved settings and other credential fields. Sites using this shared key use the replacement.</p>}
    <fieldset disabled={state.busy || !state.loaded}>
      <label className="create-field"><span>Key name</span>
        <input name="label" required maxLength={200} defaultValue={entry?.label} readOnly={!!entry} />
      </label>
      <label className="create-field"><span>Provider ID</span>
        <input name="provider" required={!entry} maxLength={100} placeholder="Provider's plugin ID" defaultValue={entry?.provider ?? ''} readOnly={!!entry} autoCapitalize="none" spellCheck={false} />
      </label>
      <label className="create-field"><span>{entry ? 'New API key or token' : 'API key or token'}</span>
        <input name="token" type="password" required maxLength={32000} autoComplete="off" spellCheck={false} />
      </label>
      <button type="submit" className="button button--primary">{entry ? 'Replace key' : 'Save to project'}</button>
    </fieldset>
  </form>;
}

/** Provider settings stay intact; only the secret fields entered here are replaced. */
function ProviderKeyForm({ bridge, state, entry }: { bridge: OwnerStoreBridge; state: StoreState; entry: OwnerStoreEntry }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem('secrets') as HTMLInputElement;
    let secrets: Record<string, string>;
    try {
      secrets = JSON.parse(input.value);
      if (!secrets || Array.isArray(secrets) || typeof secrets !== 'object' || !Object.values(secrets).every(value => typeof value === 'string')) throw new Error();
    } catch { input.setCustomValidity('Enter a JSON object with secret field names and their new text values.'); input.reportValidity(); return; }
    input.setCustomValidity('');
    form.reset();
    void state.run({ action: () => bridge.put({ store: 'project', entry: { id: entry.id, kind: entry.kind, label: entry.label, provider: entry.provider,
      expectedRevision: entry.revision, meta: {}, payload: { secrets } } }, {}) });
  };
  return <form className="shared-keys__form" onSubmit={submit}>
    <h3>Replace provider secrets</h3>
    <p>Enter a JSON object using the secret field names from the provider settings. Saved endpoints and other settings are preserved.</p>
    <fieldset disabled={state.busy}>
      <label>New secret fields<input type="password" name="secrets" required autoComplete="off" spellCheck={false} maxLength={32000} onInput={event => event.currentTarget.setCustomValidity('')} /></label>
      <button type="submit" className="button button--primary">Replace key</button>
    </fieldset>
  </form>;
}

/** Main owns the native backup picker and the confirmation that lists the dry run; the passphrase
 * goes only to the fixed preload action. Nothing is written before that confirmation.
 */
function ImportForm({ bridge, state }: { bridge: OwnerStoreBridge; state: StoreState }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const passphrase = String(new FormData(form).get('passphrase'));
    form.reset();
    void state.run({ action: () => bridge.import({ source: 'backup', passphrase }, {}) });
  };
  return <form className="shared-keys__form" onSubmit={submit}>
    <h3>Import older shared keys</h3>
    <p>You see what imports before anything changes. Sites keep their own copies.</p>
    <fieldset disabled={state.busy || !state.loaded}>
      <button type="button" className="button button--quiet"
        onClick={() => void state.run({ action: () => bridge.import({ source: 'owner-store' }, {}) })}>Import from this computer</button>
      <label className="create-field"><span>Backup passphrase</span>
        <input name="passphrase" type="password" required maxLength={8000} autoComplete="off" spellCheck={false} />
      </label>
      <button type="submit" className="button button--quiet">Choose backup to import…</button>
    </fieldset>
  </form>;
}
