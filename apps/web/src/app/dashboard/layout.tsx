import DashboardEntry from "@/original/dashboard/integration/entry";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DashboardEntry />
      {children}
    </>
  );
}
