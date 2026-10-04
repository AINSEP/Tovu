import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { useState } from 'react';
import { KitProvider } from '@jini-ai/ui-kit/react';
import { AdminModulesProvider } from '../AdminModulesProvider';
import { ModulePanel } from '../ModulePanel';
import { tovuKit } from '../kit';
import { MediaPickerDialog } from '../../../components/MediaPickerDialog/MediaPickerDialog';
import type { AdminMedia } from '../../../lib/api';
import { setPublishToLiveAvailable } from '../../../features/publish-content/hooks/publish-availability.store';
const item = { id: 'm1', slug: 'my-photo', workspaceId: 'workspace-local', title: 'Photo', alt: 'Original alt', caption: '', credit: '', sha256: 'hash', status: 'active', createdAt: '2026-10-03', updatedAt: '2026-10-03', version: 1, width: null, height: null, cssClass: null, htmlAttributes: null, contentType: 'image/png', publicUrl: '/m/my-photo/public' } satisfies AdminMedia;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
function Fixture({ permissions = ['*'], children }: { permissions?: string[]; children?: React.ReactNode }) {
  return <KitProvider kit={tovuKit}><AdminModulesProvider permissions={permissions}>{children ?? <ModulePanel moduleId="media" pageId="library" route={{ view: null, params: {}, query: new URLSearchParams() }} />}</AdminModulesProvider></KitProvider>;
}
describe('Jini media host integration', () => {
  it('honors a direct tab link and keeps tab changes on /media/new with the other query values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ media: [item] })))));
    window.history.replaceState(null, '', '/admin/media/new?tab=images&compare=legacy');
    const historyLength = window.history.length;
    render(<Fixture><ModulePanel moduleId="media" pageId="library" route={{ view: 'jini-media', params: {}, query: new URLSearchParams(window.location.search) }} /></Fixture>);
    const images = await screen.findByRole('tab', { name: 'Images' }, { timeout: 10000 });
    expect(images).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Videos' }));
    expect(window.location.pathname).toBe('/admin/media/new');
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('videos');
    expect(new URLSearchParams(window.location.search).get('compare')).toBe('legacy');
    expect(window.history.length).toBe(historyLength);
  }, 20000);
  it('places the host publish control in the page header and hides it when media access is denied', async () => {
    setPublishToLiveAvailable(true);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ media: [item] })))));
    const { rerender } = render(<Fixture />);
    const publish = await screen.findByRole('button', { name: 'Publish media' }, { timeout: 10000 });
    expect(publish.closest('[data-jini-part="media.header.actions"]')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: 'Publish media' })).toHaveLength(1);
    rerender(<Fixture permissions={[]} />);
    await screen.findByText('Permission denied');
    expect(screen.queryByRole('button', { name: 'Publish media' })).toBeNull();
  }, 20000);
  it('renders the HTTP library with the host kit, writes partial metadata and refreshes', async () => {
    let current = { ...item };
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'PATCH') { current = { ...current, ...JSON.parse(String(init.body)) }; return new Response(JSON.stringify({ media: current })); }
      return new Response(JSON.stringify({ media: [current] }));
    });
    vi.stubGlobal('fetch', fetch);
    render(<Fixture />);
    await screen.findByRole('heading', { name: 'Photo' }, { timeout: 10000 });
    const edit = screen.getByRole('button', { name: 'Edit "Photo"' }); expect(edit).toHaveClass('jini-media-card-edit');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for "Photo"' }));
    // Legacy: Trash is a neutral menu item; only "Delete permanently" is destructive.
    expect(screen.getByRole('menuitem', { name: 'Trash' })).toHaveClass('jini-row-menu-item');
    expect(screen.getByRole('menuitem', { name: 'Trash' })).not.toHaveClass('jini-btn-danger');
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Trash' }), { key: 'Escape' });
    fireEvent.click(edit);
    const title = await screen.findByRole('textbox', { name: 'Title' });
    fireEvent.change(title, { target: { value: 'Renamed' } }); fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Renamed' });
    expect(fetch.mock.calls.find(([, init]) => init.method === 'PATCH')?.[1]).toMatchObject({ credentials: 'same-origin', body: JSON.stringify({ title: 'Renamed' }) });
    // The optional replacement affordance is owned by Jini. Host capability and
    // request wiring are asserted independently in media-ports.unit.test.ts.
  }, 20000);
  it('uploads replacement bytes to the existing identity through the rebuilt Jini editor', async () => {
    let current = { ...item };
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        current = { ...current, sha256: 'replacement-hash', version: 2 };
        return new Response(JSON.stringify({ media: current }));
      }
      return new Response(JSON.stringify({ media: [current] }));
    });
    vi.stubGlobal('fetch', fetch);
    render(<Fixture permissions={['media.read', 'media.update']} />);
    expect(await screen.findByRole('img', { name: 'Original alt' }, { timeout: 10000 })).toHaveAttribute('src', '/api/admin/v1/workspaces/workspace-local/media/m1/original?v=1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit "Photo"' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editing "Photo"' });
    const input = within(dialog).getByLabelText('File to upload');
    fireEvent.change(input, { target: { files: [new File(['replacement'], 'new.png', { type: 'image/png' })] } });
    const replace = within(dialog).getByRole('button', { name: 'Replace file' });
    await waitFor(() => expect(replace).toBeEnabled());
    fireEvent.click(replace);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const writes = fetch.mock.calls.filter(([, init]) => init.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(['/api/admin/v1/workspaces/workspace-local/media/m1/replace', expect.objectContaining({
      credentials: 'same-origin', body: JSON.stringify({ filename: 'new.png', contentType: 'image/png', dataBase64: btoa('replacement') }),
    })]);
    expect(current).toMatchObject({ id: item.id, slug: item.slug, alt: item.alt, sha256: 'replacement-hash' });
    // Same id, new bytes: the refreshed row's version busts the cached preview.
    await waitFor(() => expect(screen.getByRole('img', { name: 'Original alt' })).toHaveAttribute('src', '/api/admin/v1/workspaces/workspace-local/media/m1/original?v=2'));
  }, 20000);
  it('hides restore without the host grants and restores trashed media when both Trash gates are present', async () => {
    let current = { ...item, status: 'trashed' as 'active' | 'trashed' };
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        current = { ...current, status: 'active' };
        return new Response(JSON.stringify({ restored: 1, results: [{ entityType: 'media', entityId: item.id, outcome: 'restored' }] }));
      }
      return new Response(JSON.stringify({ media: [current] }));
    });
    vi.stubGlobal('fetch', fetch);
    const { rerender } = render(<Fixture permissions={['media.read']} />);
    await screen.findByRole('heading', { name: 'Photo' }, { timeout: 10000 });
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    rerender(<Fixture permissions={['media.read', 'content.read', 'media.delete']} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for "Photo"' }, { timeout: 10000 }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull());
    expect(fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toEqual([
      ['/api/admin/v1/workspaces/workspace-local/trash/restore', expect.objectContaining({ body: JSON.stringify({ items: [{ entityType: 'media', entityId: item.id }] }) })],
    ]);
    expect(await screen.findByRole('heading', { name: 'Photo' })).toBeInTheDocument();
  }, 20000);
  it('denies missing grants and retires the old scope when grants change', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ media: [item] })))));
    const { rerender } = render(<Fixture />);
    await screen.findByRole('heading', { name: 'Photo' }, { timeout: 10000 });
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    rerender(<Fixture permissions={[]} />);
    await screen.findByRole('alert', { name: '' });
    expect(screen.getByText('Permission denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull();
  }, 20000);
  it('uses the promise picker for existing CMS callbacks, preserving readable slugs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ media: [item] })))));
    const selected = vi.fn();
    function Consumer() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Insert media</button>{open && <MediaPickerDialog onSelect={row => { selected(row); setOpen(false); }} onCancel={() => setOpen(false)} />}</>;
    }
    render(<Fixture><Consumer /></Fixture>);
    fireEvent.click(screen.getByRole('button', { name: 'Insert media' }));
    const choose = await screen.findByRole('button', { name: 'Choose' }, { timeout: 10000 });
    fireEvent.click(choose);
    await waitFor(() => expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', slug: 'my-photo' })), { timeout: 10000 });
    expect(screen.queryByRole('dialog')).toBeNull();
  }, 20000);
});
