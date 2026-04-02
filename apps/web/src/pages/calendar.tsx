import { getDashboardLayout } from "~/components/Dashboard";
import { Calendar } from "~/views/calendar/Calendar";
import Head from "next/head";

export default function CalendarPage() {
  return (
    <>
      <Head>
        <title>Calendar | kan.bn</title>
      </Head>
      <div className="h-full w-full overflow-hidden">
        <Calendar />
      </div>
    </>
  );
}

CalendarPage.getLayout = (page: React.ReactElement) => {
  return getDashboardLayout(page);
};
