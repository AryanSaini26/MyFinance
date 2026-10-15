import React from "react";
import { createRoot } from "react-dom/client";
import OriginalHome from "../apps/web/src/original/home/site";
import ResetPassword from "../apps/web/src/app/reset-password/page";
import AuthForm from "../apps/web/src/original/home/auth-form";
import Dashboard from "../apps/web/src/original/dashboard/integration/workspace";
import "../apps/web/src/app/globals.css";
import "../apps/web/src/original/fonts";
import { installDemo } from "./adapter";
import { usePathname } from "./navigation";
installDemo();
window.addEventListener("hashchange", () => window.scrollTo(0, 0));
document.addEventListener("click", (event) => {
  const anchor = (event.target as Element)?.closest("a");
  if (!anchor || anchor.target === "_blank") return;
  const href = anchor.getAttribute("href");
  if (href && /^\/(?:dashboard|signin|signup|reset-password|$)/.test(href)) {
    event.preventDefault();
    location.hash = href;
  }
});
function App() {
  const path = usePathname();
  return path.startsWith("/dashboard") ? (
    <Dashboard />
  ) : path === "/signin" ? (
    <AuthForm />
  ) : path === "/signup" ? (
    <AuthForm register />
  ) : path === "/reset-password" ? (
    <ResetPassword />
  ) : (
    <OriginalHome />
  );
}
createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <footer
      style={{
        background: "#111c44",
        color: "#a3aed0",
        textAlign: "center",
        padding: "12px",
        fontSize: "12px",
      }}
    >
      Interactive preview · synthetic data in this tab · full backend runs
      locally
    </footer>
  </>,
);
