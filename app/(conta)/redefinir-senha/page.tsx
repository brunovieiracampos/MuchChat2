import Link from "next/link";
import { PRODUCT } from "@/config/site";
import { getUser } from "@/lib/session";
import { ResetPasswordForm } from "../forms";

export const metadata = { title: `Nova senha · ${PRODUCT.name}` };

/** Aberta pelo link do e-mail de redefinição: o link já inicia a sessão (ver /auth/confirmar). */
export default async function RedefinirSenha() {
  const user = await getUser();
  if (!user) {
    return (
      <>
        <h1 className="pn-auth-title">Link expirado</h1>
        <p className="pn-auth-lead">O link de redefinição vale por pouco tempo e só pode ser usado uma vez. Peça um novo.</p>
        <p className="pn-auth-alt"><Link href="/esqueci-senha" className="pn-btn is-primary" style={{ color: "#fff" }}>Pedir novo link</Link></p>
      </>
    );
  }
  return (
    <>
      <h1 className="pn-auth-title">Criar senha nova</h1>
      <p className="pn-auth-lead">Para a conta {user.email}.</p>
      <ResetPasswordForm />
    </>
  );
}
