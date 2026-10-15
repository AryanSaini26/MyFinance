"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
import { HomeFrame } from "./site";
export default function AuthForm({ register = false }: { register?: boolean }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <HomeFrame>
      <section className="relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="pt-32 pb-12 md:pt-40 md:pb-20">
            <div className="max-w-3xl mx-auto text-center pb-12 md:pb-20">
              <h1 className="h1">Welcome! Join MyFinance Today</h1>
            </div>
            <div className="max-w-sm mx-auto">
              <div className="flex flex-wrap -mx-3">
                <div className="w-full px-3">
                  <button
                    type="button"
                    onClick={() =>
                      setError(
                        "Google sign-in is not configured. Use your email and password.",
                      )
                    }
                    className="btn px-0 text-white bg-red-600 hover:bg-red-700 w-full relative flex items-center"
                  >
                    <svg
                      className="w-4 h-4 fill-current text-white opacity-75 shrink-0 mx-4"
                      viewBox="0 0 16 16"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path d="M7.9 7v2.4H12c-.2 1-1.2 3-4 3-2.4 0-4.3-2-4.3-4.4 0-2.4 2-4.4 4.3-4.4 1.4 0 2.3.6 2.8 1.1l1.9-1.8C11.5 1.7 9.9 1 8 1 4.1 1 1 4.1 1 8s3.1 7 7 7c4 0 6.7-2.8 6.7-6.8 0-.5 0-.8-.1-1.2H7.9z" />
                    </svg>
                    <span
                      className="h-6 flex items-center border-r border-white border-opacity-25 mr-4"
                      aria-hidden="true"
                    />
                    <span className="flex-auto pl-16 pr-8 -ml-16">
                      {register ? "Sign up" : "Sign in"} with Google
                    </span>
                  </button>
                </div>
              </div>
              <div className="flex items-center my-6">
                <div
                  className="border-t border-gray-700 border-dotted grow mr-3"
                  aria-hidden="true"
                />
                <div className="text-gray-400">
                  Or, {register ? "register" : "sign in"} with your email
                </div>
                <div
                  className="border-t border-gray-700 border-dotted grow ml-3"
                  aria-hidden="true"
                />
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError("");
                  setBusy(true);
                  try {
                    await api(
                      "auth/" + (register ? "register" : "login"),
                      "POST",
                      { email, password },
                    );
                    setPassword("");
                    router.replace("/dashboard");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="flex flex-wrap -mx-3 mb-4">
                  <div className="w-full px-3">
                    <label
                      className="block text-gray-300 text-sm font-medium mb-1"
                      htmlFor="email"
                    >
                      Email{" "}
                      {register && <span className="text-red-600">*</span>}
                    </label>
                    <input
                      id="email"
                      aria-label="Email"
                      type="email"
                      autoComplete="email"
                      className="form-input w-full text-gray-300"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      maxLength={254}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap -mx-3 mb-4">
                  <div className="w-full px-3">
                    <label
                      className="block text-gray-300 text-sm font-medium mb-1"
                      htmlFor="password"
                    >
                      Password{" "}
                      {register && <span className="text-red-600">*</span>}
                    </label>
                    <input
                      id="password"
                      aria-label="Password"
                      type="password"
                      autoComplete={
                        register ? "new-password" : "current-password"
                      }
                      className="form-input w-full text-gray-300"
                      placeholder="Password (12–128 characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={12}
                      maxLength={128}
                      required
                    />
                  </div>
                </div>
                {!register && (
                  <div className="flex flex-wrap -mx-3 mb-4">
                    <div className="w-full px-3">
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">
                          Session lasts up to 7 days
                        </span>
                        <Link
                          href="/reset-password"
                          className="text-purple-600 hover:text-gray-200 transition duration-150 ease-in-out"
                        >
                          Forgot Password?
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-red-500 text-sm mb-4">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap -mx-3 mt-6">
                  <div className="w-full px-3">
                    <button
                      disabled={busy}
                      className="btn text-white bg-purple-600 hover:bg-purple-700 w-full"
                    >
                      {busy ? "Please wait…" : register ? "Sign up" : "Sign in"}
                    </button>
                  </div>
                </div>
              </form>
              <div className="text-gray-400 text-center mt-6">
                {register
                  ? "Already have an account?"
                  : "Don’t you have an account?"}{" "}
                <Link
                  href={register ? "/signin" : "/signup"}
                  className="text-purple-600 hover:text-gray-200 transition duration-150 ease-in-out"
                >
                  {register ? "Sign in" : "Sign up"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </HomeFrame>
  );
}
