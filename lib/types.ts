export const estados = ["pendiente", "leyendo", "leído"] as const;
export type Estado = (typeof estados)[number];
// Keep the unaccented spelling as an alias for the canonical leído filter.
export function normalizeEstadoFilter(value: string | null) {
  return value === "leido" ? "leído" : value || "";
}
export type Autor = { id: string; nombre: string };
export type Libro = {
  id: string;
  autor_id: string;
  autor: string;
  titulo: string;
  estado: Estado;
  valoracion: number | null;
  revision: number;
  creado_en: string;
  actualizado_en: string;
};
export type Resumen = {
  total: number;
  pendientes: number;
  leyendo: number;
  leidos: number;
  media: number | null;
  lecturas: Libro[];
  terminados: Libro[];
  proximos: Libro[];
};
export type Borrador = {
  titulo: string;
  autor_id: string;
  estado: Estado;
  valoracion: number | null;
};
