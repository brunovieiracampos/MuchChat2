import { describe, expect, it } from "vitest";
import { escapeHtml, renderMarkdown } from "@/lib/markdown";

describe("markdown do bloco de texto", () => {
  it("parágrafos, com quebra de linha simples virando <br>", () => {
    expect(renderMarkdown("linha 1\nlinha 2\n\noutro")).toBe("<p>linha 1<br>linha 2</p>\n<p>outro</p>");
  });

  it("títulos descem um nível", () => {
    expect(renderMarkdown("# Um\n## Dois\n### Três")).toBe("<h2>Um</h2>\n<h3>Dois</h3>\n<h4>Três</h4>");
  });

  it("listas com e sem número", () => {
    expect(renderMarkdown("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(renderMarkdown("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
    expect(renderMarkdown("- a\n1. b")).toBe("<ul><li>a</li></ul>\n<ol><li>b</li></ol>");
  });

  it("citação", () => {
    expect(renderMarkdown("> dica\n> importante")).toBe("<blockquote>dica<br>importante</blockquote>");
  });

  it("negrito, itálico e código", () => {
    expect(renderMarkdown("Olá **mundo** e *você*")).toBe("<p>Olá <strong>mundo</strong> e <em>você</em></p>");
    expect(renderMarkdown("use `**isso**` assim")).toBe("<p>use <code>**isso**</code> assim</p>");
  });

  it("link http abre em nova aba", () => {
    expect(renderMarkdown("[site](https://exemplo.com/a?b=1&c=2)")).toBe(
      '<p><a href="https://exemplo.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">site</a></p>');
  });

  it("HTML cru vira texto", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("link que não é http ou https não vira link", () => {
    for (const src of ["[clique](javascript:alert(1))", "[clique](data:text/html,x)", "[clique](//exemplo.com)", "[clique](/admin)"]) {
      const html = renderMarkdown(src);
      expect(html).not.toContain("<a ");
      expect(html).not.toContain("javascript:");
      expect(html).toContain("clique");
    }
  });

  it("aspas no endereço não escapam do atributo", () => {
    const html = renderMarkdown('[x](https://a.com"onmouseover="alert(1))');
    expect(html).not.toContain('"onmouseover');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("texto vazio devolve vazio; caractere nulo é descartado", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("a\u00000\u0000b")).toBe("<p>a0b</p>");
  });

  it("escapa os cinco caracteres do HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("/n para pular linha", () => {
  it("sozinho entre duas linhas deixa uma linha em branco", () => {
    expect(renderMarkdown("um\n/n\ndois")).toBe("<p>um<br><br>dois</p>");
  });
  it("no meio da linha quebra a linha", () => {
    expect(renderMarkdown("um /n dois")).toBe("<p>um <br> dois</p>");
  });
  it("sozinho entre parágrafos vira um espaço a mais", () => {
    expect(renderMarkdown("um\n\n/n\n\ndois")).toBe("<p>um</p>\n<p><br></p>\n<p>dois</p>");
  });
  it("não mexe em /n dentro de palavra, link ou código", () => {
    expect(renderMarkdown("veja a/n e /news")).toBe("<p>veja a/n e /news</p>");
    expect(renderMarkdown("[site](https://x.com/n)")).toContain('href="https://x.com/n"');
    expect(renderMarkdown("`/n`")).toBe("<p><code>/n</code></p>");
  });
});

describe("cor num trecho", () => {
  it("vira um span com a classe da cor", () => {
    expect(renderMarkdown("um {laranja}destaque{/laranja} aqui")).toBe('<p>um <span class="dia-c-laranja">destaque</span> aqui</p>');
  });
  it("aceita negrito dentro e vale em títulos e listas", () => {
    expect(renderMarkdown("{verde}**ok**{/verde}")).toBe('<p><span class="dia-c-verde"><strong>ok</strong></span></p>');
    expect(renderMarkdown("## {azul}Passo{/azul}")).toBe('<h3><span class="dia-c-azul">Passo</span></h3>');
    expect(renderMarkdown("- {vermelho}não{/vermelho}")).toBe('<ul><li><span class="dia-c-vermelho">não</span></li></ul>');
  });
  it("ignora cor fora da paleta, marcação sem fechar e código", () => {
    expect(renderMarkdown("{rosa}x{/rosa}")).toBe("<p>{rosa}x{/rosa}</p>");
    expect(renderMarkdown("{verde}x")).toBe("<p>{verde}x</p>");
    expect(renderMarkdown("`{verde}x{/verde}`")).toBe("<p><code>{verde}x{/verde}</code></p>");
  });
  it("não deixa HTML passar pelo trecho colorido", () => {
    expect(renderMarkdown("{amarelo}<b>x</b>{/amarelo}")).toBe('<p><span class="dia-c-amarelo">&lt;b&gt;x&lt;/b&gt;</span></p>');
  });
});
