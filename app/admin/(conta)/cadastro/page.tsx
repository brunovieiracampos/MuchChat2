import Link from "next/link";
import { redirect } from "next/navigation";
import { PRODUCT } from "@/config/site";
import { getUser } from "@/lib/session";
import { SignUpForm } from "../forms";

export const metadata = { title: `Criar conta · ${PRODUCT.name}` };

export default async function Cadastro() {
  if (await getUser()) redirect("/admin");
  return (
    <>
      <h1 className="pn-auth-title">Criar conta</h1>
      <p className="pn-auth-lead">Quem comenta a palavra-chave no seu post recebe o material no direct, sem você responder um por um.</p>
      <SignUpForm />
      <p className="pn-auth-alt">Já tem conta? <Link href="/admin/entrar">Entrar</Link></p>
    </>
  );
}
