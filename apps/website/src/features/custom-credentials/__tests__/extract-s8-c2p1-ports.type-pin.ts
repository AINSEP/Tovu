/**
 * @file EXTRACT-S8 C2 part 1 type pin, compiled explicitly (tests are excluded from the main
 * tsconfig). It fails to compile if the core port types drift from the shapes the existing Tovu
 * adapter and source-control providers actually produce and consume, in either direction.
 */
import type {
  CredentialAuthFailureDiagnostic,
  CredentialProbeInput,
  CredentialProbeStatus,
  CredentialVerification,
  CredentialedRequestPort,
  CredentialedRequestResult,
  SourceControlCommitFilesResult,
  SourceControlFileWritePlan,
  SourceControlFileWritePlanResult,
  SourceControlFileWriter,
  SourceControlWritePort,
} from "@jini-ai/core/contracts/credentials";
import type {
  AuthFailureDiagnostic,
  CredentialConnectionProbeInput,
  CredentialConnectionProbeStatus,
  CredentialedRequestExecutedResult,
  CustomCredentialVerificationResult,
} from "@jini-ai/integrations/credentialed-http";
import type { CommitFilesResult, FileWritePlan, FileWritePlanResult, SourceControlProvider } from "../../source-control/provider-module.js";
import type { bindCredentialedRequestPort, bindSourceControlWritePort } from "../credential-ports.js";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type C2p1TypePins = [
  Assert<Same<CredentialedRequestResult, CredentialedRequestExecutedResult>>,
  Assert<Same<CredentialVerification, CustomCredentialVerificationResult>>,
  Assert<Same<CredentialAuthFailureDiagnostic, AuthFailureDiagnostic>>,
  Assert<Same<CredentialProbeStatus, CredentialConnectionProbeStatus>>,
  Assert<Same<CredentialProbeInput, CredentialConnectionProbeInput>>,
  Assert<Same<SourceControlFileWritePlan, FileWritePlan>>,
  Assert<Same<SourceControlFileWritePlanResult, FileWritePlanResult>>,
  Assert<Same<SourceControlCommitFilesResult, CommitFilesResult>>,
  // The host's built provider is usable as the port's writer without a wrapper (same object).
  Assert<SourceControlProvider extends SourceControlFileWriter ? true : false>,
  Assert<Same<ReturnType<typeof bindCredentialedRequestPort>, CredentialedRequestPort>>,
  Assert<Same<ReturnType<typeof bindSourceControlWritePort>, SourceControlWritePort>>,
];
