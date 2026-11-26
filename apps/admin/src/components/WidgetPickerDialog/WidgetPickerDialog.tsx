import type { ComponentProps } from "react";
import { Dialog } from "@jini-ai/ui-kit/react";
import {
  WidgetPickerDialog as JiniWidgetPickerDialog,
  WidgetAddControl as JiniWidgetAddControl,
  WidgetSelectionDialog as JiniWidgetSelectionDialog,
} from "@jini-ai/cms/react/widgets/WidgetPickerDialog/WidgetPickerDialog";
import { widgetTypeLabel } from "@jini-ai/admin/widgets";
import { t as translateWidgets } from "../../features/widgets/widgets-i18n";
import { WidgetConfigFields } from "../WidgetConfigFields/WidgetConfigFields";
import { WIDGET_TYPE_OPTIONS } from "../WidgetConfigFields/widget-config-host-policy";
import { Select } from "../Select/Select";
import { useWiredWidgetAddControl, useWiredWidgetPickerDialog } from "./WidgetPickerDialog.hooks";
import "../../styles/native-domain-dialogs.css";

const kit = { Dialog, Select, WidgetConfigFields };
const deps = { WIDGET_TYPE_OPTIONS, widgetTypeLabel, translateWidgets };

export type WidgetPickerDialogProps = Omit<ComponentProps<typeof JiniWidgetPickerDialog>, "kit" | "deps" | "useDialog"> & {
  useDialog?: ComponentProps<typeof JiniWidgetPickerDialog>["useDialog"];
};

export function WidgetPickerDialog({ useDialog = useWiredWidgetPickerDialog, ...props }: WidgetPickerDialogProps, _optional = {}) {
  return <JiniWidgetPickerDialog {...props} useDialog={useDialog} kit={kit} deps={deps} />;
}

export type WidgetAddControlProps = Omit<ComponentProps<typeof JiniWidgetAddControl>, "kit" | "deps" | "useDialog" | "useAddControl"> & {
  useAddControl?: ComponentProps<typeof JiniWidgetAddControl>["useAddControl"];
};

export function WidgetAddControl({ useAddControl = useWiredWidgetAddControl, ...props }: WidgetAddControlProps, _optional = {}) {
  return <JiniWidgetAddControl {...props} useAddControl={useAddControl} useDialog={useWiredWidgetPickerDialog} kit={kit} deps={deps} />;
}

export function WidgetSelectionDialog({ useAddControl = useWiredWidgetAddControl, useDialog = useWiredWidgetPickerDialog, ...props }: {
  onResolved: WidgetAddControlProps["onResolved"];
  onCancel: () => void;
  agentHandle?: string;
  useAddControl?: ComponentProps<typeof JiniWidgetSelectionDialog>["useAddControl"];
  useDialog?: ComponentProps<typeof JiniWidgetSelectionDialog>["useDialog"];
}, _optional = {}) {
  return <JiniWidgetSelectionDialog {...props} useAddControl={useAddControl} useDialog={useDialog} kit={kit} deps={deps} />;
}
