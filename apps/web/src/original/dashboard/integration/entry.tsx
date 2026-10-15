"use client";
import dynamic from "next/dynamic";
const Dashboard = dynamic(() => import("./workspace"), {
  ssr: false,
  loading: () => (
    <p
      style={{
        color: "white",
        background: "#0b1437",
        padding: 30,
        minHeight: "100vh",
      }}
    >
      Loading MyFinance…
    </p>
  ),
});
export default Dashboard;
