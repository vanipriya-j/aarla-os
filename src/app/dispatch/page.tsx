import { redirect } from "next/navigation";

/** Dispatch Orders was replaced by Fulfil Orders. */
export default function DispatchRedirectPage() {
  redirect("/fulfil");
}
