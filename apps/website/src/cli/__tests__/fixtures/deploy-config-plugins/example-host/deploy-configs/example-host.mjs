/**
 * @file Test fixture: a neutral deploy-config generator for the `tovu deploy config` CLI tests, so
 * core proves the CLI wire (argv, stdout vs --out, notes on stderr, the generator's own region
 * refusal) without depending on any real vendor's renderer. Real renderers are tested in their plugins.
 */
function render(descriptor, options, kit) {
  const region = options.region.trim();
  if (!region) throw kit.validationError("--region is required for --target example-host (no default region is assumed)");
  const contents = `app = "${descriptor.appName}"\nprimary_region = "${region}"\npath = "${descriptor.healthCheckPath}"\n`;
  const notes = [`Create the volume before the first deploy: example-host volumes create ${descriptor.volumeName} --region ${region}`];
  return { filename: "example-host.conf", contents, notes };
}
export default { render };
