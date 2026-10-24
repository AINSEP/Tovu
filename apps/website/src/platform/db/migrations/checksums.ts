/**
 * @file Pinned checksums, one per migration id (ADR-066 §3). The runner records these and compares
 * them with the ledger; `__tests__/checksums.test.ts` re-derives each from the step's sources, so an
 * edit to a shipped step goes red instead of silently differing between databases.
 *
 * - `0000_legacy_baseline`: sha256 of the frozen drizzle chain's (tag, file hash) list and the
 *   Postgres baseline statements (`legacyBaselineChecksum()`).
 * - Every later step: sha256 of its `NNNN_name.ts` source with comments removed and whitespace
 *   collapsed (the test's `sourceChecksum`). Chat steps are keyed `chat/NNNN_name` (their file under
 *   `chat/`). Pinned, not computed at runtime: dev runs the `.ts`
 *   through tsx and production runs tsc output, which would hash differently.
 *
 * Add new ids with `UPDATE_MIGRATION_CHECKSUMS=1`; the updater never changes an existing one.
 */
export const MIGRATION_CHECKSUMS: Readonly<Record<string, string>> = {
  "0000_legacy_baseline": "2dc785cd1a16b371ac1cc8f6798c688d3c2e0a9a489c54535ef1cf8ca324e714",
  "0001_post_search": "234ca1fdbacd2462582ef55c551f4b5046236384b6e90f799d95fecb944e6795",
  "chat/0000_chat_baseline": "d7673b2b2ac8af992a396b375fa38da8ffbf852285c772016dc47c82d66d17a9",
  "0002_drop_empty_legacy_chat_tables": "1e33d7ab4ba950fcfa5c8fdb86d312a571f5e88c2d043e603970ad2914a7583b",
  "chat/0001_sqlite_chat_tables": "6ab892750dcd9201f17bd05df3f3f69f84a6342d54647984d6c834dd7d5d164f",
  "0003_coercion_json_as_json": "1135e06ed42097731f6ef16c2c4d826b0b23a171640e50df96517136876e99cf",
  "0004_drop_unused_deployment_tables": "315701db702123c69de2b4f56497b191b1245f326fa6fdd2beabc01550838b3c",
  "0005_media_createdby": "81cefae555b8d577076fcc3adb42ff50be82935d4e76ed13042f9475f3346c5a",
  "0006_submission_ip_retention": "46d094a528ef15a53db38f942c1984194e203afaae931da2c1e8ce61d07f89e7",
  "0007_publish_backstop": "2cb8d296d59a3b5c68cd66d995b8a36c6e5221cabe592e7ffb8a7fc4fabbfc5d",
  "0008_posts_publish_at_featured_media": "8e8c5e9e817d50991eb5ec93bcaf6f947f6626b207774da00587c06efc4eb149",
  "0009_posts_author": "d1459a9e838af891cfb4feafab4a989b5a5e712885656668047b472841438cd2",
  "chat/0002_durable_run_attempts": "c5737dcb73f4c5711ad44db8531e268551c0b7c94f219dee609539138acd9414",
  "0010_members_credentials_revoked_at": "51b21e04877cf8293e02af18121767ea6b95b7ada284e6d82468f93be607e571",
  "0011_drop_empty_core_commerce_tables": "047fc0b89a63c6a42a82e63d3e6d5f5065be0359a99e8740779ef794a4b0b9ad",
  "0012_secrets_vault": "8d01ea77b29f63e6dc3a0a41ee22d71f364dbeaad70083572a190382d9c20d16",
  "0013_unify_vault_credentials": "c5f2e8abb16c9cd25b505c7968e882a5ce0c2ff5165a5f16777b1b920bd18ab9",
  "0014_media_library": "579fe4c08722557d03a91faf7126d4215f43dd0c4fb892e4d4817dc5a3e5af11",
  "0015_document_blob_ownership": "d0c2253051a23d3d788c2b12868cb3a42272bb0cf26f8ddf96b00d76f4fc3a51",
  "0016_publish_destination_history": "2b400f28186beb7ace8845629523cf6a42fdcf1685f4694b4035a6603554d93b",
  "0017_publish_history_kind": "283a3c719013f6d7489b0d75abf7e98d8f1f097ac00928a6d6b13313d9a33b70",
  "0018_form_submission_remote_receipts": "0dcd48feebad2a61c5dad7faa6925c93f264654b4430bbf6e4a8f2a63df0679c",
  "0019_form_delivery_plans": "77551d3bffd03981c82bbe488f9554fada2366434287ca50e56276a785ec5a66",
  "0020_vault_api_connection_kind": "daab33d39387598f9967109e44fa6edaa3cc5879cbcaa3638f1d793755ff02f5",
  "0021_site_consent_revisions": "29797f0c56ff957d30bd723a38eb4a8a8047f4db723d7a8ddb18026ffedae820",
  "0022_workspace_mcp_cascade": "f467936254b564a808247e7f56cadf2d89724d36a6f863e966aa8b0ce58f787d",
  "0023_mail_ledgers": "abfddfb661663c537d23b2c3ebd84c0cf06f6bc7a1948fcbbff25d60c3505319",
  "0024_domain_bindings": "cea288e4c976a8ddb3d504639671ce802dbe025762c5543964821be62244a791",
  "0025_mail_feedback_processed": "296fe07516f30c5404dc2147293bd498d84214c419902322995096212daea75b",
  "0026_domain_binding_version": "c21e7bc7eadfed3163cf4fb3c40a7b36a3b20ba3b6a72b86e55f1095a4ccf671",
  "0027_search_index": "fb9ef990445cbc825ca90e1bd5e60aed5874b23a962e40e74a86041a120116e7",
  "0028_search_index_retired": "f996ef75e19887474111b1d8d75d5f5e051786ff21e1a4d1f6a4d5bc418c5b54",
  "0029_mail_activity_indexes": "25d2c17ae98790635739b8de1a7c654a21f9401a5c2e6b4578a72b733d459482",
  "0030_mail_suppression_admin": "c20e15d2f7965eed4cb580daa0eaa066f8ae5f70a1bfc5e99d55c4108e0f0381",
  "0031_mail_activity_retention": "164f0f2db8b390a0aabd7c5ef12c7c24ba32d02d57e16719f57e5181a9d29608",
  "0032_member_signup_email": "3560fb4543e01863f5c6f5794311111dda9a6a1f856f9f0e31d5e4c2820098cc",
  "0033_mail_activity_message": "1f23854e73deab75ef484a402590a625c9986f90a43e50a4bd9422b88f530c79",
};
