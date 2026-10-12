import { useId } from "react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import "../../styles/media-content-editor.css";
import { MediaContentEditor } from "./MediaContentEditor";

/**
 * @file "Content for this spot" — the per-placement override choice inside a `widgetEmbed` node's
 * Style dialog (`widget-embed-extension.tsx`). "Custom for this post" reuses the same
 * `MediaContentEditor` the widget editor page uses: one editor component, two hosts. State is the
 * caller's (`useWidgetEmbedNodeView`'s `placementContent`); this file is markup only.
 */

export interface PlacementContentFieldsProps {
  widgetType: string;
  custom: boolean;
  content: Record<string, unknown>;
  setCustom: (custom: boolean) => void;
  setContent: (content: Record<string, unknown>) => void;
  t?: Translate;
}

export function PlacementContentFields({ widgetType, custom, content, setCustom, setContent, t = (key) => key }: PlacementContentFieldsProps) {
  const name = useId();
  return (
    <>
      <fieldset className="widget-embed-content-choice">
        <legend className="field-label">{t("Content for this spot")}</legend>
        <label>
          <input type="radio" name={name} checked={!custom} onChange={() => setCustom(false)} />
          {t("Use the widget's content")}
        </label>
        <label>
          <input type="radio" name={name} checked={custom} onChange={() => setCustom(true)} />
          {t("Custom for this post")}
        </label>
      </fieldset>
      {custom ? <MediaContentEditor widgetType={widgetType} config={content} onChange={setContent} t={t} /> : null}
    </>
  );
}
