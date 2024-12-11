import { useUserProjects } from '~/hooks/useUserProjects';
import { useEffect, useState } from 'react';

interface ProjectListProps {
  userId: string | null;
}

export function ProjectList({ userId }: ProjectListProps) {
  const { projects, createProject, deleteProject } = useUserProjects(userId);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    try {
      await createProject(newProjectName);
      setNewProjectName('');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      await deleteProject(projectId);
    }
  };

  if (!userId) {
    return <div className="text-gray-500">Please sign in to view your projects</div>;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreateProject} className="flex gap-2">
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          placeholder="New project name"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isCreating}
        />
        <button
          type="submit"
          disabled={isCreating || !newProjectName.trim()}
          className="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isCreating ? 'Creating...' : 'Create'}
        </button>
      </form>

      <div className="space-y-2">
        {projects.map((project) => (
          <div
            key={project.id}
            className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md"
          >
            <div>
              <h3 className="font-medium">{project.name}</h3>
              <p className="text-sm text-gray-500">
                Created {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={() => handleDeleteProject(project.projectId)}
              className="px-3 py-1 text-sm text-red-600 border border-red-600 rounded-md hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        ))}

        {projects.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No projects yet. Create one to get started!
          </div>
        )}
      </div>
    </div>
  );
}
