/**
 * Markdown simples do bloco de Texto → HTML seguro. Sem dependências: roda no servidor e no navegador.
 * Aceita títulos (#, ##, ###), listas (- e 1.), citação (>), **negrito**, *itálico*, `código` e [links](https://…).
 * Todo o texto é escapado antes: HTML cru nunca passa. Links só http e https.
 */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

const HELD = /\u0000(\d+)\u0000/g;

/** Formatação dentro da linha. Código e links ficam guardados para o negrito e o itálico não mexerem neles. */
function inline(raw: string): string {
  const held: string[] = [];
  const hold = (html: string) => { held.push(html); return `\u0000${held.length - 1}\u0000`; };
  let s = escapeHtml(raw);
  s = s.replace(/`([^`]+)`/g, (_, code: string) => hold(`<code>${code}</code>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) =>
    /^https?:\/\//i.test(url) ? hold(`<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`) : label);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  // Um link pode ter código no rótulo (um marcador dentro de outro): por isso mais de uma passada.
  for (let pass = 0; pass < 3 && s.includes("\u0000"); pass++) s = s.replace(HELD, (_, i: string) => held[Number(i)]);
  return s;
}

type List = { tag: "ul" | "ol"; items: string[] };

export function renderMarkdown(src: string): string {
  const out: string[] = [];
  const st = { para: [] as string[], quote: [] as string[], list: null as List | null };
  const flush = () => {
    if (st.para.length) out.push(`<p>${st.para.map(inline).join("<br>")}</p>`);
    if (st.quote.length) out.push(`<blockquote>${st.quote.map(inline).join("<br>")}</blockquote>`);
    if (st.list) out.push(`<${st.list.tag}>${st.list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${st.list.tag}>`);
    st.para = []; st.quote = []; st.list = null;
  };

  for (const rawLine of src.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) { flush(); continue; }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flush();
      const level = heading[1].length + 1;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ul || ol) {
      const tag = ul ? "ul" : "ol";
      if (st.para.length || st.quote.length || (st.list && st.list.tag !== tag)) flush();
      st.list ??= { tag, items: [] };
      st.list.items.push((ul ?? ol)![1]);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      if (st.para.length || st.list) flush();
      st.quote.push(quote[1]);
      continue;
    }

    if (st.list || st.quote.length) flush();
    st.para.push(line.trim());
  }
  flush();
  return out.join("\n");
}
