import { JiniChatProvider, type useT } from "@jini-ai/chat/react";
import type { ChatTransport } from "@jini-ai/chat";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PushToTalkMicButton } from "../PushToTalkMicButton";
import { VoiceInputPlaceholder } from "../VoiceInputPlaceholder";

/** @file Each voice-input component receives every hook it calls as a prop defaulted to the real hook. */

afterEach(cleanup);

/** A translator that is visibly not the key, so an assertion proves the injected hook ran. */
const useQuotingT: typeof useT = () => (key) => `«${key}»`;

const FR: Record<string, string> = { "Voice input (coming soon)": "Saisie vocale (bientôt disponible)", "Hold to talk": "Maintenir pour parler" };

/** The real chat provider with a French adapter; neither component reads the transport, so a bare object stands in for it. */
function inFrench(children: ReactNode) {
  const i18n = { locale: "fr", t: (key: string) => FR[key] ?? key };
  return <JiniChatProvider transport={{} as ChatTransport} i18n={i18n}>{children}</JiniChatProvider>;
}

describe("VoiceInputPlaceholder translation hook", () => {
  it("renders the translator supplied through useTHook", () => {
    render(<VoiceInputPlaceholder useTHook={useQuotingT} />);
    expect(screen.getByRole("button", { name: "«Voice input (coming soon)»" })).toBeInTheDocument();
  });

  it("renders the translated label from the real provider, not the key", () => {
    render(inFrench(<VoiceInputPlaceholder />));
    expect(screen.getByRole("button", { name: "Saisie vocale (bientôt disponible)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voice input (coming soon)" })).not.toBeInTheDocument();
  });
});

describe("PushToTalkMicButton hooks", () => {
  const view = { className: "tovu-push-to-talk", disabled: false, isRecording: false, label: "Hold to talk", ariaLive: "polite" } as const;
  const talk = { available: true as const, unavailableReason: undefined, indicator: { label: "Hold to talk", ariaLive: "polite" as const, isRecording: false }, startHold: vi.fn(), endHold: vi.fn() };

  it("renders the view and translator supplied through the injected hooks", () => {
    const useSpaceHoldToTalkHook = vi.fn();
    render(
      <PushToTalkMicButton
        onTranscript={vi.fn()}
        useTHook={useQuotingT}
        usePushToTalkHook={() => talk}
        useMicButtonViewHook={() => view}
        useSpaceHoldToTalkHook={useSpaceHoldToTalkHook}
      />,
    );
    expect(screen.getByRole("button", { name: "«Hold to talk»" })).toBeInTheDocument();
    expect(useSpaceHoldToTalkHook).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, onEngage: talk.startHold, onRelease: talk.endHold }));
  });

  it("renders the translated label from the real provider, not the key", () => {
    render(
      inFrench(
        <PushToTalkMicButton onTranscript={vi.fn()} usePushToTalkHook={() => talk} useMicButtonViewHook={() => view} useSpaceHoldToTalkHook={vi.fn()} />,
      ),
    );
    expect(screen.getByRole("button", { name: "Maintenir pour parler" })).toBeInTheDocument();
  });
});
