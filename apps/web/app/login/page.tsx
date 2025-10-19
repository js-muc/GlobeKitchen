// ✅ LOGIN_PAGE — apps/web/app/login/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { login, me, parseError, setAuthToken, getAuthToken } from "@/lib/api";
import { useRouter } from "next/navigation";

// ✅ Schema (same logic, stricter UX)
const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(3, "Password is too short"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();

  // form
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "admin@example.com", password: "admin123" },
  });

  // ui
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [checking, setChecking] = useState(true);

  // If already authenticated, go straight to dashboard (preserves original behavior + better UX)
  useEffect(() => {
    (async () => {
      try {
        await me();
        router.replace("/dashboard");
      } catch {
        // not logged in → stay on page
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);

  const onSubmit = async (values: FormData) => {
    setServerError(null);
    try {
      const res = await login(values.email, values.password); // server sets cookie and/or returns JWT

      // ✅ Belt & braces: persist token if present (helps cross-origin calls like 127.0.0.1:4100)
      if ((res as any)?.token) {
        setAuthToken((res as any).token);
      }

      // Optional guard: if no token after login, the backend might be cookie-only.
      // Same-origin calls will work; cross-origin calls (e.g., 4100) need Bearer.
      // We'll still proceed, but you can surface a hint if desired:
      if (!getAuthToken()) {
        // Non-blocking hint; keep original flow
        // setServerError("Logged in without a token. Cross-origin API calls may require NEXT_PUBLIC_MENU_API=http://localhost:4000/api in dev.");
      }

      await me(); // sanity check; also warms cache
      router.push("/dashboard");
    } catch (e: any) {
      setServerError(parseError(e, "Login failed"));
    }
  };

  // Keep layout & styling, but harden accessibility and disabled states
  return (
    <main className="min-h-screen grid place-items-center px-4 py-10 sm:px-6 lg:px-8">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm sm:max-w-md space-y-4 rounded-2xl border bg-white p-6 shadow-card"
        aria-labelledby="loginTitle"
        aria-busy={isSubmitting || checking}
        noValidate
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 grid place-items-center rounded-2xl bg-brand/10">
            <span className="text-brand text-xl leading-none">🍲</span>
          </div>
          <div>
            <p id="loginTitle" className="font-semibold leading-5">
              Globe Organic Kitchen
            </p>
            <p className="text-xs text-gray-500 -mt-0.5">Admin Sign In</p>
          </div>
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-brand/60"
            aria-invalid={!!errors.email || undefined}
            disabled={isSubmitting || checking}
            {...register("email")}
            required
          />
          {errors.email && (
            <p className="text-rose-600 text-sm mt-1">{errors.email.message}</p>
          )}
        </div>

        {/* Password (+ show/hide) */}
        <div>
          <label htmlFor="password" className="block text-sm mb-1">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              className="w-full rounded-xl border px-3 py-2 pr-16 outline-none focus:ring-2 focus:ring-brand/60"
              aria-invalid={!!errors.password || undefined}
              disabled={isSubmitting || checking}
              {...register("password")}
              required
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg border px-2 py-1 text-xs"
              aria-label={showPw ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          {errors.password && (
            <p className="text-rose-600 text-sm mt-1">{errors.password.message}</p>
          )}
        </div>

        {/* Server error */}
        {serverError && (
          <p className="text-rose-600 text-sm" role="alert">
            {serverError}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || checking}
          className="w-full rounded-xl bg-brand px-4 py-2 font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {isSubmitting ? "Signing in..." : checking ? "Checking session…" : "Sign in"}
        </button>

        <p className="text-xs text-gray-500 text-center">
          Use your admin credentials. Cookies must be enabled.
        </p>
      </form>
    </main>
  );
}
