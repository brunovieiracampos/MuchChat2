import Link from "next/link";
import { PRODUCT } from "@/config/site";
import { ForgotPasswordForm } from "../forms";

export const metadata = { title: `Esqueci minha senha · ${PRODUCT.name}` };

export default function EsqueciSenha() {
  return (
    <>
      <h1 className="pn-auth-title">Esqueci minha senha</h1>
      <p className="pn-auth-lead">Informe o e-mail da conta. Enviamos um link para você criar uma senha nova.</p>
      <ForgotPasswordForm />
      <p className="pn-auth-alt"><Link href="/entrar">Voltar para Entrar</Link></p>
    </>
  );
}
