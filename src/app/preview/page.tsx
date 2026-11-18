import type { Metadata } from "next";
import PreviewClient from "./PreviewClient";

export const metadata: Metadata = { title: "Mandala · Generator preview" };

export default function PreviewPage() {
  return <PreviewClient />;
}
