"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../src/lib/supabaseClient";

export default function NewCatatanPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [waktuExp, setWaktuExp] = useState("");
  const [msg, setMsg] = useState("");

  function validEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  async function save() {
    setMsg("");
    if (!validEmail(email)) return setMsg("Format email tidak valid.");
    if (deskripsi.trim().length < 3) return setMsg("Deskripsi terlalu pendek.");

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return setMsg("Kamu belum login.");

    const expIso = waktuExp ? new Date(waktuExp).toISOString() : null;

    const { error } = await supabase.from("catatan").insert({
      user_id: userId,
      email,
      deskripsi,
      waktu_exp: expIso,
    });

    if (error) return setMsg(error.message);

    router.replace("/catatan");
  }

  return (
    <div style={{ maxWidth: 720, margin: "32px auto", padding: 16 }}>
      <h1>Tambah Catatan</h1>

      <label>Email</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", margin: "6px 0 12px", padding: 10 }}
      />

      <label>Deskripsi</label>
      <textarea
        value={deskripsi}
        onChange={(e) => setDeskripsi(e.target.value)}
        style={{ width: "100%", margin: "6px 0 12px", padding: 10, minHeight: 120 }}
      />

      <label>Waktu Exp (opsional)</label>
      <input
        type="datetime-local"
        value={waktuExp}
        onChange={(e) => setWaktuExp(e.target.value)}
        style={{ width: "100%", margin: "6px 0 12px", padding: 10 }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save}>Simpan</button>
        <button onClick={() => router.back()}>Batal</button>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
