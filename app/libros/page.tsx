import { Suspense } from "react";
import { CollectionView } from "@/components/collection-view";
export const metadata = { title: "Tu colección" };
export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <h1>Tu colección</h1>
          <p>Cargando tu colección…</p>
        </main>
      }
    >
      <CollectionView />
    </Suspense>
  );
}
