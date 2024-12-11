import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import type { UserProject } from '~/lib/persistence/db';
import { useEffect } from 'react';

export function useUserProjects(userId: string | null) {
  const projects = useStore(workbenchStore.userProjects);

  useEffect(() => {
    workbenchStore.setUserId(userId);
  }, [userId]);

  const createProject = async (name: string) => {
    return await workbenchStore.createProject(name);
  };

  const deleteProject = async (projectId: string) => {
    return await workbenchStore.deleteProject(projectId);
  };

  return {
    projects,
    createProject,
    deleteProject,
  };
}
