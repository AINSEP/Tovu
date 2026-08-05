import { useState } from "react";
import { api, type AdminUser } from "../lib/api";

export function Login(props: { onLogin: (user: AdminUser) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login({ username, password });
      props.onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>Tovu</h1>
        <p>Sign in to your workspace</p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <div className="login-error">{error}</div> : null}
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="login-hint">local dev default: admin / tovu-dev</p>
      </form>
    </div>
  );
}
