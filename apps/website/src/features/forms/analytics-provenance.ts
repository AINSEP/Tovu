/** Tovu consent evidence attached to accepted live or imported submissions. */
export interface FormAnalyticsProvenance { granted: true; subjectId: string; consentProof?: import('@jini-ai/cms/consent').ConsentAnalyticsProof; }
