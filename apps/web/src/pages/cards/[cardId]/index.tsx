import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import CardView from "~/views/card";

const CardPage: NextPageWithLayout = () => {
  return (
    <>
      <CardView />
      <Popup />
    </>
  );
};

export default CardPage;
