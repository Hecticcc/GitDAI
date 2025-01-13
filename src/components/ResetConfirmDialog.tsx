import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ResetConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ResetConfirmDialog({ isOpen, onConfirm, onClose }: ResetConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#36393F] rounded-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-2 text-yellow-400">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Reset Code</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4">
          <p className="text-gray-300">
            Are you sure you want to reset the code to default? This action cannot be undone.
          </p>
          
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md hover:bg-[#40444B] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-4 py-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Reset Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}