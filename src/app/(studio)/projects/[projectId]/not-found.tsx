import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AsyncState } from "@/components/studio/product-primitives";

export default function ProjectNotFound() {
  return (
    <AsyncState
      status="empty"
      headingLevel={2}
      title="This book isn’t on your shelf"
      description="It may have been deleted, or the link points somewhere it shouldn’t."
      action={
        <Button render={<Link href="/studio" />} nativeButton={false}>
          Back to your books
        </Button>
      }
      className="min-h-[50vh]"
    />
  );
}
