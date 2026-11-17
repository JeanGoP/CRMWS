import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CambiarClave } from "@/components/cuenta/cambiar-clave";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CuentaPage() {
  const sesion = await getAuth().api.getSession({ headers: await headers() });
  if (!sesion) redirect("/login");

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b px-4 py-3 sm:px-6 sm:py-4">
        <h1 className="text-[17px] font-bold tracking-tight">Mi cuenta</h1>
        <p className="mt-1 break-all text-sm text-muted-foreground">{sesion.user.email}</p>
      </header>
      <div className="max-w-xl p-4 sm:p-6">
        <CambiarClave />
      </div>
    </div>
  );
}
