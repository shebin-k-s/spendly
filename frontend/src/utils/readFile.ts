/**
 * Reads a picked file completely into memory. A file chosen straight from Google Drive (or another cloud
 * app) is only a link until it is read, and reading it later — when an upload starts — often fails. Reading
 * it right away avoids that. Different phones/browsers fail different ways, so try each reader in turn.
 */
export async function readFileBytes(file: Blob): Promise<ArrayBuffer> {
  const readers: (() => Promise<ArrayBuffer>)[] = [
    () => file.arrayBuffer(),
    () => new Response(file).arrayBuffer(),
    () =>
      new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsArrayBuffer(file);
      }),
  ];
  let lastError: unknown;
  for (const read of readers) {
    try {
      const bytes = await read();
      if (bytes.byteLength > 0) return bytes;
      lastError = new Error('The file is empty');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('Could not read the file');
}
