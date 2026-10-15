"use client";
import { useEffect } from "react";
import AOS from "aos";
import Header from "./ui/header";
import Footer from "./ui/footer";
import Illustration from "./page-illustration";
import Hero from "./hero";
import Zigzag from "./zigzag";
export function HomeFrame({
  children,
  footer = false,
}: {
  children: React.ReactNode;
  footer?: boolean;
}) {
  useEffect(() => {
    AOS.init({
      once: true,
      disable: "phone",
      duration: 600,
      easing: "ease-out-sine",
    });
  }, []);
  return (
    <div className="font-inter antialiased bg-gray-900 text-gray-200 tracking-tight flex flex-col min-h-screen overflow-hidden">
      <Header />
      <main className="grow">
        <Illustration />
        {children}
      </main>
      {footer && <Footer />}
    </div>
  );
}
export default function OriginalHome() {
  return (
    <HomeFrame footer>
      <Hero />
      <Zigzag />
    </HomeFrame>
  );
}
