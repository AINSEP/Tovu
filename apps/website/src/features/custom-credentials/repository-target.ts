import type { RepositoryTargetValidator } from "@jini-ai/devops/source-control/site/provider-module";
import { repositoryTargetError } from "@jini-ai/devops/source-control";
import { validateRepositoryTarget as validateTargetInput } from "@jini-ai/integrations/custom-credentials/write-files-validation";

export function validateRepositoryTarget(target: { owner: unknown; repo: unknown }, { validateTarget }: { validateTarget?: RepositoryTargetValidator } = {}): { owner: string; repo: string } {
  return validateTargetInput({ ...target, repositoryTargetError }, { ...(validateTarget === undefined ? {} : { validateTarget }) });
}
