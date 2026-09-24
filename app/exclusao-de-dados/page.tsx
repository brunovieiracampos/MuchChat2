import { SITE } from "@/config/site";

export const metadata = { title: `Exclusão de dados — ${SITE.account}` };

export default function Exclusao() {
  return (
    <main>
      <h1>Exclusão de dados</h1>
      <p>Para apagar os dados que este aplicativo guarda sobre você:</p>
      <ol>
        <li>Envie uma mensagem direta para {SITE.account} com o texto <strong>EXCLUIR MEUS DADOS</strong>, ou</li>
        <li>escreva para <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> informando seu usuário do Instagram.</li>
      </ol>
      <p>Apagamos os registros em até 30 dias e confirmamos pelo mesmo canal.</p>
      <hr />
      <h2 lang="en">Data deletion (English)</h2>
      <p lang="en">
        To delete your data, send a direct message to {SITE.account} saying &quot;DELETE MY DATA&quot; or email {SITE.contactEmail} with
        your Instagram username. We delete the records within 30 days and confirm through the same channel.
      </p>
    </main>
  );
}
