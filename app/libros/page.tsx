import { Suspense } from "react";
import { CollectionView } from "@/components/collection-view";
// Constructor: server-rendered website settings
import constructorWebsiteSettings from "../../public/constructor-settings.json";
type constructorWebsiteSettingsMetadataValue<T> = Omit<NonNullable<T>, 'title' | 'description'> & { title: string; description: string };
function constructorWebsiteSettingsMetadata<T extends object | null | undefined>(value: PromiseLike<T>): Promise<constructorWebsiteSettingsMetadataValue<T>>;
function constructorWebsiteSettingsMetadata<T extends object | null | undefined>(value: T): constructorWebsiteSettingsMetadataValue<T>;
function constructorWebsiteSettingsMetadata(value: object | null | undefined | PromiseLike<object>): object | Promise<object> {
  if (value && 'then' in value && typeof value.then === 'function') return Promise.resolve(value).then(original => constructorWebsiteSettingsMetadata(original));
  return { ...value, title: constructorWebsiteSettings.title, description: constructorWebsiteSettings.description };
}


export const metadata = constructorWebsiteSettingsMetadata(({ title: "Tu colección" }));
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
