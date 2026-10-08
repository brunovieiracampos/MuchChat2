import { renderMarkdown } from "@/lib/markdown";
import { fileExt, formatBytes, isHttpUrl, type Block } from "@/lib/material";
import { CopyButton } from "./copy-button";

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/**
 * Blocos de um material, na ordem. Usado na página pública e na pré-visualização do editor.
 * Bloco ainda vazio (rascunho) não aparece, exceto arquivo e imagem sem endereço, que mostram um aviso.
 */
export function BlocksView({ blocks, urls, fileHref }: {
  blocks: Block[];
  /** Caminho da imagem no armazenamento → endereço para mostrar. */
  urls: Record<string, string>;
  /** Endereço de download de um bloco de arquivo; null mostra o bloco sem link. */
  fileHref: (blockId: string) => string | null;
}) {
  return (
    <div className="pt-blocks">
      {blocks.map((b) => {
        if (b.type === "text") {
          return b.markdown.trim() ? <div key={b.id} className="pt-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(b.markdown) }} /> : null;
        }
        if (b.type === "prompt") {
          return b.text.trim() ? (
            <figure key={b.id} className="pt-prompt">
              <figcaption>{b.label.trim() || "Prompt"}<CopyButton text={b.text} /></figcaption>
              <pre>{b.text}</pre>
            </figure>
          ) : null;
        }
        if (b.type === "file") {
          if (!b.path) return null;
          const href = fileHref(b.id);
          const inner = (
            <>
              <span className="pt-file-ext">{fileExt(b.name) || fileExt(b.path) || "arq"}</span>
              <span style={{ minWidth: 0 }}>
                <span className="pt-file-name" style={{ display: "block" }}>{b.name}</span>
                <span className="pt-file-sub">{b.description.trim() ? `${b.description.trim()} · ` : ""}{formatBytes(b.size)}</span>
              </span>
              <span className="pt-file-go">{href ? "Baixar" : "Indisponível"}</span>
            </>
          );
          return href
            ? <a key={b.id} className="pt-file" href={href}>{inner}</a>
            : <div key={b.id} className="pt-file is-off">{inner}</div>;
        }
        if (b.type === "links") {
          const items = b.items.filter((i) => i.title.trim() && isHttpUrl(i.url.trim()));
          return items.length ? (
            <ul key={b.id} className="pt-links">
              {items.map((i, n) => (
                <li key={n}>
                  <a className="pt-link" href={i.url.trim()} target="_blank" rel="noopener noreferrer nofollow">
                    <span className="pt-link-title" style={{ display: "block" }}>{i.title}</span>
                    {i.description.trim() && <span className="pt-link-desc" style={{ display: "block" }}>{i.description}</span>}
                    <span className="pt-link-host" style={{ display: "block" }}>{host(i.url.trim())}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null;
        }
        if (!b.path) return null;
        return urls[b.path] ? (
          <figure key={b.id} className="pt-image">
            <img src={urls[b.path]} alt={b.alt} width={b.width || undefined} height={b.height || undefined} loading="lazy" />
            {b.caption.trim() && <figcaption>{b.caption}</figcaption>}
          </figure>
        ) : <div key={b.id} className="pt-empty">Imagem indisponível no momento.</div>;
      })}
    </div>
  );
}
