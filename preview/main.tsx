import React from "react";
import { createRoot } from "react-dom/client";
import Page from "../apps/web/src/app/page";
import "../apps/web/src/app/globals.css";
import { installDemo, resetDemo } from "./adapter";
installDemo();
createRoot(document.getElementById("root")!).render(
  <>
    <aside className="demo-banner">
      <div>
        <strong>Interactive browser demo</strong>
        <span>
          Synthetic data · changes stay in this tab. This preview simulates API
          responses; Go, PostgreSQL and live Plaid run in the full repository
          application. Use sample values only.
        </span>
      </div>
      <div className="demo-actions">
        <a
          href="https://github.com/AryanSaini26/MyFinance/tree/feature/myfinance-v2"
          target="_blank"
          rel="noreferrer"
        >
          View implementation ↗
        </a>
        <button className="secondary" onClick={resetDemo}>
          Reset sample data
        </button>
      </div>
    </aside>
    <Page />
  </>,
);
