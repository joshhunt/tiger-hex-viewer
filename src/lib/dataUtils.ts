export function uint32ToArray(value: number) {
  return Array.from(new Uint8Array(new Int32Array([value]).buffer));
}
