"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <label className="pn-field-label" htmlFor="password" style={{ marginBottom: 0 }}>Senha</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus
        className={`pn-input${state.error ? " is-error" : ""}`} />
      {state.error && <div className="pn-error-text" role="alert" style={{ marginTop: 0 }}>{state.error}</div>}
      <button type="submit" className="pn-btn is-primary" disabled={pending} style={{ marginTop: 4 }}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
