import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuEditor } from '../MenuEditor';
import { useMenuEditor } from '../hooks/use-menu-editor.hooks';
import { createFakeMenusPort } from '../hooks/menus-dependencies.hooks';
import type { AdminMenu } from '@/lib/api';

const existing: AdminMenu = {
  id: 'm1', workspaceId: 'ws1', title: 'Main menu', slug: 'main', status: 'published',
  items: [], locations: [], updatedAt: '2026-10-09T00:00:00.000Z', version: 1,
};

describe('menu authoring UX', () => {
  it('derives a readable slug while typing and saves a title-only empty menu', async () => {
    const port = createFakeMenusPort();
    const navigate = vi.fn();
    render(<MenuEditor menuId={null} useMenuEditorHook={(id) => useMenuEditor(id, { port, navigate, t: (key) => key })} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Menu title' }), { target: { value: 'Main Navigation' } });
    expect(screen.getByRole('textbox', { name: 'Menu slug' })).toHaveValue('main-navigation');
    fireEvent.change(screen.getByRole('textbox', { name: 'Menu title' }), { target: { value: '' } });
    expect(screen.getByRole('textbox', { name: 'Menu slug' })).toHaveValue('');
    // Same transliteration and punctuation boundaries as pages/forms' shared toSlug owner.
    fireEvent.change(screen.getByRole('textbox', { name: 'Menu title' }), { target: { value: 'Café Münster & Links' } });
    expect(screen.getByRole('textbox', { name: 'Menu slug' })).toHaveValue('cafe-muenster-links');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(port.menus).toHaveLength(1);
    expect(port.menus[0]).toMatchObject({ title: 'Café Münster & Links', slug: 'cafe-muenster-links', items: [] });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/menus/cafe-muenster-links');
  });

  it.each(['custom-menu', ''])('preserves an explicitly edited slug, including clearing it (%s)', (editedSlug) => {
    const port = createFakeMenusPort();
    const { result } = renderHook(() => useMenuEditor(null, { port, navigate: vi.fn(), t: (key) => key }));
    act(() => result.current.setTitle('First title'));
    expect(result.current.slug).toBe('first-title');
    act(() => result.current.setSlug(editedSlug));
    act(() => result.current.setTitle('Another title'));
    expect(result.current.slug).toBe(editedSlug);
  });

  it('keeps persisted slugs stable and resets derivation when navigating to a new menu', async () => {
    const port = createFakeMenusPort({ menus: [existing] });
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useMenuEditor(id, { port, navigate: vi.fn(), t: (key) => key }), { initialProps: { id: 'main' as string | null } });
    await act(async () => { await Promise.resolve(); });
    act(() => result.current.setTitle('Renamed menu'));
    expect(result.current.slug).toBe('main');
    act(() => result.current.setSlug('custom-menu'));
    rerender({ id: null });
    act(() => result.current.setTitle('Fresh menu'));
    expect(result.current.slug).toBe('fresh-menu');
  });

  it.each(['items', 'html'] as const)('shows exact save errors once in a full-width notice in %s mode', async (mode) => {
    const port = createFakeMenusPort();
    port.createMenu = async () => { throw new Error('slug must use lowercase letters, numbers, and dashes'); };
    const navigate = vi.fn();
    render(<MenuEditor menuId={null} useMenuEditorHook={(id) => useMenuEditor(id, { port, navigate, t: (key) => key })} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Menu title' }), { target: { value: 'Main menu' } });
    if (mode === 'html') fireEvent.click(screen.getByRole('tab', { name: 'HTML' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('slug must use lowercase letters, numbers, and dashes');
    expect(alert).toHaveClass('notice', 'error');
    expect(alert.closest('.page-header')).toBeNull();
    expect(alert.parentElement).toHaveClass('page');
    expect(screen.getAllByText('slug must use lowercase letters, numbers, and dashes')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
