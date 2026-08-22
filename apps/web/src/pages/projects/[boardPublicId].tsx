import type { NextPageWithLayout } from "../_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import ProjectBoardView from "~/views/projects/board";

const ProjectBoardPage: NextPageWithLayout = () => (
  <>
    <ProjectBoardView />
    <Popup />
  </>
);

ProjectBoardPage.getLayout = (page) => getDashboardLayout(page);

export default ProjectBoardPage;
