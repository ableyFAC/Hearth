import { redirect } from "next/navigation";

// Home Profile was merged into the Home page (/dashboard). Keep this route as a
// redirect so old links / bookmarks still work.
export default function ProfilePage() {
  redirect("/dashboard#systems");
}
