import "./globals.css";
import "@/original/fonts";
export const metadata = {
  title: "MyFinance v2 · Sandbox",
  description:
    "A personal finance learning application with simulated bank connections",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
