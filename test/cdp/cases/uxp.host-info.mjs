export default async function uxpHostInfo({ bridge, assert }) {
  bridge.ensureConfigured();

  const [name, version, uiLocale, uxpVersion, pluginVersion] = await Promise.all([
    bridge.uxp.host.name,
    bridge.uxp.host.version,
    bridge.uxp.host.uiLocale,
    bridge.uxp.versions.uxp,
    bridge.uxp.versions.plugin
  ]);

  assert.nonEmptyString(name, "uxp.host.name");
  assert.nonEmptyString(version, "uxp.host.version");
  assert.nonEmptyString(uiLocale, "uxp.host.uiLocale");
  assert.nonEmptyString(uxpVersion, "uxp.versions.uxp");
  assert.nonEmptyString(pluginVersion, "uxp.versions.plugin");

  return {
    name,
    version,
    uiLocale,
    uxpVersion,
    pluginVersion
  };
}
