/**
 * @file The few browser helpers the three panels share: connect to the host through the copied
 * admin-surface client, build elements, and show status text.
 *
 * Exists so every panel builds its DOM the same safe way: text always goes through `textContent`
 * (never `innerHTML`), because titles, labels and messages come from Google or the host and must
 * never be parsed as markup inside the panel.
 */
import { createAdminSurfaceClient } from './surface-client.mjs';

/**
 * The client for this frame: listens to the parent's messages only (the client checks the source).
 * @param {{ window: Window }} required - the frame's window (a test passes its own jsdom window).
 */
export function connectToHost(required) {
  const { window: frame } = required;
  return createAdminSurfaceClient({
    parent: frame.parent,
    listen: (handler) => { frame.addEventListener('message', handler); return () => frame.removeEventListener('message', handler); },
  });
}

/**
 * An element with attributes, event handlers (`on<Event>` functions) and children (strings become text).
 * @param {string} tag
 * @param {Record<string, string | boolean | Function | undefined>} [props]
 * @param {Array<Node | string | null | undefined>} [children]
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, children = []) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (typeof value === 'function') element.addEventListener(name.slice(2).toLowerCase(), value);
    else if (value === true) element.setAttribute(name, '');
    else if (typeof value === 'string') element.setAttribute(name, value);
  }
  element.append(...children.filter((child) => child !== null && child !== undefined));
  return element;
}

/** Replaces a region's content. */
export function show(root, ...nodes) {
  root.replaceChildren(...nodes.filter(Boolean));
}

/** The sentence to show for a failed call: the host's or plugin's fixed message. */
export function failureText(error) {
  return typeof error?.message === 'string' && error.message ? error.message : 'Something went wrong. Try again.';
}

/** Runs `work` with every button in `root` disabled, so one click sends one request. */
export async function busy(root, work) {
  const buttons = [...root.querySelectorAll('button')];
  for (const control of buttons) control.disabled = true;
  try { return await work(); } finally { for (const control of buttons) control.disabled = false; }
}

/** Resolves after `ms` (the desktop Picker and sign-in polls). */
export const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
