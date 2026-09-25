"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PASSWORD_MIN } from "@/lib/account";
import {
  forgotPasswordAction, resendConfirmationAction, resetPasswordAction, signInAction, signUpAction,
  type FormState,
} from "./actions";

function ErrorText({ state }: { state: FormState }) {
  return state.error ? <div className="pn-error-text" role="alert" style={{ marginTop: 0, fontSize: 12.5 }}>{state.error}</div> : null;
}

function Field({ id, label, ...input }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="pn-field-label" htmlFor={id}>{label}</label>
      <input id={id} name={id} className="pn-input" {...input} />
    </div>
  );
}

export function SignInForm({ next, email }: { next?: string; email?: string }) {
  const [state, action, pending] = useActionState(signInAction, {});
  const unconfirmed = state.error?.startsWith("Confirme seu e-mail");
  return (
    <>
      <form action={action} className="pn-auth-form">
        {next && <input type="hidden" name="next" value={next} />}
        <Field id="email" label="E-mail" type="email" autoComplete="email" required autoFocus defaultValue={state.values?.email ?? email} />
        <div>
          <div className="pn-auth-row">
            <label className="pn-field-label" htmlFor="password">Senha</label>
            <Link href="/esqueci-senha">Esqueci minha senha</Link>
          </div>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="pn-input" />
        </div>
        <ErrorText state={state} />
        <button type="submit" className="pn-btn is-primary" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      </form>
      {unconfirmed && <ResendForm email={state.values?.email} />}
    </>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, {});
  if (state.sent) return <CheckInbox email={state.sent} what="confirmar sua conta" />;
  return (
    <form action={action} className="pn-auth-form">
      <Field id="name" label="Nome" autoComplete="name" required autoFocus defaultValue={state.values?.name} />
      <Field id="email" label="E-mail" type="email" autoComplete="email" required defaultValue={state.values?.email} />
      <div>
        <Field id="password" label="Senha" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} />
        <div className="pn-help">Pelo menos {PASSWORD_MIN} caracteres.</div>
      </div>
      <label className="pn-auth-check">
        <input type="checkbox" name="terms" required />
        <span>Li e aceito a <a href="/privacidade" target="_blank" rel="noreferrer">política de privacidade</a>.</span>
      </label>
      <ErrorText state={state} />
      <button type="submit" className="pn-btn is-primary" disabled={pending}>{pending ? "Criando conta…" : "Criar conta"}</button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, {});
  if (state.sent) return <CheckInbox email={state.sent} what="criar uma senha nova" note="Se não houver conta com este e-mail, nenhuma mensagem é enviada." />;
  return (
    <form action={action} className="pn-auth-form">
      <Field id="email" label="E-mail da conta" type="email" autoComplete="email" required autoFocus defaultValue={state.values?.email} />
      <ErrorText state={state} />
      <button type="submit" className="pn-btn is-primary" disabled={pending}>{pending ? "Enviando…" : "Enviar link"}</button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  return (
    <form action={action} className="pn-auth-form">
      <div>
        <Field id="password" label="Nova senha" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} autoFocus />
        <div className="pn-help">Pelo menos {PASSWORD_MIN} caracteres.</div>
      </div>
      <Field id="confirm" label="Repita a nova senha" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} />
      <ErrorText state={state} />
      <button type="submit" className="pn-btn is-primary" disabled={pending}>{pending ? "Salvando…" : "Salvar senha e entrar"}</button>
    </form>
  );
}

function ResendForm({ email }: { email?: string }) {
  const [state, action, pending] = useActionState(resendConfirmationAction, {});
  if (state.sent) return <p className="pn-auth-alt">Enviamos um novo link para {state.sent}.</p>;
  return (
    <form action={action} style={{ marginTop: 12 }}>
      <input type="hidden" name="email" value={email ?? ""} />
      <button type="submit" className="pn-btn is-ghost" disabled={pending || !email} style={{ fontSize: 12.5 }}>
        {pending ? "Enviando…" : "Reenviar o e-mail de confirmação"}
      </button>
      <ErrorText state={state} />
    </form>
  );
}

function CheckInbox({ email, what, note }: { email: string; what: string; note?: string }) {
  return (
    <div className="pn-auth-sent" role="status">
      Enviamos um link para <b>{email}</b>. Abra o e-mail e toque no link para {what}.
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 8 }}>
        Não chegou? Confira o spam e as promoções. {note}
      </div>
    </div>
  );
}
