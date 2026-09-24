import { SITE } from "@/config/site";

export const metadata = { title: `Política de privacidade — ${SITE.account}` };

export default function Privacidade() {
  return (
    <main>
      <h1>Política de privacidade</h1>
      <p><em>Atualizada em {SITE.updatedAt}</em></p>
      <p>
        Este aplicativo é usado apenas pela conta {SITE.account} no Instagram para responder comentários em seus próprios
        posts e enviar ao autor do comentário, por mensagem direta, o link do conteúdo que ele pediu.
      </p>
      <h2>Dados que tratamos</h2>
      <ul>
        <li>ID e texto do comentário, ID do post e nome de usuário de quem comentou (recebidos da API da Meta).</li>
        <li>Registro de que a resposta e a mensagem foram enviadas, para não enviar em duplicidade.</li>
      </ul>
      <h2>Para que usamos</h2>
      <p>
        Somente para identificar comentários com a palavra-chave e enviar uma única mensagem com o link do material.
        Não vendemos, compartilhamos nem usamos esses dados para publicidade ou perfilamento.
      </p>
      <h2>Por quanto tempo guardamos</h2>
      <p>Os registros ficam guardados por até 90 dias e depois são apagados.</p>
      <h2>Seus direitos</h2>
      <p>
        Você pode pedir a exclusão dos seus dados a qualquer momento. Veja <a href="/exclusao-de-dados">como pedir a exclusão</a> ou
        escreva para {SITE.contactEmail}.
      </p>
      <hr />
      <h2 lang="en">Privacy policy (English)</h2>
      <p lang="en">
        This app is used only by the Instagram account {SITE.account} to reply to comments on its own posts and to send the
        commenter a single private message with the link they asked for. We process the comment ID and text, the post ID
        and the commenter&apos;s username, and keep a record of what was sent to avoid duplicates, for up to 90 days. We do
        not sell or share this data. To request deletion, see <a href="/exclusao-de-dados">data deletion</a> or email {SITE.contactEmail}.
      </p>
    </main>
  );
}
