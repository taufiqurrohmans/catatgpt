"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../../src/lib/supabaseClient";

type Status = "BELUM_TERJUAL" | "TERJUAL" | "EXPIRED" | "BATAL";

type ImportRow = {
  email: string;
  deskripsi: string;
  waktu_exp?: string | null; // ISO (akhir hari)
  status?: Status | null;
};

const ALLOWED_STATUS: Status[] = ["BELUM_TERJUAL", "TERJUAL", "EXPIRED", "BATAL"];

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * waktu_exp: format tanggal saja YYYY-MM-DD
 * disimpan sebagai akhir hari: 23:59:59.999 (lokal)
 */
function parseExpDateToISO(v?: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  let yyyy: number, mm: number, dd: number;

  // 1) YYYY-MM-DD
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    yyyy = Number(m[1]);
    mm = Number(m[2]);
    dd = Number(m[3]);
  } else {
    // 2) DD/MM/YYYY
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (m) {
      dd = Number(m[1]);
      mm = Number(m[2]);
      yyyy = Number(m[3]);
    } else {
      // 3) DD-MM-YYYY
      m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
      if (!m) return null;
      dd = Number(m[1]);
      mm = Number(m[2]);
      yyyy = Number(m[3]);
    }
  }

  // set ke akhir hari lokal
  const d = new Date(yyyy, mm - 1, dd, 23, 59, 59, 999);
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString();
}

