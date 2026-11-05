import { formatErrorForLog } from '@jini-ai/core';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
import { ownerResetPassword } from '@jini-ai/user-management/server';
import { resetSelfHostedOwner } from '#src/server/runtime/composition/reset-owner';

type ResetInput = { dir: string; password: string; username?: string };

/** Hidden-input wrapper for the existing host-secret fallback; no password option or argv value.
 * @throws On confirmation, owner selection or storage failure; never prints secrets or raw errors.
 * @complexity O(p) for p password characters, then one explicit reset; no polling or server startup.
 */
export async function runResetOwnerCommand(
  { dir }: { dir: string },
  { env = process.env, prompt, reset = resetSelfHostedOwner, print = console.log }: {
    env?: NodeJS.ProcessEnv;
    prompt?: (label: string) => Promise<string>;
    reset?: (input: ResetInput) => Promise<string>;
    print?: (text: string) => void;
  } = {},
): Promise<void> {
  const password = await ownerResetPassword({ env, passwordEnvKey: "TOVU_ADMIN_RESET_PASSWORD" }, { ...(prompt ? { prompt } : {}) });
  try {
    const username = await reset({ dir, password, ...(env.TOVU_ADMIN_RESET_USERNAME === undefined ? {} : { username: env.TOVU_ADMIN_RESET_USERNAME }) });
    print(`Owner '${username}' password reset and verified. Sign in with the new password. Unset TOVU_ADMIN_RESET_PASSWORD if configured.`);
  } catch (error) {
    const details = formatErrorForLog({ error }, { ...TOVU_ERROR_REDACTION_OPTIONS, exactSecrets: [password] });
    throw new Error('The owner password could not be reset. Check the site directory, owner username and database access, then retry. Details: cli-owner-reset\n' + details);
  }
}
