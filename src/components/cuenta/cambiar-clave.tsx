"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

export function CambiarClave() {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [guardada, setGuardada] = useState(false);

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    setError("");
    setGuardada(false);

    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);
    const actual = String(datos.get("actual") ?? "");
    const nueva = String(datos.get("nueva") ?? "");
    if (nueva !== datos.get("confirmacion")) {
      setError("La confirmación debe coincidir con la contraseña nueva.");
      return;
    }
    if (nueva === actual) {
      setError("Elige una contraseña distinta de la actual.");
      return;
    }

    setGuardando(true);
    try {
      const respuesta = await authClient.changePassword({
        currentPassword: actual,
        newPassword: nueva,
        revokeOtherSessions: true,
      });
      if (respuesta.error) {
        setError(mensajeDeError(respuesta.error));
        return;
      }
      formulario.reset();
      setGuardada(true);
    } catch {
      setError("No se pudo confirmar el cambio. Comprueba tu conexión e inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiar contraseña</CardTitle>
        <CardDescription>Al guardar, se cerrarán las sesiones de esta cuenta en otros dispositivos.</CardDescription>
      </CardHeader>
      <CardContent>
        <form method="post" onSubmit={guardar} className="space-y-4">
          <fieldset disabled={guardando} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cuenta-clave-actual">Contraseña actual</Label>
              <Input id="cuenta-clave-actual" name="actual" type="password" autoComplete="current-password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cuenta-clave-nueva">Nueva contraseña</Label>
              <Input id="cuenta-clave-nueva" name="nueva" type="password" autoComplete="new-password"
                minLength={8} maxLength={128} aria-describedby="cuenta-clave-requisito" required />
              <p id="cuenta-clave-requisito" className="text-xs text-muted-foreground">Entre 8 y 128 caracteres.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cuenta-clave-confirmacion">Confirma la nueva contraseña</Label>
              <Input id="cuenta-clave-confirmacion" name="confirmacion" type="password"
                autoComplete="new-password" required />
            </div>
            <Button type="submit">{guardando ? "Guardando…" : "Guardar contraseña"}</Button>
          </fieldset>
          {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
          {guardada && <p role="status" className="text-sm text-success-text">Contraseña actualizada.</p>}
        </form>
      </CardContent>
    </Card>
  );
}

function mensajeDeError(error: { code?: string; status?: number }) {
  if (error.status === 429) return "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.";
  if (error.status === 401 || error.code === "SESSION_EXPIRED") return "Tu sesión venció. Vuelve a iniciar sesión.";
  if (error.code === "INVALID_PASSWORD") return "La contraseña actual es incorrecta.";
  return "No se pudo cambiar la contraseña. Inténtalo de nuevo.";
}
