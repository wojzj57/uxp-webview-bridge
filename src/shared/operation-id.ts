export function createOperationId(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Secure random values are required to create bridge operation identifiers.");
  }
  const randomValues = new Uint32Array(4);
  cryptoApi.getRandomValues(randomValues);
  return `op_${Array.from(randomValues, (value) => value.toString(16).padStart(8, "0")).join("")}`;
}
