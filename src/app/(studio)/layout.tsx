import { StudioNav } from "@/components/studio/studio-nav";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <StudioNav />
      {/* id + tabIndex are the skip link's target (rendered once in the root layout). */}
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
