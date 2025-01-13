import React from 'react';
import { Bot, Calendar, Edit2, Trash2, Plus } from 'lucide-react';
import { BotProject, getUserProjects, deleteProject } from '../lib/projects';
import { getUserRoles } from '../lib/roles';

interface ProjectListProps {
  userId: string;
  onSelect: (project: BotProject) => void;
  onNew: () => void;
}

export function ProjectList({ userId, onSelect, onNew }: ProjectListProps) {
  const [projects, setProjects] = React.useState<BotProject[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string>();
  const [userRoles, setUserRoles] = React.useState<string[]>([]);
  const [maxProjects, setMaxProjects] = React.useState(3); // Default limit

  React.useEffect(() => {
    const loadProjects = async () => {
      try {
        setIsLoading(true);
        const roles = await getUserRoles(userId);
        setUserRoles(roles);
        
        // Set max projects based on role
        if (roles.includes('administrator') || roles.includes('staff')) {
          setMaxProjects(50);
        } else if (roles.includes('premium')) {
          setMaxProjects(20);
        }
        
        const userProjects = await getUserProjects(userId);
        setProjects(userProjects);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load projects');
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, [userId]);

  const handleDelete = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    
    try {
      await deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete project');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7289DA]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center space-x-2">
          <Bot className="w-5 h-5 text-[#7289DA]" />
          <span>Your Bot Projects</span>
        </h2>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-400">
            {projects.length} / {maxProjects} projects
          </div>
          <button
            onClick={onNew}
            disabled={projects.length >= maxProjects}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md transition-all duration-200 ${
              projects.length >= maxProjects
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-[#7289DA] hover:bg-[#677BC4]'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-12 bg-[#2F3136] rounded-lg">
          <Bot className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400">No bot projects yet</p>
          <button
            onClick={onNew}
            className="mt-4 px-4 py-2 bg-[#7289DA] hover:bg-[#677BC4] rounded-md transition-colors"
          >
            Create Your First Bot
          </button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {projects.map(project => (
            <div
              key={project.id}
              className="bg-[#2F3136] rounded-lg p-4 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{project.name}</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {project.description || 'No description'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onSelect(project)}
                    className="p-1.5 rounded-md hover:bg-[#7289DA]/10 text-[#7289DA] transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    className="p-1.5 rounded-md hover:bg-red-500/10 text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center text-sm text-gray-400">
                <Calendar className="w-4 h-4 mr-1.5" />
                Created {project.createdAt.toDate().toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {projects.length >= maxProjects && !userRoles.includes('premium') && (
        <div className="p-4 bg-[#7289DA]/10 border border-[#7289DA]/20 rounded-lg">
          <div className="flex items-start space-x-3">
            <div className="text-[#7289DA]">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="font-medium text-[#7289DA] mb-1">Upgrade to Premium</div>
              <p className="text-sm text-gray-300">
                You've reached your project limit! Upgrade to Premium to create up to 20 bot projects.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}