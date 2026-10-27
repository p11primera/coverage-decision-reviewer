// WHY this is a client component: it POSTs the fake-login form and navigates after the
// cookie is set — browser form handling + router. WHY the boundary sits here: the /login
// page itself is a Server Component (it can even redirect already-authenticated visitors
// server-side); only the input/button island needs hydration.

"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `login failed (${res.status})`);
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-label="Reviewer sign in" className="w-full max-w-sm">
      <label className="block text-sm text-slate-800">
        <span className="font-medium">Reviewer name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          pattern="[A-Za-z0-9][A-Za-z0-9 ._-]{0,31}"
          title="Letters, digits, spaces, dot, underscore, dash (max 32 chars)"
          placeholder="Dr. Dana Reviewer"
          className="mt-1 w-full rounded border border-slate-400 bg-white p-2 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error ? (
        <p role="alert" className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}
    </form>
  );
}
