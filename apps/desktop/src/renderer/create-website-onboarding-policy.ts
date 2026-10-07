/** Owner 2026-10-06: Supabase stays unavailable until this app has a hosted-database provisioner. */
export const SUPABASE_DATABASE_AVAILABLE = false;

/** Keep the database card, optional service fields, and error footer decisions out of JSX. */
export function createWebsiteOnboardingPolicy(
  { formError }: { formError: string | null },
  { supabaseDatabaseAvailable = SUPABASE_DATABASE_AVAILABLE }: { supabaseDatabaseAvailable?: boolean } = {},
) {
  return {
    supabaseDatabaseUnavailable: !supabaseDatabaseAvailable,
    showConnectServices: supabaseDatabaseAvailable,
    showErrorFooter: Boolean(formError),
  };
}
