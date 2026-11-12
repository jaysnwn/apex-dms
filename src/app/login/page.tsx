import type { Metadata } from "next";
import { LoginScreen } from "./login-screen";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; expired?: string }>;
}) {
  const { next, error: err, expired } = await searchParams;
  const error = err ?? (expired ? "expired" : undefined);
  return <LoginScreen next={next} error={error} />;
}
