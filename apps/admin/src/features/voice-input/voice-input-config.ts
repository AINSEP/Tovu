/**
 * @file One switch for whether the composer offers the push-to-talk mic button at all.
 *
 * Owner report, 2026-09-13 (Workspace chat screenshot): the mic button should not show. This is
 * NOT the "Disabled for now" tooltip `PushToTalkMicButton.tsx`'s own header already describes —
 * that copy sits on a button which still renders and is still functionally enabled wherever the
 * desktop shell makes it available. This flag goes one step further, at the one call site that
 * mounts the button (`AssistantDock.tsx`'s `composerSlots.footerLeadingAccessory`): when `false`,
 * the button is not mounted at all, so no disabled/enabled state is ever computed or shown.
 *
 * Deliberately a flag, not a deletion — `PushToTalkMicButton`, its hooks, the desktop-side
 * `tovuVoice` bridge, and every test covering them are untouched, so restoring the button is
 * flipping this back to `true`, not re-implementing anything.
 */
export const VOICE_INPUT_ENABLED = false;
