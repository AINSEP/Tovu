/** @file The static export report as Tovu extends it: the exporter writes it; packagers and publishers read it. */
import type { ExportReport as BaseExportReport } from "@jini-ai/devops/static-export";

export interface ThemePreviewExportSize {
  themeCount: number; htmlSizeMultiplier: number; sizeMultiplier: number; additionalPages: number;
}

export interface ExportReport extends BaseExportReport {
  /** Static pages were rendered before cookie preferences became available. */
  consentWarning?: string;
  /** Public registry evidence used for this copy; absent when identity/discovery falls back. */
  publicOrigin?: string;
  /** Configured page multiplier and measured HTML byte multiplier; assets are crawled/deduplicated. */
  themePreview?: ThemePreviewExportSize;
}
