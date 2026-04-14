import { getDashboardLayout } from "~/components/Dashboard";
import { PositionsPage } from "~/views/positions/PositionsPage";
import Head from "next/head";

export default function PositionsRoute() {
  return (
    <>
      <Head>
        <title>Vị trí công việc | kan.bn</title>
      </Head>
      <div className="h-full w-full overflow-hidden">
        <PositionsPage />
      </div>
    </>
  );
}

PositionsRoute.getLayout = (page: React.ReactElement) => {
  return getDashboardLayout(page);
};
