import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@/lib/api';
import { navigate } from '@/lib/router';
import { ConsentOverviewTab, type ConsentOverviewTabProps } from '../ConsentOverviewTab';
import { CookieConsent } from '../CookieConsent';
import type { ConsentRevisionsPort } from '../settings.hooks';
import { CONSENT_CONFIG, conflict, consentSnapshot, fakeConsentPort, revision, saved } from './consent-fixtures';

vi.mock('@/lib/router', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/router')>()), navigate: vi.fn() }));

/** @file The Cookie Consent page: tab routing, Publish gating, notices, and the inert preview. */

const t = (key: string) => key;
const useTranslate = () => ({ t, dictionary: {} });
const delays = { autosaveMs: 0, previewMs: 0 };
const withDraft = consentSnapshot({ draft: revision('d1'), published: revision('p1') });

function renderPage(port: ConsentRevisionsPort, tabId: string | null = 'banner') {
  return render(<CookieConsent tabId={tabId} port={port} useTranslate={useTranslate} delays={delays} />);
}

const publishButton = () => screen.getByRole('button', { name: /^Publish/ });

describe('CookieConsent: tabs', () => {
  it.each([
    ['banner', 'Banner', 'Banner text', true],
    ['look', 'Look & Position', 'Look & position', true],
    ['rules', 'Rules', 'Rules', false],
  ])('?tab=%s shows its fields, with the preview only beside Banner and Look', async (tabId, tab, legend, preview) => {
    renderPage(fakeConsentPort(), tabId);
    expect(await screen.findByRole('group', { name: legend })).toBeInTheDocument();
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(tab);
    expect(screen.queryByRole('region', { name: 'Banner preview' }) !== null).toBe(preview);
  });

  it('opens Overview for an absent or unknown tab', async () => {
    renderPage(fakeConsentPort(), 'records');
    expect(await screen.findByRole('heading', { name: 'Before you turn it on' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Overview');
  });

  it('switches tabs through the URL', async () => {
    renderPage(fakeConsentPort(), null);
    fireEvent.click(await screen.findByRole('tab', { name: 'Rules' }));
    expect(navigate).toHaveBeenCalledWith('/consent?tab=rules', { replace: true });
  });
});

describe('CookieConsent: load', () => {
  it('shows Loading until the settings arrive, with no Publish yet', () => {
    renderPage(fakeConsentPort({ get: () => new Promise(() => {}) }));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Publish/ })).toBeNull();
  });

  it('shows a load failure', async () => {
    renderPage(fakeConsentPort({ get: () => Promise.reject(new ApiError('', 503)) }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load cookie consent.");
  });
});

describe('CookieConsent: publish', () => {
  it('enables Publish for a saved draft and publishes it', async () => {
    const publish = vi.fn(() => Promise.resolve({ published: true as const, revisionId: 'd1' }));
    renderPage(fakeConsentPort({ get: () => Promise.resolve(withDraft), publish }));
    await waitFor(() => expect(publishButton()).toBeEnabled());
    expect(screen.getByRole('status')).toHaveTextContent('Draft saved. Not live yet.');
    fireEvent.click(publishButton());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Live.'));
    expect(publish).toHaveBeenCalledWith({ draftId: 'd1', expectedPublishedId: 'p1' });
    expect(publishButton()).toBeDisabled();
  });

  it('labels the button while publishing', async () => {
    renderPage(fakeConsentPort({ get: () => Promise.resolve(withDraft), publish: () => new Promise(() => {}) }));
    await waitFor(() => expect(publishButton()).toBeEnabled());
    fireEvent.click(publishButton());
    expect(await screen.findByRole('button', { name: /^Publishing…/ })).toBeDisabled();
  });

  it('keeps Publish disabled while the saved draft has problems, and shows them at the field', async () => {
    const problems = [{ field: 'title', code: 'TEXT_REQUIRED', message: 'Add a title.' }];
    renderPage(fakeConsentPort({ get: () => Promise.resolve(withDraft), saveDraft: () => Promise.resolve(saved('d2', problems)) }));
    fireEvent.change(await screen.findByLabelText('Banner title'), { target: { value: '' } });
    expect(await screen.findByText('Add a title.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Draft saved. Not live yet.'));
    expect(publishButton()).toBeDisabled();
  });

  it('shows a publish error', async () => {
    renderPage(fakeConsentPort({ get: () => Promise.resolve(withDraft), publish: () => Promise.reject(new ApiError('Storage is read-only.', 503)) }));
    await waitFor(() => expect(publishButton()).toBeEnabled());
    fireEvent.click(publishButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is read-only.');
  });
});

describe('CookieConsent: notices', () => {
  it('on a 409 locks the fields and offers Reload, which fetches again', async () => {
    const get = vi.fn(() => Promise.resolve(withDraft));
    renderPage(fakeConsentPort({ get, saveDraft: () => Promise.reject(conflict()) }));
    fireEvent.change(await screen.findByLabelText('Banner title'), { target: { value: 'Mine' } });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Someone else changed this. Reload to see it.');
    expect(screen.getByRole('group', { name: 'Banner text' })).toBeDisabled();
    fireEvent.click(within(alert).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('shows a save error and keeps the edit', async () => {
    renderPage(fakeConsentPort({ saveDraft: () => Promise.reject(new ApiError('Disk full.', 500)) }));
    fireEvent.change(await screen.findByLabelText('Banner title'), { target: { value: 'Mine' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full.');
    expect(screen.getByLabelText('Banner title')).toHaveValue('Mine');
  });

  it('shows a preview failure beside the frame', async () => {
    renderPage(fakeConsentPort({ preview: () => Promise.reject(new ApiError('', 500)) }), 'look');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't render the preview.");
  });
});

describe('CookieConsent: preview', () => {
  it('puts the rendered page only in the srcdoc of an empty-sandbox iframe, never in the admin DOM', async () => {
    const html = '<p id="leak">page</p><script>parent.owned = 1</script>';
    const { container } = renderPage(fakeConsentPort({ preview: () => Promise.resolve({ html, blockingProblems: [], revisionId: null }) }));
    const frame = await screen.findByTitle('Banner preview');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toBe(html);
    expect(container.querySelector('#leak')).toBeNull();
    expect(container.querySelectorAll('script')).toHaveLength(0);
  });

  it('shows the loading line until the first preview arrives', async () => {
    renderPage(fakeConsentPort({ preview: () => new Promise(() => {}) }), 'look');
    expect(await screen.findByText('Loading preview…')).toBeInTheDocument();
    expect(screen.queryByTitle('Banner preview')).toBeNull();
  });
});

describe('CookieConsent: overview', () => {
  it('re-checks readiness after each publication', async () => {
    const readiness = vi.fn(() => Promise.resolve({ ready: true, enabled: true, blockingProblems: [], detected: [], truncated: false, limitations: [] }));
    renderPage(fakeConsentPort({ get: () => Promise.resolve(withDraft), readiness, publish: () => Promise.resolve({ published: true as const, revisionId: 'd1' }) }), 'overview');
    await waitFor(() => expect(publishButton()).toBeEnabled());
    const before = readiness.mock.calls.length;
    await act(async () => { fireEvent.click(publishButton()); });
    await waitFor(() => expect(readiness.mock.calls.length).toBeGreaterThan(before));
    expect(screen.getByText('On')).toBeInTheDocument();
  });
});

describe('ConsentOverviewTab', () => {
  const base: ConsentOverviewTabProps = { liveEnabled: false, hasUnpublished: false, readiness: null, readinessError: null, t };
  const readiness = (overrides: Partial<NonNullable<ConsentOverviewTabProps['readiness']>> = {}) => ({ ready: true, enabled: false, blockingProblems: [], detected: [], truncated: false, limitations: [], ...overrides });

  it('says when the banner is off and nothing has been checked yet', () => {
    render(<ConsentOverviewTab {...base} />);
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('Visitors see no banner. Optional scripts run as usual.')).toBeInTheDocument();
    expect(screen.getByText('Checking…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Waits for consent' })).toBeNull();
  });

  it('says when the banner is on, flags unpublished changes, and reports a failed check', () => {
    render(<ConsentOverviewTab {...base} liveEnabled hasUnpublished readinessError="Couldn't check readiness." />);
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText('Visitors choose before optional cookies run.')).toBeInTheDocument();
    expect(screen.getByText('You have changes that are not live yet.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't check readiness.");
    expect(screen.queryByText('Checking…')).toBeNull();
  });

  it('lists blockers, linking the ones a tab can fix', () => {
    render(<ConsentOverviewTab {...base} readiness={readiness({ blockingProblems: [
      { field: 'privacyPolicyUrl', code: 'PRIVACY_LINK_REQUIRED', message: 'Link a privacy page.' },
      { code: 'STORAGE', message: 'Storage is read-only.' },
      { message: 'Unknown.' },
    ] })} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual(['Link a privacy page.Fix', 'Storage is read-only.', 'Unknown.']);
    expect(within(items[0]!).getByRole('link', { name: 'Fix' }).getAttribute('href')).toMatch(/\/consent\?tab=banner$/);
  });

  it('says nothing blocks and nothing waits, on a clean page', () => {
    render(<ConsentOverviewTab {...base} readiness={readiness()} />);
    expect(screen.getByText('Nothing blocks the banner.')).toBeInTheDocument();
    expect(screen.getByText('Nothing on the home page waits for consent.')).toBeInTheDocument();
    expect(screen.queryByText('Only the first 200 items were checked.')).toBeNull();
  });

  it('counts what waits per category, names unknown categories as-is, and notes truncation', () => {
    const detected = [
      { tag: 'script', category: 'marketing', source: 'a' }, { tag: 'iframe', category: 'marketing', source: 'b' },
      { tag: 'script', category: 'analytics', source: null }, { tag: 'script', category: 'custom', source: null },
    ];
    render(<ConsentOverviewTab {...base} readiness={readiness({ detected, truncated: true })} />);
    expect(screen.getByText("On the home page, these wait for a visitor's choice:")).toBeInTheDocument();
    const rows = within(screen.getByRole('region', { name: 'Waits for consent' })).getAllByRole('listitem').map(item => item.textContent);
    expect(rows).toEqual(['Analytics1', 'Marketing2', 'custom1']);
    expect(screen.getByText('Only the first 200 items were checked.')).toBeInTheDocument();
  });
});

describe('CookieConsent: draft first', () => {
  it('edits the draft config, not the live one', async () => {
    renderPage(fakeConsentPort({ get: () => Promise.resolve(consentSnapshot({ draft: revision('d1', { ...CONSENT_CONFIG, title: 'Draft title' }) })) }));
    expect(await screen.findByLabelText('Banner title')).toHaveValue('Draft title');
  });
});