// Parser CSV: support sep=; + auto delimiter ; atau ,
function parseCSV(text: string): string[][] {
  // buang BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? "";
  let delimiter = ",";

  if (/^sep\s*=\s*;$/i.test(firstLine)) {
    delimiter = ";";
    text = text.split(/\r?\n/).slice(1).join("\n");
  } else {
    const headerLine = firstLine;
    const semis = (headerLine.match(/;/g) || []).length;
    const commas = (headerLine.match(/,/g) || []).length;
    delimiter = semis > commas ? ";" : ",";
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(cur);
      cur = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.length > 1 || row[0].trim() !== "") rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  if (row.length > 1 || row[0].trim() !== "") rows.push(row);

  return rows;
}

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function downloadTemplate() {
  const content =
    "sep=;\n" +
    "email;deskripsi;waktu_exp;status\n" +
    'user1@gmail.com;"Produk A, warna merah";2026-02-01;BELUM_TERJUAL\n' +
    "user2@gmail.com;Produk B;2026-01-30;TERJUAL\n" +
    "user3@gmail.com;Produk C;;BELUM_TERJUAL\n";

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_import_catatgpt.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImportCatatanPage() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

  const preview = useMemo(() => rows.slice(0, 20), [rows]);

  async function onPickFile(file: File | null) {
    setInfo("");
    setErrors([]);
    setRows([]);

    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrors(["File harus .csv"]);
      return;
    }

    const text = await file.text();
    const grid = parseCSV(text);

    if (grid.length < 2) {
      setErrors(["CSV kosong atau hanya header."]);
      return;
    }

    const header = grid[0].map(normalizeHeader);
    const idx = (name: string) => header.indexOf(name);

    const emailIdx = idx("email");
    const desIdx = idx("deskripsi");
    const expIdx = idx("waktu_exp");
    const statusIdx = idx("status");

    if (emailIdx === -1 || desIdx === -1) {
      setErrors([
        "Header wajib: email, deskripsi",
        "Header opsional: waktu_exp (YYYY-MM-DD), status",
      ]);
      return;
    }

    const parsed: ImportRow[] = [];
    const errs: string[] = [];

    for (let r = 1; r < grid.length; r++) {
      const line = grid[r];

      const email = (line[emailIdx] ?? "").trim();
      const deskripsi = (line[desIdx] ?? "").trim();
      const waktu_exp_raw = expIdx >= 0 ? (line[expIdx] ?? "").trim() : "";
      const status_raw = statusIdx >= 0 ? (line[statusIdx] ?? "").trim() : "";

      if (!email || !deskripsi) {
        errs.push(`Baris ${r + 1}: email/deskripsi wajib diisi.`);
        continue;
      }
      if (!isValidEmail(email)) {
        errs.push(`Baris ${r + 1}: email tidak valid (${email}).`);
        continue;
      }

      let status: Status | null = null;
      if (status_raw) {
        const s = status_raw.toUpperCase() as Status;
        if (!ALLOWED_STATUS.includes(s)) {
          errs.push(`Baris ${r + 1}: status tidak valid (${status_raw}).`);
          continue;
        }
        status = s;
      }

      const waktu_exp = waktu_exp_raw ? parseExpDateToISO(waktu_exp_raw) : null;
      if (waktu_exp_raw && !waktu_exp) {
        errs.push(`Baris ${r + 1}: waktu_exp harus YYYY-MM-DD (contoh 2026-02-01).`);
        continue;
      }

      parsed.push({
        email,
        deskripsi,
        waktu_exp,
        status: status ?? null,
      });
    }

    setRows(parsed);
    setErrors(errs);

    if (errs.length === 0) setInfo(`Siap impor: ${parsed.length} baris.`);
    else setInfo(`Ada error. Perbaiki CSV dulu. (Valid: ${parsed.length} baris)`);
  }

  async function doImport() {
    setInfo("");
    setErrors([]);

    if (rows.length === 0) {
      setErrors(["Tidak ada data untuk diimpor."]);
      return;
    }

    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user.id;
      if (!userId) {
        setErrors(["Kamu belum login."]);
        return;
      }

      // waktu_buat otomatis: JANGAN kirim waktu_buat, biar default now() dari DB
      const payload = rows.map((r) => ({
        user_id: userId,
        email: r.email,
        deskripsi: r.deskripsi,
        waktu_exp: r.waktu_exp ?? null,
        status: (r.status ?? "BELUM_TERJUAL") as Status,
      }));

      // chunk insert biar aman
      const CHUNK = 200;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const chunk = payload.slice(i, i + CHUNK);
        const { error } = await supabase.from("catatan").insert(chunk);
        if (error) throw new Error(error.message);
      }

      setInfo(`Berhasil impor ${payload.length} baris.`);
      setRows([]);
    } catch (e: any) {
      setErrors([String(e?.message ?? e)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "28px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Import Catatan (CSV)</h1>
        <Link href="/catatan">Kembali</Link>
      </div>

      <div style={{ marginTop: 10, opacity: 0.9, fontSize: 13, lineHeight: 1.6 }}>
        <div><b>Header wajib:</b> <code>email</code>, <code>deskripsi</code></div>
        <div><b>Opsional:</b> <code>waktu_exp</code> (tanggal saja <code>YYYY-MM-DD</code>), <code>status</code></div>
        <div><b>waktu_buat</b> otomatis saat impor (default DB <code>now()</code>).</div>
        <div style={{ marginTop: 8 }}>
          <button onClick={downloadTemplate} style={{ padding: "8px 12px", borderRadius: 10 }}>
            Download Template CSV
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={doImport}
          disabled={busy || rows.length === 0 || errors.length > 0}
          style={{ padding: "10px 14px", borderRadius: 10 }}
        >
          {busy ? "Mengimpor..." : "Import ke Database"}
        </button>
      </div>

      {info && <p style={{ marginTop: 12, color: "#9fd3ff" }}>{info}</p>}

      {errors.length > 0 && (
        <div style={{ marginTop: 12, border: "1px solid #ff6b6b", borderRadius: 12, padding: 12 }}>
          <b style={{ color: "#ff8a8a" }}>Error:</b>
          <ul style={{ marginTop: 8 }}>
            {errors.map((e, i) => (
              <li key={i} style={{ color: "#ffb3b3" }}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 14, border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: 12, background: "#0f0f0f", borderBottom: "1px solid #222" }}>
          Preview (maks 20 baris) — valid: <b>{rows.length}</b>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table width="100%" cellPadding={10} style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #222" }}>
                <th style={{ width: 60 }}>No</th>
                <th>Email</th>
                <th>Deskripsi</th>
                <th>Waktu Exp (YYYY-MM-DD)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #1f1f1f" }}>
                  <td>{i + 1}</td>
                  <td>{r.email}</td>
                  <td style={{ maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.deskripsi}
                  </td>
                  <td>{r.waktu_exp ? new Date(r.waktu_exp).toISOString().slice(0, 10) : "-"}</td>
                  <td>{r.status ?? "BELUM_TERJUAL"}</td>
                </tr>
              ))}
              {preview.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 14, opacity: 0.8 }}>
                    Belum ada preview. Pilih file CSV dulu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
        Import mendukung CSV dari Excel: pakai <code>sep=;</code> dan delimiter <code>;</code> (atau otomatis deteksi <code>,</code>/<code>;</code>).
      </p>
    </div>
  );
}
