import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import React, { createContext, useContext, useEffect, useState } from "react";

import { authClient } from "@kan/auth/client";

import { api } from "~/utils/api";

interface WorkspaceContextProps {
  workspace: Workspace;
  isLoading: boolean;
  hasLoaded: boolean;
  switchWorkspace: (_workspace: Workspace) => void;
  availableWorkspaces: Workspace[];
}

interface Workspace {
  name: string;
  description: string | null | undefined;
  publicId: string;
  slug: string | undefined;
  plan: "free" | "pro" | "enterprise" | undefined;
  role: "ADMIN" | "AREA_MANAGER" | "BRANCH_MANAGER" | "NVVP";
  weekStartDay: 0 | 1 | 6;
}

const initialWorkspace: Workspace = {
  name: "",
  description: null,
  publicId: "",
  slug: "",
  plan: "free",
  role: "NVVP",
  weekStartDay: 1,
};

const initialAvailableWorkspaces: Workspace[] = [];

export const WorkspaceContext = createContext<
  WorkspaceContextProps | undefined
>(undefined);

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [availableWorkspaces, setAvailableWorkspaces] = useState<Workspace[]>(
    initialAvailableWorkspaces,
  );
  const [hasLoaded, setHasLoaded] = useState(false);

  const { data: session, isPending: sessionLoading } = authClient.useSession();

  const workspacePublicId = useSearchParams().get("workspacePublicId");

  const {
    data,
    isPending: workspaceQueryPending,
    isSuccess,
  } = api.workspace.all.useQuery(undefined, {
    enabled: Boolean(session?.user),
  });
  const utils = api.useUtils();

  useEffect(() => {
    if (sessionLoading) {
      setHasLoaded(false);
      return;
    }

    if (!session?.user) {
      setWorkspace(initialWorkspace);
      setAvailableWorkspaces(initialAvailableWorkspaces);
      setHasLoaded(false);
    }
  }, [session?.user, sessionLoading]);

  const switchWorkspace = (_workspace: Workspace) => {
    localStorage.setItem("workspacePublicId", _workspace.publicId);

    setWorkspace(_workspace);

    // Refetch workspace data to ensure availableWorkspaces is up to date
    void utils.workspace.all.refetch();

    router.push(`/boards`);
  };

  useEffect(() => {
    if (workspaceQueryPending) {
      setHasLoaded(false);
      return;
    }

    if (!isSuccess) {
      return;
    }

    if (data.length === 0) {
      setHasLoaded(true);
      return;
    }

    const workspaces = data.map(({ workspace, role }) => ({
      role,
      publicId: workspace.publicId,
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description,
      plan: workspace.plan,
      weekStartDay: workspace.weekStartDay,
    })) as Workspace[];

    setAvailableWorkspaces(workspaces);

    const storedWorkspaceId: string | null =
      workspacePublicId ?? localStorage.getItem("workspacePublicId");

    if (storedWorkspaceId !== null) {
      const selectedWorkspace = data.find(
        ({ workspace }) => workspace.publicId === storedWorkspaceId,
      );

      if (selectedWorkspace?.workspace) {
        setWorkspace({
          publicId: selectedWorkspace.workspace.publicId,
          name: selectedWorkspace.workspace.name,
          slug: selectedWorkspace.workspace.slug,
          plan: selectedWorkspace.workspace.plan,
          description: selectedWorkspace.workspace.description,
          role: selectedWorkspace.role,
          weekStartDay: selectedWorkspace.workspace.weekStartDay as 0 | 1 | 6,
        });

        if (workspacePublicId) {
          localStorage.setItem("workspacePublicId", workspacePublicId);
          router.push(`/boards`);
        }
      }
    } else {
      const primaryWorkspace = data[0]?.workspace;
      const primaryWorkspaceRole = data[0]?.role;

      if (primaryWorkspace && primaryWorkspaceRole) {
        localStorage.setItem("workspacePublicId", primaryWorkspace.publicId);
        setWorkspace({
          publicId: primaryWorkspace.publicId,
          name: primaryWorkspace.name,
          slug: primaryWorkspace.slug,
          plan: primaryWorkspace.plan,
          description: primaryWorkspace.description,
          role: primaryWorkspaceRole,
          weekStartDay: primaryWorkspace.weekStartDay as 0 | 1 | 6,
        });
      }
    }

    setHasLoaded(true);
  }, [data, workspaceQueryPending, isSuccess, workspacePublicId, router]);

  const isLoading =
    sessionLoading ||
    (Boolean(session?.user) && (workspaceQueryPending || !hasLoaded));

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        isLoading,
        hasLoaded,
        availableWorkspaces,
        switchWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = (): WorkspaceContextProps => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
};
