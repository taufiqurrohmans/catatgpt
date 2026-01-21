"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../src/lib/supabaseClient";

type Status = "BELUM_TERJUAL" | "TERJUAL" | "EXPIRED" | "BATAL";

type TrashItem = {
  id: string;
  email: string;
  deskripsi: string;
  waktu_exp: string | null;
  status: Status;
  deleted_at: string | null;
};

function fmt(dt?: string | null) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("id-ID");
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;

  async function load() {
    setErr("");
    setLoading(true);

    const { data, error } = await supabase
      .from("catatan")
      .select("id,email,deskripsi,waktu_exp,status,deleted_at")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setItems([]);
    } else {
      setItems((data ?? []) as TrashItem[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const view = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((x) => {
      return (
        (x.email || "").toLowerCase().includes(qq) ||
        (x.deskripsi || "").toLowerCase().includes(qq)
      );
    });
  }, [items, q]);

  useEffect(() => {
    setPage(1);
  }, [q]);

  const total = view.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return view.slice(start, start + pageSize);
  }, [view, safePage]);

  async function restore(id: string) {
    setErr("");
    const { error } = await supabase.from("catatan").update({ deleted_at: null }).eq("id", id);
    if (error) setErr(error.message);
    else load();
  }

  async function restoreAll() {
    if (!confirm("Restore semua data di Trash?")) return;
    setErr("");

    // update semua yang deleted_at not null (milik user, dijaga RLS)
    const { error } = await supabase
      .from("catatan")
      .update({ deleted_at: null })
      .not("deleted_at", "is", null);

    if (error) setErr(error.message);
    else load();
  }

  async function hardDelete(id: string) {
    if (!confirm("Hapus permanen item ini? (tidak bisa dikembalikan)")) return;
    setErr("");

    const { error } = await supabase.from("catatan").delete().eq("id", id);
    if (error) setErr(error.message);
    else load();
  }

  async function emptyTrash() {
    if (!confirm("Kosongkan Trash? Semua item akan dihapus permanen.")) return;
    setErr("");

    const { error } = await supabase.from("catatan").delete().not("deleted_at", "is", null);
    if (error) setErr(error.message);
    else load();
  }

  return (
    <div style={{ maxWidth: 1100, margin: "28px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Trash</h1>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
            Total di Trash: <b>{items.length}</b> • Tampil (filter): <b>{total}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/catatan">Kembali</Link>
          <button onClick={load}>Refresh</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
        <input
          placeholder="Cari email / deskripsi di Trash"
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

        <button
          onClick={restoreAll}
          disabled={items.length === 0}
          style={{ padding: "10px 14px", borderRadius: 10 }}
        >
          Restore Semua
        </button>

        <button
          onClick={emptyTrash}
          disabled={items.length === 0}
          style={{ padding: "10px 14px", borderRadius: 10, color: "#ff8a8a" }}
        >
          Kosongkan Trash
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
              <th>Waktu Exp</th>
              <th>Status</th>
              <th>Dihapus Pada</th>
              <th style={{ width: 260 }}>Aksi</th>
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
                  <td>{x.waktu_exp ? new Date(x.waktu_exp).toISOString().slice(0, 10) : "-"}</td>
                  <td>{x.status}</td>
                  <td>{fmt(x.deleted_at)}</td>
                  <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => restore(x.id)}>Restore</button>
                    <button onClick={() => hardDelete(x.id)} style={{ color: "#ff8a8a" }}>
                      Hapus Permanen
                    </button>
                  </td>
                </tr>
              );
            })}

            {!loading && total === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 18, opacity: 0.8 }}>
                  Trash kosong.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
        Trash memakai <code>deleted_at</code>. Restore akan mengosongkan <code>deleted_at</code>. Hapus Permanen akan
        benar-benar menghapus row dari database.
      </p>
    </div>
  );
}
