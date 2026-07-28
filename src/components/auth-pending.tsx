import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthPending() {
  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle className="font-display">Accounts open shortly</CardTitle>
        <CardDescription>
          Sign-in is being provisioned. Until then, the studio is open to explore.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/studio" className="text-primary underline underline-offset-4">
          Go to the studio
        </Link>
      </CardContent>
    </Card>
  );
}
