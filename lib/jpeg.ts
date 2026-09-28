/** Largura e altura de um JPEG lendo só o cabeçalho (marcador SOF). null se não for um JPEG válido. */
export function jpegSize(buf: Uint8Array): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    // SOF0–SOF15, exceto DHT (C4), JPG (C8) e DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (buf[i + 5] << 8) | buf[i + 6];
      const width = (buf[i + 7] << 8) | buf[i + 8];
      return width && height ? { width, height } : null;
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}
