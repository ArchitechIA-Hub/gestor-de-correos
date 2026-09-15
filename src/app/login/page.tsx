import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        action={login}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-6"
      >
        <div>
          <h1 className="font-heading text-xl text-foreground">Bandeja Ejecutiva</h1>
          <p className="mt-1 text-sm text-muted-foreground">Inicia sesión con tu cuenta.</p>
        </div>

        <input type="hidden" name="from" value={from ?? "/inbox"} />

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-xs text-muted-foreground">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-xs text-muted-foreground">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {error === "2" && (
          <p className="text-xs text-urgent">Demasiados intentos. Espera unos minutos y vuelve a intentar.</p>
        )}
        {error && error !== "2" && (
          <p className="text-xs text-urgent">Correo o contraseña incorrectos. Intenta de nuevo.</p>
        )}

        <p className="text-xs text-muted-foreground">
          ¿Olvidaste tu contraseña? Contacta a quien te dio acceso a esta cuenta para que te ayude
          a restablecerla.
        </p>

        <button
          type="submit"
          className="h-9 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/80"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
