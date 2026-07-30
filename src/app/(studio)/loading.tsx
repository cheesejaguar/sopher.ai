import { AsyncState } from "@/components/studio/product-primitives";

export default function StudioLoading() {
  return (
    <AsyncState
      status="loading"
      title="Opening the studio"
      description="Preparing your library and current production state."
      className="min-h-[50vh]"
    />
  );
}
