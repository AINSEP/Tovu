import type { NodeViewProps } from "@tiptap/react";
import { t as translateForMediaImage } from "../app-i18n";

/** Bind this screen's copy to the current locale. */
export function createMediaImageTranslator({ locale }: { locale: string }, _options = {}) {
  return ({ key }: { key: string }, _options = {}): string => translateForMediaImage({ locale, key });
}

/** Replace the image reference and close its picker. */
export function createMediaImageReplace({ props, setPicking }: { props: Pick<NodeViewProps, "updateAttributes">; setPicking: (value: boolean) => void }, _options = {}) {
  return (item: { id: string; alt: string; title: string }) => {
    props.updateAttributes({ assetId: item.id, transformName: "public", alt: item.alt || item.title, src: null, title: null });
    setPicking(false);
  };
}
