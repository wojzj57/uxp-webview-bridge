let nextOperationId = 1;

export function createOperationId(): string {
  const id = nextOperationId;
  nextOperationId += 1;
  return `op_${id}`;
}
