"use client";
import { useState } from "react";
import {
  Eye,
  EyeOff,
  ArrowRight,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
export function LoginForm({
  admin,
  ready,
}: {
  admin: boolean;
  ready: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="login-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              password: form.get("password"),
              role: admin ? "admin" : "family",
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          window.location.assign(admin ? "/admin" : "/");
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Couldn’t connect. Please try again.",
          );
          setBusy(false);
        }
      }}
    >
      <label htmlFor="password">
        {admin ? "Organizer password" : "Family password"}
      </label>
      <div className="password-field">
        <LockKeyhole size={20} />
        <input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          required
          maxLength={256}
          placeholder="Enter our shared password"
          aria-describedby="password-help"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      <p id="password-help" className="muted">
        Need the password? Ask the camp organizer.
      </p>
      {!ready && (
        <p className="notice" role="status">
          Our camp site is getting ready. Please come back soon.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="button primary full" disabled={busy || !ready}>
        {busy ? (
          <>
            <LoaderCircle className="spin" size={19} /> Signing in…
          </>
        ) : (
          <>
            Come on in <ArrowRight size={19} />
          </>
        )}
      </button>
      <p className="privacy-note">
        <LockKeyhole size={14} /> A private space, just for family & friends.
      </p>
    </form>
  );
}
