export default async function osPlatform({ bridge, assert }) {
  bridge.ensureConfigured();

  const platform = await bridge.os.platform();
  assert.nonEmptyString(platform, "os.platform()");

  return { platform };
}
