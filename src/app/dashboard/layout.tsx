import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

export default function RootDashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardLayout>{children}</DashboardLayout>;
}
