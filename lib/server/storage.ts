import { put, del } from "@vercel/blob";

// Onde ficam arquivos (anexos, emojis):
// - com BLOB_READ_WRITE_TOKEN: Vercel Blob (CDN, sem limite prático de espaço)
// - sem: no próprio MySQL (coluna MEDIUMBLOB). Bom para começar e para rodar local.
export const usingBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export async function storeFile(path: string, data: Buffer, contentType: string) {
  if (!usingBlob()) return { url: null as string | null, data };
  const blob = await put(path, data, { access: "public", contentType, addRandomSuffix: true });
  return { url: blob.url, data: null as Buffer | null };
}

export async function removeFiles(urls: (string | null | undefined)[]) {
  const list = urls.filter((u): u is string => !!u);
  if (!list.length || !usingBlob()) return;
  try {
    await del(list);
  } catch (err) {
    console.error("[concord] falha ao apagar do Blob", err);
  }
}

// Nome de arquivo seguro para URL e cabeçalho
export function safeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "arquivo";
  const clean = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return clean || "arquivo";
}

// Lê largura/altura do cabeçalho de PNG, GIF, JPEG e WebP (sem dependência)
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const kind = buf.toString("ascii", 12, 16);
      if (kind === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (kind === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (kind === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {}
  return null;
}

// Tipo real pelo conteúdo (não confia na extensão nem no que o navegador mandou)
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return "image/png";
  if (buf.length > 6 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null;
}
