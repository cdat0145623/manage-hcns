import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import { SettingsLayout } from "~/components/SettingsLayout";
import DailyTaskSettings from "~/views/settings/DailyTaskSettings";

const DailyTaskSettingsPage: NextPageWithLayout = () => (
  <SettingsLayout currentTab="daily-tasks">
    <DailyTaskSettings />
    <Popup />
  </SettingsLayout>
);

DailyTaskSettingsPage.getLayout = (page) =>
  getDashboardLayout(page, undefined, false, "ADMIN");

export default DailyTaskSettingsPage;
