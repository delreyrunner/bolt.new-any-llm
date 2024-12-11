import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { useUserProjects } from '~/hooks/useUserProjects';
import { useEffect } from 'react';

interface ProjectSelectorProps {
  userId: string | null;
}

export function ProjectSelector({ userId }: ProjectSelectorProps) {
  const { projects, createProject } = useUserProjects(userId);
  const currentProject = useStore(workbenchStore.currentProject);

  const handleProjectChange = async (projectId: string) => {
    try {
      await workbenchStore.loadProject(projectId);
    } catch (error) {
      console.error('Error loading project:', error);
    }
  };

  useEffect(() => {
    // Load the first project by default if none is selected
    if (projects.length > 0 && !currentProject) {
      handleProjectChange(projects[0].projectId);
    }
  }, [projects, currentProject]);

  if (!userId) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      {projects.length === 0 ? (
        <div className="flex items-center justify-between w-full">
          <span className="text-sm text-gray-500">No projects yet</span>
          <button
            onClick={() => {
              const name = prompt('Enter project name:');
              if (name) createProject(name);
            }}
            className="px-3 py-1 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Create Project
          </button>
        </div>
      ) : (
        <>
          <label htmlFor="project-select" className="text-sm font-medium text-gray-700">
            Project:
          </label>
          <select
            id="project-select"
            value={currentProject?.projectId || ''}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {projects.map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              const name = prompt('Enter project name:');
              if (name) createProject(name);
            }}
            className="px-3 py-1 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            New
          </button>
        </>
      )}
    </div>
  );
}
