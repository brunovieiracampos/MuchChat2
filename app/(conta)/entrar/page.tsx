import Link from "next/link";
import { redirect } from "next/navigation";
import { PRODUCT } from "@/config/site";
import { safeNext } from "@/lib/account";
import { getUser } from "@/lib/session";
import { SignInForm } from "../forms";

export const metadata = { title: `Entrar · ${PRODUCT.name}` };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  if (await getUser()) redirect(safeNext(next));
  return (
    <>
      <h1 className="pn-auth-title">Entrar</h1>
      {erro === "link"
        ? <p className="pn-auth-lead" style={{ color: "var(--amber)" }}>O link expirou ou já foi usado. Entre com sua senha ou peça um novo link.</p>
        : <p className="pn-auth-lead">Suas automações de comentário continuam de onde você parou.</p>}
      <SignInForm next={next} />
      <p className="pn-auth-alt">Ainda não tem conta? <Link href="/cadastro">Criar conta</Link></p>
    </>
  );
}
