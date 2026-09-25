import { redirect } from "next/navigation";
import { PRODUCT } from "@/config/site";
import { getUser, isOwner } from "@/lib/session";
import { signOutAction } from "../actions";

export const metadata = { title: `Conta criada · ${PRODUCT.name}` };

/** Enquanto o painel não separa os dados por conta, só os donos entram; os demais esperam aqui. */
export default async function Aguardando() {
  const user = await getUser();
  if (!user) redirect("/entrar");
  if (isOwner(user.email)) redirect("/painel");
  return (
    <>
      <h1 className="pn-auth-title">Sua conta está criada, {user.name}</h1>
      <p className="pn-auth-lead">
        O {PRODUCT.name} está em teste fechado. Quando o seu acesso for liberado, você vai conectar o Instagram e criar a primeira automação por aqui.
        Avisamos em {user.email}.
      </p>
      <form action={signOutAction} style={{ marginTop: 22 }}>
        <button type="submit" className="pn-btn">Sair</button>
      </form>
    </>
  );
}
