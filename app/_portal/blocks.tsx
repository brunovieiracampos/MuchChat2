import { renderMarkdown } from "@/lib/markdown";
import { fileExt, formatBytes, isHttpUrl, type Block } from "@/lib/material";
import { Icon } from "./parts";
import { PromptBlock } from "./prompt-block";

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

/**
 * Blocos de um material, na ordem. Usado na página pública e na pré-visualização do editor.
 * Bloco ainda vazio (rascunho) não aparece. O espaço entre os blocos vem do contêiner (`dia-stack`).
 */
export function BlocksView({ blocks, urls, fileHref, preview, unavailableFile }: {
  blocks: Block[];
  /** Caminho da imagem no armazenamento → endereço para mostrar. */
  urls: Record<string, string>;
  /** Endereço de download de um bloco de arquivo; null mostra o bloco sem ação. */
  fileHref: (blockId: string) => string | null;
  /** Pré-visualização do editor: o arquivo aparece com o botão, mesmo sem link. */
  preview?: boolean;
  /** Bloco de arquivo cujo download acabou de falhar: aparece com o aviso e "Tentar de novo". */
  unavailableFile?: string;
}) {
  let prompts = 0;
  return (
    <>
      {blocks.map((b) => {
        if (b.type === "text") {
          return b.markdown.trim()
            ? <div key={b.id} className="dia-enter is-text"><div className="dia-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(b.markdown) }} /></div>
            : null;
        }
        if (b.type === "prompt") {
          if (!b.text.trim()) return null;
          prompts++;
          return <div key={b.id} className="dia-enter"><PromptBlock index={prompts} label={b.label} text={b.text} /></div>;
        }
        if (b.type === "file") {
          if (!b.path) return null;
          const ext = fileExt(b.path) || fileExt(b.name);
          const kind = ext ? ext.toUpperCase() : "arquivo";
          const href = fileHref(b.id);
          const off = unavailableFile === b.id;
          return (
            <div key={b.id} className="dia-enter">
              <div className={`dia-file${off ? " is-unavailable" : ""}`}>
                <div className="dia-file__icon" data-kind={ext}><b>{ext ? kind : "ARQ"}</b></div>
                <div>
                  <p className="dia-file__name">{b.name}</p>
                  {b.description.trim() && <p className="dia-file__desc">{b.description}</p>}
                  <div className="dia-meta dia-file__meta">{kind} · {formatBytes(b.size)}</div>
                </div>
                {off && (
                  <div className="dia-file__warn" role="status">
                    <Icon name="warn" />
                    <span><b>Arquivo indisponível no momento.</b> Não é você: o link do arquivo está fora do ar. Tente de novo em alguns minutos.</span>
                  </div>
                )}
                {href
                  ? <a className={`dia-btn ${off ? "dia-btn--secondary" : "dia-btn--primary"} dia-btn--block dia-file__action`} href={href}>{off ? "Tentar de novo" : <><Icon name="download" />Baixar {kind}</>}</a>
                  : preview ? <span className="dia-btn dia-btn--primary dia-btn--block dia-file__action" aria-hidden="true"><Icon name="download" />Baixar {kind}</span> : null}
              </div>
            </div>
          );
        }
        if (b.type === "links") {
          const items = b.items.filter((i) => i.title.trim() && isHttpUrl(i.url.trim()));
          if (!items.length) return null;
          return (
            <div key={b.id} className="dia-enter">
              <div className="dia-links">
                <div className="dia-links__head">
                  <span className="dia-label">Links · {items.length}</span>
                  <span className="dia-meta">abre fora do portal</span>
                </div>
                <ol>
                  {items.map((i, n) => (
                    <li key={n}>
                      <a className="dia-link-row" href={i.url.trim()} target="_blank" rel="noopener noreferrer nofollow">
                        <span className="dia-link-row__title">{i.title}</span>
                        <span className="dia-link-row__go"><Icon name="out" small /></span>
                        {i.description.trim() && <span className="dia-link-row__desc">{i.description}</span>}
                        <span className="dia-link-row__domain">{host(i.url.trim())}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          );
        }
        if (!b.path) return null;
        return (
          <div key={b.id} className="dia-enter">
            {urls[b.path] ? (
              <figure className="dia-figure">
                <div className="dia-figure__img"><img src={urls[b.path]} alt={b.alt} width={b.width || undefined} height={b.height || undefined} loading="lazy" style={{ display: "block", width: "100%", height: "auto" }} /></div>
                {b.caption.trim() && <figcaption>{b.caption}</figcaption>}
              </figure>
            ) : <div className="dia-l-pending">Imagem indisponível no momento.</div>}
          </div>
        );
      })}
    </>
  );
}
