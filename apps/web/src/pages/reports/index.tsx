import type { NextPageWithLayout } from "../_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import ReportsView from "~/views/reports/ReportsView";

const ReportsPage: NextPageWithLayout = () => {
  return (
    <>
      <ReportsView />
      <Popup />
    </>
  );
};

ReportsPage.getLayout = (page) => getDashboardLayout(page);

export default ReportsPage;
