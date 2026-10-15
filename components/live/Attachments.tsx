"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText } from "lucide-react";
import { api } from "@/lib/client/api";
import type { ApiAttachment } from "@/lib/client/types";
import { formatBytes } from "./ui";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // abaixo do limite de corpo da Vercel
const MAX_FILES = 10;

export type Upload = {
  id: string;
  file: File;
  preview?: string;
  attachment?: ApiAttachment;
  error?: string;
};

// Sobe cada arquivo assim que é escolhido; a mensagem só leva as referências.
export function useUploader(channelId: string) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const ref = useRef(uploads);
  useEffect(() => {
    ref.current = uploads;
  }, [uploads]);

  useEffect(
    () => () => {
      ref.current.forEach((u) => u.preview && URL.revokeObjectURL(u.preview));
    },
    [],
  );

  const add = useCallback(
    (files: FileList | File[]) => {
      const list = [...files].slice(0, MAX_FILES - ref.current.length);
      for (const file of list) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        if (file.size > MAX_UPLOAD_BYTES) {
          setUploads((u) => [...u, { id, file, preview, error: `Máximo ${formatBytes(MAX_UPLOAD_BYTES)}` }]);
          continue;
        }
        setUploads((u) => [...u, { id, file, preview }]);
        const form = new FormData();
        form.append("file", file);
        api<ApiAttachment>(`/channels/${channelId}/attachments`, { body: form })
          .then((attachment) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, attachment } : x))))
          .catch((e) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: (e as Error).message } : x))));
      }
    },
    [channelId],
  );

  const remove = useCallback((id: string) => {
    setUploads((u) => {
      const gone = u.find((x) => x.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return u.filter((x) => x.id !== id);
    });
  }, []);

  const clear = useCallback(() => setUploads([]), []);

  return {
    uploads,
    add,
    remove,
    clear,
    ready: uploads.filter((u) => u.attachment),
    busy: uploads.some((u) => !u.attachment && !u.error),
  };
}

export function Attachments({ items }: { items: ApiAttachment[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {items.map((a) =>
        a.content_type?.startsWith("image/") ? (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.filename}
              loading="lazy"
              // tamanho conhecido: o espaço fica reservado e a conversa não "pula" quando a imagem chega
              width={a.width ?? undefined}
              height={a.height ?? undefined}
              className="h-auto max-h-80 w-auto max-w-[min(100%,420px)] rounded-lg border border-ink/20 object-contain"
              style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
            />
          </a>
        ) : a.content_type?.startsWith("video/") ? (
          <video key={a.id} src={a.url} controls className="max-h-80 max-w-[min(100%,480px)] rounded-lg border border-ink/20" />
        ) : (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="flex max-w-sm items-center gap-3 rounded-lg border border-ink bg-paper px-3 py-2.5 shadow-hard-sm hover:bg-sheet"
          >
            <FileText size={28} className="shrink-0 text-signal" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold">{a.filename}</span>
              <span className="block font-mono text-[11px] text-muted">{formatBytes(a.size)}</span>
            </span>
            <Download size={16} className="text-muted" />
          </a>
        ),
      )}
    </div>
  );
}
