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
    for (const src of ["[clique](javascript:alert(1))", "[clique](data:text/html,x)", "[clique](//exemplo.com)", "[clique](/painel)"]) {
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
