import type { ReactElement } from "react";
import Head from "next/head";

import { getDashboardLayout } from "~/components/Dashboard";
import { DailyTaskKpiView } from "~/views/daily-task-kpi/DailyTaskKpiView";

export default function DailyTaskKpiPage() {
  return (
    <>
      <Head>
        <title>Daily Task KPI | kan.bn</title>
      </Head>
      <DailyTaskKpiView />
    </>
  );
}

DailyTaskKpiPage.getLayout = (page: ReactElement) => getDashboardLayout(page);
