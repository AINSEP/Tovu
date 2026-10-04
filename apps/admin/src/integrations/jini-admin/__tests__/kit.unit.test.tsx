import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, Dialog, KitProvider, Menu } from '@jini-ai/ui-kit/react';
import { tovuKit } from '../kit';

describe('Tovu kit classes', () => {
  // The bridge no longer maps variants onto Tovu `btn-*` classes: Jini emits prefixed
  // `jini-btn-*` classes and jini-media.css styles them (owner decision 2026-10-03).
  it.each([
    [undefined, 'primary'], ['primary', 'primary'], ['secondary', 'secondary'],
    ['danger', 'danger'], ['warning', 'warning'], ['ghost', 'ghost'],
  ] as const)('emits the native jini class for variant %s and keeps the caller class', (variant, expected) => {
    render(createElement(KitProvider, { kit: tovuKit, children:
      createElement(Button, { variant, className: 'caller-class', children: 'Action' }) }));
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('jini-btn', `jini-btn-${expected}`, 'caller-class');
    expect(button).toHaveAttribute('data-jini-variant', expected);
    expect(button.className).not.toMatch(/(^|\s)btn-/);
  });

  it('gives a danger menu action, such as media Trash, the jini danger class', () => {
    render(createElement(KitProvider, { kit: tovuKit, children:
      createElement(Menu, { label: 'Asset actions', items: [
        { id: 'edit', label: 'Edit metadata', onPress() {} },
        { id: 'trash', label: 'Trash', attrs: { 'data-jini-variant': 'danger' }, onPress() {} },
      ] }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Asset actions' }));
    expect(screen.getByRole('menuitem', { name: 'Trash' })).toHaveClass('jini-row-menu-item', 'jini-btn-danger');
    expect(screen.getByRole('menuitem', { name: 'Edit metadata' })).not.toHaveClass('jini-btn-danger');
  });

  it('loads the host presentation for jini classes from the admin entry point', () => {
    const entry = readFileSync(path.resolve('src/main.tsx'), 'utf8');
    expect(entry).toMatch(/^import "\.\/integrations\/jini-admin\/jini-media\.css";$/m);
  });

  it('keeps closed dialogs hidden through the host CSS and open dialogs visible', () => {
    const style = document.createElement('style');
    // Real host styles reproduce the cascade that made the closed lightbox visible.
    const hostCss = readFileSync(path.resolve('src/styles.css'), 'utf8');
    // jsdom cannot parse some unrelated modern rules in the full stylesheet.
    // Use the actual container rule responsible for the browser regression.
    style.textContent = hostCss.match(/\.settings-dialog \{[^}]*\}/)![0] +
      readFileSync(path.resolve('src/integrations/jini-admin/jini-media.css'), 'utf8');
    document.head.append(style);
    try {
      const view = (open: boolean) => createElement(KitProvider, { kit: tovuKit, children:
        createElement(Dialog, { open, title: 'Media preview', onClose() {}, className: 'caller-class' }) });
      const { rerender } = render(view(false));
      const dialog = document.querySelector('dialog')!;
      expect(dialog).toHaveClass('jini-dialog', 'caller-class');
      expect(dialog).not.toHaveClass('settings-dialog');
      expect(getComputedStyle(dialog).display).toBe('none');
      rerender(view(true));
      expect(dialog).toHaveAttribute('open');
      expect(getComputedStyle(dialog).display).not.toBe('none');
      rerender(view(false));
      expect(getComputedStyle(dialog).display).toBe('none');
      const native = document.createElement('div'); native.className = 'settings-dialog';
      document.body.append(native);
      expect(getComputedStyle(native).display).toBe('flex');
      native.remove();
    } finally { style.remove(); }
  });
});
