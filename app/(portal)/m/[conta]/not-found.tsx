import Link from "next/link";

export default function PortalNaoEncontrado() {
  return (
    <main className="pt-wrap">
      <h1 className="pt-title">Portal não encontrado</h1>
      <p className="pt-desc">Esse endereço não existe ou mudou. Confira o link que você recebeu.</p>
      <p style={{ marginTop: 20 }}><Link href="/">Ir para a página inicial</Link></p>
    </main>
  );
}
