import React from 'react';
import { X } from 'lucide-react';

interface SaveProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  isSaving: boolean;
  error?: string;
}

export function SaveProjectDialog({ isOpen, onClose, onSave, isSaving, error }: SaveProjectDialogProps) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [validationError, setValidationError] = React.useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    
    if (!name.trim()) {
      setValidationError('Project name is required');
      return;
    }

    onSave(name.trim(), description.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#36393F] rounded-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Save Project</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {validationError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {validationError}
            </div>
          )}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              Failed to save project: {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-2">
              Project Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setValidationError('');
              }}
              className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA]"
              placeholder="My Awesome Bot"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">
              Description <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 rounded-md bg-[#40444B] border border-[#202225] focus:outline-none focus:ring-2 focus:ring-[#7289DA] min-h-[100px] resize-none"
              placeholder="A brief description of your bot..."
            />
          </div>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md hover:bg-[#40444B] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`px-4 py-2 rounded-md bg-[#7289DA] hover:bg-[#677BC4] transition-colors ${
                isSaving ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isSaving ? 'Saving...' : 'Save Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}