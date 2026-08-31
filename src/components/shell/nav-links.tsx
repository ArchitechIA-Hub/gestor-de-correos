"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const BASE_LINKS = [
  { href: "/inbox", label: "Bandeja" },
  { href: "/sent", label: "Enviados" },
  { href: "/digest", label: "Informe" },
  { href: "/audit", label: "Auditoría" },
  { href: "/settings/accounts", label: "Cuentas" },
  { href: "/settings/extras", label: "Extras" },
  { href: "/settings/general", label: "Preferencias" },
];

export function NavLinks({ rescueModeEnabled }: { rescueModeEnabled: boolean }) {
  const pathname = usePathname();
  const links = rescueModeEnabled
    ? [...BASE_LINKS.slice(0, 1), { href: "/rescue", label: "Prioridades" }, ...BASE_LINKS.slice(1)]
    : BASE_LINKS;

  return (
    <nav className="flex items-center gap-1">
      {links.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
