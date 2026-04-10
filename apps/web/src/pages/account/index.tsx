import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import CreateAccountView from "~/views/account";

const AccountPage: NextPageWithLayout = () => {
  return <CreateAccountView />;
};

AccountPage.getLayout = (page) => getDashboardLayout(page);

export default AccountPage;
