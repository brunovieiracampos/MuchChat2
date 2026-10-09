import { Icon } from "@/app/_portal/parts";

export default function PortalNaoEncontrado() {
  return (
    <main className="dia-l-notice">
      <div className="dia-l-404 dia-dots" aria-hidden="true"><span>4<i>0</i>4</span></div>
      <div className="dia-notice dia-grain">
        <div className="dia-notice__code"><span className="dia-dot is-calm" aria-hidden="true" /><span className="dia-label">Endereço não encontrado</span></div>
        <h1 className="dia-notice__title">Portal não encontrado</h1>
        <p className="dia-notice__text">O link pode estar incompleto ou ter sido digitado com algum erro. Confira se ele veio inteiro do direct.</p>
        <div className="dia-notice__actions">
          <a className="dia-btn dia-btn--primary" href="https://www.instagram.com/">Voltar para o Instagram<Icon name="out" small /></a>
        </div>
      </div>
    </main>
  );
}
