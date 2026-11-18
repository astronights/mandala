import type { Metadata } from "next";
import { safeNext } from "@/lib/admin/auth";
import styles from "./login.module.css";

export const metadata: Metadata = {
  title: "Mandala · Sign in",
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, string> = {
  wrong: "That passcode isn't right.",
  locked: "Too many attempts. Please wait 15 minutes and try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? MESSAGES[params.error] : undefined;
  const next = safeNext(params.next);

  return (
    <main className={styles.page}>
      <form className={styles.card} method="post" action="/api/admin/login">
        <h1 className={styles.title}>Mandala</h1>
        <p className={styles.subtitle}>Admin</p>
        <label className={styles.label} htmlFor="passcode">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          className={styles.input}
          autoComplete="current-password"
          required
          autoFocus
          aria-describedby={error ? "login-error" : undefined}
          aria-invalid={error ? true : undefined}
        />
        <input type="hidden" name="next" value={next} />
        <p id="login-error" className={styles.error} role="alert">
          {error ?? ""}
        </p>
        <button type="submit" className={styles.button}>
          Enter
        </button>
      </form>
    </main>
  );
}
