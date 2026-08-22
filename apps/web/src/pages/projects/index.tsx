import type { NextPageWithLayout } from "../_app";
import { getDashboardLayout } from "~/components/Dashboard";
import Popup from "~/components/Popup";
import ProjectsView from "~/views/projects";

const ProjectsPage: NextPageWithLayout = () => (
  <>
    <ProjectsView />
    <Popup />
  </>
);

ProjectsPage.getLayout = (page) => getDashboardLayout(page);

export default ProjectsPage;
