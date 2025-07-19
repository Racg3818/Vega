import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const verificar = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/login";
      } else {
        setUsuario(data.user);
        setCarregando(false);
      }
    };
    verificar();
  }, []);

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-900 text-white">
        <p>Carregando...</p>
      </div>
    );
  }

  return <>{children}</>;
}
