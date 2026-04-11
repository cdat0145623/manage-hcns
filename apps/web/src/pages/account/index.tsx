import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Account from "~/views/account";

const AccountPage: NextPageWithLayout = () => {
  return <Account />;
};

AccountPage.getLayout = (page) => getDashboardLayout(page);

export default AccountPage;
