import { redirect } from "next/navigation";

// The daily experience comes next; for now the root shows the generator preview.
export default function Home() {
  redirect("/preview");
}
