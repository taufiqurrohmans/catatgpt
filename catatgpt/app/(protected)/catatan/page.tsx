"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../src/lib/supabaseClient";

type Status = "BELUM_TERJUAL" | "TERJUAL" | "EXPIRED" | "BATAL";

type Catatan = {
  id: string;
  email: string;
  deskripsi: string;
  waktu_buat: string;
  waktu_exp: string | null;
  status: Status;
  deleted_at: string | null;
};

type CatatanView = Catatan & { uiStatus: Status };

function fmtID(dt?: string | null) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("id-ID");
}

function badgeStyle(status: Status): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.2,
  };
  if (status === "TERJUAL") return { ...base, background: "#143d25", color: "#7CFFB2" };
  if (status === "BELUM_TERJUAL") return { ...base, background: "#2a2a2a", color: "#fff" };
  if (status === "EXPIRED") return { ...base, background: "#3d2414", color: "#ffb27c" };
  return { ...base, background: "#3b1b1b", color: "#ff8a8a" }; // BATAL
}

export default function CatatanListPage() {
  const [items, setItems] = useState<Catatan[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [sortBy, setSortBy] = useState<"created_desc" | "created_asc" | "exp_asc" | "exp_desc">(
    "created_desc"
  );

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 8;

  async function load() {
    setErr("");
    setLoading(true);

    let query = supabase.from("catatan").select("*").is("deleted_at", null);

    if (sortBy === "created_desc") query = query.order("created_at", { ascending: false });
    if (sortBy === "created_asc") query = query.order("created_at", { ascending: true });
    if (sortBy === "exp_asc") query = query.order("waktu_exp", { ascending: true, nullsFirst: false });
    if (sortBy === "exp_desc") query = query.order("waktu_exp", { ascending: false, nullsFirst: false });

    const { data, error } = await query;

    if (error) {
      setErr(error.message);
      setItems([]);
    } else {
      setItems((data ?? []) as Catatan[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter]);

  const view: CatatanView[] = useMemo(() => {
    const now = new Date();
    const qq = q.trim().toLowerCase();

    return items
      .map((x) => {
        const exp = x.waktu_exp ? new Date(x.waktu_exp) : null;
        const uiStatus: Status = exp && exp < now && x.status === "BELUM_TERJUAL" ? "EXPIRED" : x.status;
        return { ...x, uiStatus };
      })
      .filter((x) => {
        const matchQ =
          qq.length === 0 ||
          (x.email || "").toLowerCase().includes(qq) ||
          (x.deskripsi || "").toLowerCase().includes(qq);

        const matchStatus = statusFilter === "ALL" ? true : x.uiStatus === statusFilter;
        return matchQ && matchStatus;
      });
  }, [items, q, statusFilter]);

  const totalFiltered = view.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return view.slice(start, start + pageSize);
  }, [view, safePage]);

  async function toggleTerjual(id: string, current: Status) {
    setErr("");
    const next: Status = current === "TERJUAL" ? "BELUM_TERJUAL" : "TERJUAL";

    const { data: currentRow, error: e1 } = await supabase
      .from("catatan")
      .select("status")
      .eq("id", id)
      .single();

    if (e1) return setErr(e1.message);

    const { error: e2 } = await supabase
      .from("catatan")
      .update({ status: next, status_updated_at: new Date().toISOString() })
      .eq("id", id);

    if (e2) return setErr(e2.message);

    // log status (butuh tabel status_log + policy insert)
    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user.id;
    if (userId) {
      const { error: e3 } = await supabase.from("status_log").insert({
        catatan_id: id,
        user_id: userId,
        status_lama: currentRow?.status ?? null,
        status_baru: next,
      });
      if (e3) setErr(e3.message);
    }

    load();
  }

  async function markExpired(id: string) {
    setErr("");
    const { error } = await supabase
      .from("catatan")
      .update({ status: "EXPIRED", status_updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) setErr(error.message);
    else load();
  }

  async function softDelete(id: string) {
    if (!confirm("Hapus catatan ini? (masuk Trash)")) return;

    const { error } = await supabase
      .from("catatan")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) setErr(error.message);
    else load();
  }

  function resetFilter() {
    setQ("");
    setStatusFilter("ALL");
    setSortBy("created_desc");
    setPage(1);
  }

  // === EXPORT CSV MULTI-KOLOM (EXCEL FRIENDLY) ===
  function exportCsv(rows: CatatanView[]) {
    const DELIM = ";"; // Excel (ID) biasanya pakai ;
    const header = ["No", "Email", "Deskripsi", "Waktu Buat", "Waktu Exp", "Status"];
    const esc = (v: any) => `"${String(v ?? "").replaceAll('"', '""')}"`;

    const lines = [
      "sep=;", // <— bikin Excel otomatis pecah kolom pakai ;
      header.map(esc).join(DELIM),
      ...rows.map((r, i) =>
        [
          esc(i + 1),
          esc(r.email),
          esc(r.deskripsi),
          esc(r.waktu_buat ? new Date(r.waktu_buat).toLocaleString("id-ID") : ""),
          // exp di-export sebagai tanggal saja biar mudah diedit/import lagi
          esc(r.waktu_exp ? new Date(r.waktu_exp).toISOString().slice(0, 10) : ""),
          esc(r.uiStatus ?? r.status),
        ].join(DELIM)
      ),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catatgpt_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  
async function logout() {
  // kalau TS kamu masih merah di confirm, pakai window.confirm
  if (!window.confirm("Logout sekarang?")) return;

  const { error } = await supabase.auth.signOut();
  if (error) {
    setErr(error.message);
    return;
  }

  // paling aman bersihin state client
  window.location.href = "/login";
}

  return (
    <div style={{ maxWidth: 1180, margin: "28px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Daftar Catatan</h1>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
            Total: <b>{items.length}</b> • Tampil (filter): <b>{totalFiltered}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/catatan/new">+ Tambah</Link>
          <Link href="/catatan/import">Import CSV</Link>
          <Link href="/trash">Trash</Link>
          <button type="button" onClick={logout}>
    Logout
  </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <input
          placeholder="Cari email / deskripsi"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            flex: 1,
            minWidth: 260,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
          }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
          }}
        >
          <option value="ALL">Semua status</option>
          <option value="BELUM_TERJUAL">Belum terjual</option>
          <option value="TERJUAL">Terjual</option>
          <option value="EXPIRED">Expired</option>
          <option value="BATAL">Batal</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #333",
            background: "#111",
            color: "#fff",
          }}
        >
          <option value="created_desc">Terbaru</option>
          <option value="created_asc">Terlama</option>
          <option value="exp_asc">Exp terdekat</option>
          <option value="exp_desc">Exp terjauh</option>
        </select>

        <button onClick={load} style={{ padding: "10px 14px", borderRadius: 10 }}>
          Refresh
        </button>
        <button onClick={resetFilter} style={{ padding: "10px 14px", borderRadius: 10 }}>
          Reset
        </button>

        <button onClick={() => exportCsv(view)} style={{ padding: "10px 14px", borderRadius: 10 }}>
          Export CSV
        </button>
      </div>

      {err && <p style={{ color: "tomato", marginTop: 12 }}>Error: {err}</p>}
      {loading && <p style={{ marginTop: 12, opacity: 0.8 }}>Memuat...</p>}

      <div style={{ marginTop: 14, overflowX: "auto", border: "1px solid #222", borderRadius: 12 }}>
        <table width="100%" cellPadding={12} style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", background: "#0f0f0f", borderBottom: "1px solid #222" }}>
              <th style={{ width: 60 }}>No</th>
              <th>Email</th>
              <th>Deskripsi</th>
              <th>Waktu Buat</th>
              <th>Waktu Exp</th>
              <th>Status</th>
              <th style={{ width: 340 }}>Aksi</th>
            </tr>
          </thead>

          <tbody>
            {pageItems.map((x, idx) => {
              const nomor = (safePage - 1) * pageSize + idx + 1;

              return (
                <tr key={x.id} style={{ borderBottom: "1px solid #1f1f1f" }}>
                  <td style={{ opacity: 0.85 }}>{nomor}</td>
                  <td>{x.email}</td>
                  <td
                    title={x.deskripsi}
                    style={{ maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {x.deskripsi}
                  </td>
                  <td>{fmtID(x.waktu_buat)}</td>
                  <td>{fmtID(x.waktu_exp)}</td>
                  <td>
                    <span style={badgeStyle(x.uiStatus)}>{x.uiStatus}</span>
                  </td>

                  <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => toggleTerjual(x.id, x.status)}>
                      {x.status === "TERJUAL" ? "Set Belum" : "Set Terjual"}
                    </button>

                    <Link href={`/catatan/${x.id}`}>Edit</Link>

                    {x.uiStatus === "EXPIRED" && x.status === "BELUM_TERJUAL" && (
                      <button onClick={() => markExpired(x.id)}>Set Expired</button>
                    )}

                    <button onClick={() => softDelete(x.id)} style={{ color: "#ff8a8a" }}>
                      Hapus
                    </button>
                  </td>
                </tr>
              );
            })}

            {!loading && totalFiltered === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 18, opacity: 0.8 }}>
                  Tidak ada data yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12 }}>
        <div style={{ opacity: 0.75, fontSize: 13 }}>
          Halaman <b>{safePage}</b> dari <b>{totalPages}</b>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button disabled={safePage <= 1} onClick={() => setPage(1)}>
            « Pertama
          </button>
          <button disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            ‹ Prev
          </button>
          <button disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next ›
          </button>
          <button disabled={safePage >= totalPages} onClick={() => setPage(totalPages)}>
            Terakhir »
          </button>
        </div>
      </div>

      <p style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
        Export CSV dibuat agar Excel memecah kolom (pakai <code>sep=;</code> + delimiter <code>;</code>). Kolom Exp
        diekspor sebagai <code>YYYY-MM-DD</code> supaya enak diedit & import lagi.
      </p>
    </div>
  );
}
