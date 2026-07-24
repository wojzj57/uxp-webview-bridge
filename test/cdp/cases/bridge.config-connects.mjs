export default async function bridgeConfigConnects({ bridge, assert }) {
  bridge.ensureConfigured();

  const platform = await bridge.os.platform();
  assert.nonEmptyString(platform, "os.platform()");

  return { platform };
}
