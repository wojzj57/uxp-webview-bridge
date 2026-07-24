export function createUnimplementedNamespace<T extends object>(name: string): T {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(`${name} is scaffolded but not implemented yet.`);
      }
    }
  ) as T;
}
