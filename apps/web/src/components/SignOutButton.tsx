import { signOut } from "@/app/auth";
import { Button } from "@/components/ui/button";

export default function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="outline" size="sm">
        Sign out
      </Button>
    </form>
  );
}
