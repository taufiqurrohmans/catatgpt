"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../src/lib/supabaseClient";

type Mode = "LOGIN" | "REGISTER";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/catatan";

  const [mode, setMode] = useState<Mode>("LOGIN");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    // kalau user sudah login, jangan stay di /login
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace(next);
    });
    return () => {
      mounted = false;
    };
  }, [router, next]);

  function clean() {
    setErr("");
    setMsg("");
  }

  async function submit() {
    clean();

    const e = email.trim();
    if (!e) return setErr("Email wajib diisi.");
    if (!password || password.length < 6) return setErr("Password minimal 6 karakter.");

    setBusy(true);
    try {
      if (mode === "LOGIN") {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) {
          // kasus paling sering: email belum confirm
          if (String(error.message).toLowerCase().includes("not confirmed")) {
            setErr("Email belum dikonfirmasi. Cek email (Inbox/Spam) atau matikan email confirmation di Supabase untuk dev.");
          } else {
            setErr(error.message);
          }
          return;
        }
        router.replace(next);
        return;
      }

      // REGISTER
      const { error } = await supabase.auth.signUp({ email: e, password });
      if (error) {
        setErr(error.message);
        return;
      }

      // Kalau email confirmation ON → user perlu cek email
      setMsg("Daftar berhasil. Jika diminta konfirmasi email, silakan cek Inbox/Spam lalu login kembali.");
      setMode("LOGIN");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Catatgpt</h1>
      <p style={{ opacity: 0.8, lineHeight: 1.5 }}>
        {mode === "LOGIN" ? "Masuk untuk mengakses catatan kamu." : "Buat akun baru untuk mulai mencatat."}
      </p>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button
          type="button"
          onClick={() => { setMode("LOGIN"); clean(); }}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            background: mode === "LOGIN" ? "#1a1a1a" : "#0f0f0f",
            color: "#fff",
            flex: 1,
          }}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => { setMode("REGISTER"); clean(); }}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #333",
            background: mode === "REGISTER" ? "#1a1a1a" : "#0f0f0f",
            color: "#fff",
            flex: 1,
          }}
        >
          Daftar
        </button>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
          }}
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 6)"
          autoComplete={mode === "LOGIN" ? "current-password" : "new-password"}
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
          }}
        />

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          style={{ padding: "12px 14px", borderRadius: 10 }}
        >
          {busy ? "Memproses..." : mode === "LOGIN" ? "Login" : "Daftar"}
        </button>

        {err && <p style={{ color: "tomato", marginTop: 6 }}>Error: {err}</p>}
        {msg && <p style={{ color: "#9fd3ff", marginTop: 6 }}>{msg}</p>}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <Link href="/">Home</Link>
          {/* kalau nanti kamu bikin reset password, link-nya tinggal aktifkan */}
          {/* <Link href="/reset">Lupa password?</Link> */}
        </div>
      </div>
    </div>
  );
}
