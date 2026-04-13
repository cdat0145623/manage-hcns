import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import MembersView from "~/views/members";

const MembersPage: NextPageWithLayout = () => {
  return (
    <>
      <MembersView />
      <Popup />
    </>
  );
};

MembersPage.getLayout = (page) => getDashboardLayout(page, undefined, false, "ADMIN");

export default MembersPage;
