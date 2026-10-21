"use client";

import { useActionState } from "react";
import { signInAction, type FormState } from "./actions";

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
  return (
    <form action={action} className="pn-auth-form">
      {next && <input type="hidden" name="next" value={next} />}
      <Field id="email" label="E-mail" type="email" autoComplete="email" required autoFocus defaultValue={state.values?.email ?? email} />
      <div>
        <label className="pn-field-label" htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="pn-input" />
      </div>
      <ErrorText state={state} />
      <button type="submit" className="pn-btn is-primary" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
