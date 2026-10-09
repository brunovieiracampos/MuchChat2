import { Icon } from "@/app/_portal/parts";

/** Limite de visitas atingido: não sabemos de quem é o portal ainda, então a tela não tem topo. */
export function Busy() {
  return (
    <main className="dia-l-notice">
      <div className="dia-notice dia-grain">
        <div className="dia-notice__code"><span className="dia-dot" aria-hidden="true" /><span className="dia-label">Muita gente agora</span></div>
        <h1 className="dia-notice__title">Muitas visitas ao mesmo tempo</h1>
        <p className="dia-notice__text">O portal está recebendo mais acessos do que dá conta neste minuto. Espere uns segundos e tente de novo: seu link continua valendo.</p>
        <div className="dia-notice__actions">
          {/* Endereço vazio recarrega a própria página, com o mesmo link. */}
          <a className="dia-btn dia-btn--primary" href="">Tentar de novo</a>
          <a className="dia-btn dia-btn--secondary" href="https://www.instagram.com/">Ver no Instagram<Icon name="out" small /></a>
        </div>
      </div>
    </main>
  );
}
