import { useEffect, useMemo, useRef, useState } from "react";
import { bindMediaContentEditor } from "@jini-ai/cms/react/widgets/WidgetConfigFields/MediaContentEditor";
import { acceptedMediaItems } from "@jini-ai/cms/react/media/MediaPickerDialog/MediaPickerDialog.hooks";
import { useMediaContentEditor } from "@jini-ai/cms/react/widgets/WidgetConfigFields/MediaContentEditor.hooks";
import { Dialog } from "@jini-ai/ui-kit/react";
import { Icon } from "@jini-ai/ui";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import { DockHeaderTip } from "@jini-ai/admin/shell/components/AssistantDock/DockHeaderTip";
import { DevicePreviewFrame } from "@jini-ai/admin/shell/components/DevicePreview/DevicePreviewFrame";
import { acceptsMedia } from "@jini-ai/admin/media";
import { HtmlAttributeRows } from "./HtmlAttributeRows";
import { useWiredMediaPickerItems, defaultMediaPickerPort } from "../MediaPickerDialog/media-picker-dependencies.hooks";
import { DEFAULT_LOCALE } from "../../hooks/admin-locale-dependencies.hooks";
import { useWidgetPreview } from "./WidgetPreview.hooks";
import "../../styles/native-domain-dialogs.css";
import "../../styles/media-content-editor.css";

export const MediaContentEditor = bindMediaContentEditor({
  hooks: {
    useEditor: useMediaContentEditor,
    usePreview: useWidgetPreview,
    useMediaPickerItems: useWiredMediaPickerItems,
    useTabBarKeyboard,
    useEffect, useMemo, useRef, useState,
  },
  kit: { Dialog, Icon, InfoTip, DockHeaderTip, DevicePreviewFrame, HtmlAttributeRows },
  deps: { port: defaultMediaPickerPort, locale: DEFAULT_LOCALE, acceptsMedia, acceptedMediaItems, resolveTabBarTabIndex },
});
