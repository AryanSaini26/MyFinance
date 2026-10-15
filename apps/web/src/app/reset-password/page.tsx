"use client";
import Link from "next/link";
import { HomeFrame } from "@/original/home/site";
export default function ResetPassword() {
  return (
    <HomeFrame>
      <section className="relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="pt-32 pb-12 md:pt-40 md:pb-20">
            <div className="max-w-3xl mx-auto text-center pb-12 md:pb-20">
              <h1 className="h1">Forgot your password?</h1>
            </div>
            <div className="max-w-sm mx-auto text-gray-400">
              <p>
                Password reset is not configured for this Sandbox application.
                Contact the local application administrator, or create a
                separate test account.
              </p>
              <Link
                href="/signin"
                className="btn text-white bg-purple-600 hover:bg-purple-700 w-full mt-6"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </section>
    </HomeFrame>
  );
}
