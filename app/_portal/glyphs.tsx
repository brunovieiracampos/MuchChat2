/**
 * Camada decorativa de caracteres do universo de IA (números, operadores, termos curtos), atrás do conteúdo.
 * A composição sai de uma semente, então é a mesma no servidor e no navegador, e muda de um cartão para outro.
 * Sozinha é estática; quem move os grupos com o cursor é `GlyphMotion` (glyph-motion.tsx).
 */

const SYMBOLS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "<", ">", "/", "=", "+", "-", "*", "%", "{", "}", "[", "]", "(", ")", "#", "@", "$", "_"];
const WORDS = ["AI", "ML", "API", "LLM", "prompt", "data", "model", "agent", "token", "json", "ctx", "0.7", "=>", "</>", "{ }", "fn()", "top_p", "embed", "eval"];

/** Gerador determinístico (mulberry32): mesma semente, mesma composição. */
function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Profundidades em pixels de deslocamento máximo: quase parado, intermediário e mais perceptível. */
const DEPTHS = { hero: [4, 11, 22], card: [1.5, 3, 5] } as const;

export function GlyphField({ seed, groups, variant = "hero" }: { seed: number; groups: number; variant?: "hero" | "card" }) {
  const rand = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const depths = DEPTHS[variant];
  const [lo, hi] = variant === "hero" ? [0.04, 0.12] : [0.03, 0.08];

  const items = Array.from({ length: groups }, (_, i) => {
    // Grade com desvio: espalha os grupos sem deixar buracos nem amontoar.
    const cols = Math.ceil(Math.sqrt(groups * (variant === "hero" ? 2.2 : 1.6)));
    const rows = Math.ceil(groups / cols);
    const x = ((i % cols) + 0.15 + rand() * 0.7) / cols * 100;
    const y = (Math.floor(i / cols) + 0.15 + rand() * 0.7) / rows * 100;
    const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () =>
      Array.from({ length: 2 + Math.floor(rand() * 4) }, () => (rand() < 0.22 ? pick(WORDS) : pick(SYMBOLS))).join(" "));
    const layer = Math.floor(rand() * 3);
    return {
      x, y, text: lines.join("\n"), depth: depths[layer],
      // A camada mais próxima é um pouco mais visível.
      opacity: lo + (hi - lo) * ((layer + rand()) / 3),
      rotate: rand() < 0.3 ? Math.round((rand() - 0.5) * 8) : 0,
      scale: rand() < 0.25 ? 1 + Math.round(rand() * 4) / 10 : 1,
      dot: rand() < 0.09,
    };
  });

  return (
    <div className={`dia-glyphs is-${variant}`} aria-hidden="true">
      {items.map((g, i) => (
        <span key={i} className={`dia-glyphs__g${i >= Math.ceil(groups * 0.4) ? " is-extra" : ""}`} data-dia-depth={g.depth} style={{ left: `${g.x}%`, top: `${g.y}%` }}>
          {/* O ponto laranja fica fora do texto esmaecido: é o único detalhe de cor da camada. */}
          {g.dot && <i className="dia-glyphs__dot" />}
          <span className="dia-glyphs__t" style={{ opacity: g.opacity, transform: g.rotate || g.scale !== 1 ? `rotate(${g.rotate}deg) scale(${g.scale})` : undefined }}>{g.text}</span>
        </span>
      ))}
    </div>
  );
}
