import { Spinner } from "@/components/ui/spinner";

export default function StudioLoading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Spinner className="size-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Opening the studio…</p>
    </div>
  );
}
