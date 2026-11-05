"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { branding } from "@/lib/branding";
export function Header() {
  const path = usePathname();
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <Link
          href="/"
          className="wordmark"
          aria-label={`${branding.logoText}, resumen`}
        >
          <Image
            data-brand-logo
            src={branding.logoImageUrl || "/brand-mark.svg"}
            alt=""
            width={36}
            height={36}
            unoptimized
          />
          {branding.logoText}
        </Link>
        <nav aria-label="Navegación principal" className="desktop-nav">
          <Link href="/" aria-current={path === "/" ? "page" : undefined}>
            Resumen
          </Link>
          <Link
            href="/libros"
            aria-current={path === "/libros" ? "page" : undefined}
          >
            Mis libros
          </Link>
        </nav>
      </div>
    </header>
  );
}
export function Footer() {
  const collection = usePathname() === "/libros";
  return (
    <footer className="page-footer">
      <p>Biblioteca ficticia con lecturas de ejemplo.</p>
      {collection ? <Link href="/" className="text-link">Volver al resumen</Link> : <span>Un cuaderno para tus lecturas.</span>}
    </footer>
  );
}
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link className="text-link" href={href}>
      {children}
      <ArrowUpRight size={17} />
    </Link>
  );
}
