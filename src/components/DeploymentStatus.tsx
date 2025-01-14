import React from 'react';
import { Rocket, Server, Package, Check, AlertCircle, Loader } from 'lucide-react';

interface DeploymentStatusProps {
  isVisible: boolean;
  currentStep: 'creating' | 'installing' | 'complete' | 'error';
  error?: string;
  serverDetails?: {
    panelUrl: string;
    username: string;
  };
  onClose: () => void;
}

export function DeploymentStatus({ 
  isVisible, 
  currentStep, 
  error,
  serverDetails,
  onClose 
}: DeploymentStatusProps) {
  if (!isVisible) return null;

  const steps = [
    {
      id: 'creating',
      title: 'Creating Server',
      icon: Rocket,
      description: 'Setting up your Discord bot server...'
    },
    {
      id: 'installing',
      title: 'Installing',
      icon: Package,
      description: 'Installing dependencies and configuring server...'
    },
    {
      id: 'complete',
      title: 'Complete',
      icon: Check,
      description: serverDetails ? (
        <div className="space-y-2">
          <p>Server created successfully! You can now access your server at:</p>
          <div className={`bg-[#2F3136] p-4 rounded-lg space-y-3 transition-all duration-300 ${
            currentStep !== 'complete' ? 'blur-sm select-none' : ''
          }`}>
            <div>
              <div className="text-sm text-gray-400">Panel URL</div>
              <a 
                href={serverDetails.panelUrl}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#7289DA] hover:underline"
              >
                {serverDetails.panelUrl}
              </a>
            </div>
            <div>
              <div className="text-sm text-gray-400">Username</div>
              <div className="font-medium">{serverDetails.username}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Password</div>
              <div className="text-yellow-400 text-sm">Use your account password to login</div>
            </div>
          </div>
        </div>
      ) : 'Server setup complete!'
    }
  ];

  const currentStepIndex = steps.findIndex(step => step.id === currentStep);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#36393F] rounded-lg w-full max-w-2xl mx-4 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold flex items-center space-x-2">
              <Server className="w-5 h-5" />
              <span>Deploying Your Bot</span>
            </h2>
            {(currentStep === 'complete' || currentStep === 'error') && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <Check className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="space-y-8">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === currentStepIndex;
              const isComplete = index < currentStepIndex;
              const isPending = index > currentStepIndex;

              return (
                <div 
                  key={step.id}
                  className={`flex items-start space-x-4 ${
                    isPending ? 'opacity-50' : ''
                  }`}
                >
                  <div className="relative">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center
                      ${isActive && step.id !== 'complete' ? 'bg-[#7289DA] animate-pulse' : ''}
                      ${isComplete ? 'bg-green-500' : ''}
                      ${isPending ? 'bg-gray-700' : ''}
                      ${step.id === 'complete' && currentStep === 'complete' ? 'bg-green-500' : ''}
                    `}>
                      {isActive && step.id !== 'complete' ? (
                        <Loader className="w-5 h-5 animate-spin" />
                      ) : step.id === 'complete' && currentStep === 'complete' ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <StepIcon className="w-5 h-5" />
                      )}
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`
                        absolute top-8 left-1/2 w-0.5 h-12 -translate-x-1/2
                        ${isComplete ? 'bg-green-500' : 'bg-gray-700'}
                      `} />
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <h3 className="font-medium mb-1">{step.title}</h3>
                    <div className="text-sm text-gray-400">
                      {typeof step.description === 'string' ? (
                        <p>{step.description}</p>
                      ) : (
                        step.description
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {currentStep === 'error' && (
              <div className="flex items-start space-x-4 text-red-400">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="font-medium mb-1">Error</h3>
                  <p className="text-sm">{error || 'An error occurred during deployment'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}