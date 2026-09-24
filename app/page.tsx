import { SITE } from "@/config/site";

export default function Home() {
  return (
    <main>
      <h1>{SITE.name}</h1>
      <p>
        Ferramenta pessoal da conta {SITE.account} no Instagram. Quando alguém comenta uma palavra-chave em um post,
        respondemos o comentário e enviamos, por mensagem direta, o link do material complementar prometido no post.
      </p>
      <p><a href="/privacidade">Política de privacidade</a> · <a href="/exclusao-de-dados">Exclusão de dados</a></p>
    </main>
  );
}
