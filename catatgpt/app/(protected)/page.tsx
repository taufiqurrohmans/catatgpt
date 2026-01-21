"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabaseClient";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function check() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!mounted) return;

      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(pathname || "/catatan")}`);
        return;
      }

      setReady(true);
    }

    check();

    // kalau session berubah (logout/login), auto follow
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace(`/login?next=${encodeURIComponent(pathname || "/catatan")}`);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, pathname]);

  if (!ready) {
    return <div style={{ padding: 24, opacity: 0.8 }}>Mengecek sesi...</div>;
  }

  return <>{children}</>;
}
