import React from 'react';
import { User } from '@firebase/auth';
import type { UserData } from './lib/firebase';
import { Code } from 'lucide-react';
import JSZip from 'jszip';
import { MessageCircle, Download, History, Bot, ChevronRight, Undo, X, Clock, Sparkles, Rocket, LogOut, Save, Settings } from 'lucide-react';
import { getChatResponse, extractCodeBlock, generatePackageJson, ModelType, updateBotToken, getDefaultCode } from './lib/openai';
import { createPterodactylServer, testCreateServer, waitForInstallation, deletePterodactylServer } from './lib/pterodactyl';
import { AuthForms } from './components/AuthForms';
import { useAuth, checkSavedLogin, loginUser, logoutUser, getUserData, updateUserTokens, updateUserServers } from './lib/firebase';
import { createProject, BotProject } from './lib/projects';
import { AnimatedCode } from './components/AnimatedCode';
import { LoadingDots } from './components/LoadingDots';
import { SolutionMessage } from './components/SolutionMessage';
import { DeploymentStatus } from './components/DeploymentStatus';
import { UserDashboard } from './components/UserDashboard';
import { ProjectList } from './components/ProjectList';
import { SaveProjectDialog } from './components/SaveProjectDialog';
import { ResetConfirmDialog } from './components/ResetConfirmDialog';
import { ServerTimer } from './components/ServerTimer';

interface ChatMessage {
  type: 'user' | 'system';
  content: string;
  isSolution?: boolean;
  isInfo?: boolean;
}

interface CodeVersion {
  code: string;
  timestamp: Date;
  description: string;
}

const formatMessages = (messages: ChatMessage[]) => 
  messages.map(msg => ({
    role: msg.type === 'user' ? 'user' : 'assistant',
    content: msg.content
  }));

function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [userData, setUserData] = React.useState<UserData | null>(null);
  const [isAuthLoading, setIsAuthLoading] = React.useState(true);

  React.useEffect(() => {
    // Check for saved login
    const checkAuth = async () => {
      const savedEmail = await checkSavedLogin();
      if (savedEmail) {
        try {
          // Attempt to login with saved credentials
          await loginUser(savedEmail, '', true);
        } catch (error) {
          console.error('Auto-login failed:', error);
        }
      }
      setIsAuthLoading(false);
    };

    // Listen for auth state changes
    const unsubscribe = useAuth((user) => {
      setUser(user);
      setIsAuthLoading(false);
      if (user) {
        // Fetch user data when user logs in
        getUserData(user.uid).then(data => {
          setUserData(data);
        }).catch(error => {
          console.error('Error fetching user data:', error);
        });
      } else {
        setUserData(null);
      }
    });

    checkAuth();
    return unsubscribe;
  }, []);

  const [messages, setMessages] = React.useState<ChatMessage[]>([
    { type: 'system', content: 'Welcome! I can help you create a Discord bot. What would you like to add?' }
  ]);
  const [input, setInput] = React.useState('');
  const [currentCode, setCurrentCode] = React.useState(() => {
    return getDefaultCode();
  });
  const [codeHistory, setCodeHistory] = React.useState<CodeVersion[]>([{
    code: getDefaultCode(),
    timestamp: new Date(),
    description: 'Basic bot setup'
  }]);
  const [historyIndex, setHistoryIndex] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [useEnhancedAI, setUseEnhancedAI] = React.useState(false);
  const [botToken, setBotToken] = React.useState('');
  const [isTokenSaved, setIsTokenSaved] = React.useState(false);
  const [showTokenInput, setShowTokenInput] = React.useState(false);
  const [isCreatingServer, setIsCreatingServer] = React.useState(false);
  const [deploymentStatus, setDeploymentStatus] = React.useState<'creating' | 'installing' | 'complete' | 'error'>('creating');
  const [deploymentError, setDeploymentError] = React.useState<string>();
  const [showDeployment, setShowDeployment] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);
  const [showProjects, setShowProjects] = React.useState(false);
  const [showResetConfirm, setShowResetConfirm] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string>();
  const [serverStartTime, setServerStartTime] = React.useState<number | null>(null);
  const [showDashboard, setShowDashboard] = React.useState(false);
  const chatRef = React.useRef<HTMLDivElement>(null);

  // Get server duration based on user role
  const getServerDuration = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'premium':
        return 7200000; // 2 hours
      default:
        return 300000; // 5 minutes
    }
  };

  // Handle server expiration
  const handleServerExpire = async () => {
    if (user && userData?.servers?.length > 0) {
      const serverId = userData.servers[0];
      try {
        // Delete the server using Pterodactyl API
        await deletePterodactylServer(serverId);
        console.log('Server deleted successfully:', serverId);
      } catch (error) {
        console.error('Error deleting server:', error);
      }

      // Update user data
      await updateUserServers(user.uid, []);
      setUserData(prev => prev ? {
        ...prev,
        servers: [],
        serverStartTime: null
      } : null);
      setMessages(prev => [...prev, {
        type: 'system',
        content: 'Your server has expired and been removed.',
        isSolution: true
      }]);
    }
  };

  React.useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, currentCode]);

  // Initialize server start time from user data
  React.useEffect(() => {
    if (userData?.serverStartTime) {
      setServerStartTime(userData.serverStartTime);
    }
  }, [userData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isGenerating) return;
    
    const userMessage = { 
      type: 'user' as const, 
      content: input
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsGenerating(true);

    try {
      const model: ModelType = useEnhancedAI ? 'gpt-4' : 'gpt-3.5-turbo';
      const { content: response, tokenCost } = await getChatResponse(formatMessages([...messages, userMessage]), model);

      // Check if user has enough tokens
      if (tokenCost && userData && userData.tokens < tokenCost.totalCost) {
        setMessages(prev => [...prev, {
          type: 'system',
          content: 'Insufficient tokens available',
          isInfo: true
        }]);
        return;
      }
    
      const codeBlock = extractCodeBlock(response);

      // If we used tokens, update the user's token count
      if (tokenCost && userData) {
        const newTokens = userData.tokens - tokenCost.totalCost;
        try {
          await updateUserTokens(userData.id, newTokens);
          setUserData(prev => prev ? { ...prev, tokens: newTokens } : null);
        } catch (error) {}
      }
      
      if (codeBlock) {
        // Apply bot token to the new code if available
        const codeWithToken = botToken ? updateBotToken(codeBlock, botToken) : codeBlock;
        const newVersion: CodeVersion = {
          code: codeWithToken,
          timestamp: new Date(),
          description: input.slice(0, 50) + (input.length > 50 ? '...' : '')
        };
        setCodeHistory(prev => [...prev.slice(0, historyIndex + 1), newVersion]);
        setHistoryIndex(prev => prev + 1);
        setCurrentCode(codeWithToken);
        // Only show the explanation part before the code block
        const explanation = response.split('```')[0].trim(); 
        if (explanation.toLowerCase().startsWith('error:') || explanation.toLowerCase().startsWith('error detected:')) {
          setMessages(prev => [...prev, { 
            type: 'system', 
            content: explanation,
            isSolution: true 
          }]);
        } else {
          setMessages(prev => [...prev, { type: 'system', content: explanation }]);
        }
      } else {
        if (response.toLowerCase().startsWith('error:') || response.toLowerCase().startsWith('error detected:')) {
          setMessages(prev => [...prev, { 
            type: 'system', 
            content: response,
            isSolution: true 
          }]);
        } else {
          setMessages(prev => [...prev, { type: 'system', content: response }]);
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { type: 'system', content: 'Sorry, there was an error generating a response. Please try again.' }]);
      if (error instanceof Error && error.message.includes('API key')) {
        setMessages(prev => [...prev, {
          type: 'system',
          content: 'Please check your OpenAI API key is correctly set in the .env file.',
          isSolution: true
        }]);
      }
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  };

  const handleRollback = () => {
    if (historyIndex > 0) {
      const previousVersion = codeHistory[historyIndex - 1];
      setHistoryIndex(prev => prev - 1);
      setCurrentCode(previousVersion.code);
      setMessages(prev => [...prev, {
        type: 'system',
        content: `Rolled back to version from ${previousVersion.timestamp.toLocaleString()}`
      }]);
    }
  };

  const handleVersionSelect = (index: number) => {
    const version = codeHistory[index];
    setHistoryIndex(index);
    setCurrentCode(version.code);
    setShowHistory(false);
    setMessages(prev => [...prev, {
      type: 'system',
      content: `Switched to version from ${version.timestamp.toLocaleString()}: ${version.description}`
    }]);
  };

  const handleTokenSave = () => {
    if (botToken.trim()) {
      setIsTokenSaved(true);
      // Update the code with the new token
      const updatedCode = updateBotToken(currentCode, botToken);
      setCurrentCode(updatedCode);
      // Add new version to history
      const newVersion: CodeVersion = {
        code: updatedCode,
        timestamp: new Date(),
        description: 'Updated bot token'
      };
      setCodeHistory(prev => [...prev.slice(0, historyIndex + 1), newVersion]);
      setHistoryIndex(prev => prev + 1);
      setShowTokenInput(false);
    }
  };

  const handleDownload = () => {
    const zip = new JSZip();
    
    // Add main bot file
    const codeWithToken = botToken 
      ? currentCode.replace('your_bot_token_here', botToken)
      : currentCode;
    zip.file('bot.js', codeWithToken);
    
    // Add package.json
    zip.file('package.json', generatePackageJson());
    
    // Add README with setup instructions
    const readme = `# Discord Bot

## Setup Instructions
1. Install Node.js 16.9.0 or higher
2. Run \`npm install\` to install dependencies
3. Create a \`.env\` file and add your bot token: \`TOKEN=your_bot_token\`
4. Run \`node bot.js\` to start the bot

## Features
${messages
  .filter(m => m.type === 'system')
  .map(m => m.content.split('\n')[0])
  .join('\n')}
`;
    zip.file('README.md', readme);
    
    // Add .env.example
    zip.file('.env.example', 'TOKEN=your_bot_token_here');
    
    // Generate and download zip
    zip.generateAsync({ type: 'blob' })
      .then(content => {
        const url = window.URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'discord-bot.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      });
  };

  return (
    <div className="min-h-screen bg-[#2C2F33] text-gray-100">
      {/* Auth Check */}
      {isAuthLoading ? (
        <div className="flex items-center justify-center min-h-screen">
          <LoadingDots />
        </div>
      ) : !user ? (
        <div className="flex items-center justify-center min-h-screen">
          <AuthForms
            onSuccess={() => {}}
            onError={(error) => {
              setMessages(prev => [...prev, {
                type: 'system',
                content: `Authentication error: ${error}`,
                isSolution: true
              }]);
            }}
          />
        </div>
      ) : (
      <>
      {/* Header */}
      <header className="bg-[#23272A]/95 backdrop-blur-md border-b border-[#7289DA]/10 sticky top-0 z-40 transition-all duration-300">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-[85px]">
          <div className="flex items-center pl-6 group">
            <img
              src="https://imgur.com/1YoQljt.png"
              alt="Discord Bot Builder"
              className="w-[85px] h-[65px] object-contain transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <nav className="flex items-center pr-6 flex-1 justify-end">
            <div className="flex items-center space-x-3">
              {/* Project Management Group */}
              <div className="flex items-center p-1.5 bg-[#2F3136]/50 backdrop-blur-md rounded-lg border border-white/5 shadow-lg">
                <button
                  onClick={() => setShowProjects(true)}
                  className="group flex items-center space-x-2 px-3 py-1.5 rounded-md hover:bg-[#7289DA]/10 transition-all duration-200"
                >
                  <Bot className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12" />
                  <span>Projects</span>
                </button>
                <button
                  onClick={() => setShowSaveDialog(true)}
                  disabled={isSaving}
                  className={`group flex items-center space-x-2 px-3 py-1.5 rounded-md transition-all duration-200 ${
                    isSaving ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'hover:bg-[#7289DA]/10'
                  }`}
                >
                  <Save className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${isSaving ? 'animate-pulse' : ''}`} />
                  <span>{isSaving ? 'Saving...' : 'Save'}</span>
                </button>
                <button
                  onClick={() => setShowHistory(true)}
                  className="group flex items-center space-x-2 px-3 py-1.5 rounded-md hover:bg-[#7289DA]/10 transition-all duration-200"
                >
                  <History className="w-5 h-5 transition-transform duration-300 group-hover:-rotate-12" />
                  <span>History</span>
                </button>
              </div>

              {/* Actions Group */}
              <div className="flex items-center p-1.5 bg-[#2F3136]/50 backdrop-blur-md rounded-lg border border-white/5 shadow-lg">
                <button 
                  onClick={handleRollback}
                  disabled={historyIndex === 0}
                  className={`group flex items-center space-x-2 px-3 py-1.5 rounded-md transition-all duration-200 ${
                    historyIndex === 0 
                      ? 'text-gray-500 cursor-not-allowed' 
                      : 'hover:bg-[#7289DA]/10'
                  }`}
                  title={historyIndex === 0 ? 'No previous versions available' : 'Rollback to previous version'}
                >
                  <Undo className="w-5 h-5 transition-transform duration-300 group-hover:-rotate-45" />
                  <span>Undo</span>
                </button>
                <button 
                  onClick={handleDownload}
                  className="group flex items-center space-x-2 px-3 py-1.5 rounded-md hover:bg-[#7289DA]/10 transition-all duration-200"
                >
                  <Download className="w-5 h-5 transition-transform duration-300 group-hover:translate-y-0.5" />
                  <span>Export</span>
                </button>
              </div>

              {/* User Group */}
              <div className="flex items-center p-1.5 bg-[#2F3136]/50 backdrop-blur-md rounded-lg border border-white/5 shadow-lg">
                <button
                  onClick={() => setShowDashboard(true)}
                  className="group flex items-center space-x-2 px-3 py-1.5 rounded-md hover:bg-[#7289DA]/10 transition-all duration-200"
                >
                  <Settings className="w-5 h-5 transition-transform duration-700 group-hover:rotate-90" />
                  <span>Dashboard</span>
                </button>
                <button
                  onClick={() => logoutUser()}
                  className="group flex items-center space-x-2 px-3 py-1.5 rounded-md hover:bg-red-500/10 text-red-400 transition-all duration-200"
                >
                  <LogOut className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-0.5" />
                  <span>Logout</span>
                </button>
              </div>
              
              {/* Deploy Button */}
              <button
                onClick={async () => {
                  if (!botToken) {
                    setMessages(prev => [...prev, {
                      type: 'system',
                      content: 'Please set your bot token first',
                      isSolution: true
                    }]);
                    return;
                  }
                  
                  try {
                    setIsCreatingServer(true);
                    setShowDeployment(true);
                    setDeploymentStatus('creating');
                    setDeploymentError(undefined);
                    
                    const serverName = `discord-bot-${Date.now()}`;
                    const response = await createPterodactylServer(serverName, 'Discord bot server', userData.pterodactylId);
                    
                    if (!response?.data?.attributes?.identifier) {
                      throw new Error('Failed to get server identifier');
                    }
                    
                    const serverId = response.data.attributes.identifier;
                    
                    // Update user's servers list
                    await updateUserServers(user.uid, [serverId]);
                    setUserData(prev => prev ? {
                      ...prev,
                      servers: [serverId],
                      serverStartTime: Date.now()
                    } : null);
                    setServerStartTime(Date.now());
                    
                    setDeploymentStatus('installing');
                    
                    // Wait for installation
                    await waitForInstallation(serverId);
                    
                    // Upload bot files
                    const files = [{
                      path: 'bot.js',
                      content: updateBotToken(currentCode, botToken)
                    }];
                    
                    await fetch('/.netlify/functions/upload-files', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        serverId,
                        files
                      })
                    });
                    
                    setDeploymentStatus('complete');
                    
                    setMessages(prev => [...prev, {
                      type: 'system',
                      content: 'Server created successfully! You can now access it through the panel.',
                      isSolution: true
                    }]);
                  } catch (error) {
                    setDeploymentStatus('error');
                    setDeploymentError(error instanceof Error ? error.message : 'Failed to create server');
                    setMessages(prev => [...prev, {
                      type: 'system',
                      content: `Failed to create server: ${error instanceof Error ? error.message : 'Unknown error'}`,
                      isSolution: true
                    }]);
                  } finally {
                    setIsCreatingServer(false);
                  }
                }}
                disabled={isCreatingServer || !userData}
                className={`relative flex items-center space-x-2 px-5 py-2.5 rounded-md transition-all duration-300 ${
                  isCreatingServer || !userData
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#7289DA] to-[#5865F2] hover:from-[#5865F2] hover:to-[#7289DA] text-white shadow-lg hover:shadow-[#7289DA]/20 hover:-translate-y-0.5'
                } group overflow-hidden`}
              >
                {/* Animated background effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-1000" />

                <Rocket className={`w-5 h-5 transition-transform duration-300 group-hover:rotate-12 ${
                  isCreatingServer ? 'animate-pulse' : ''
                }`} />
                <span className="font-medium">
                  {isCreatingServer ? 'Creating...' : 'Deploy Server'}
                </span>
                
                {/* Shine effect */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                </div>
              </button>
            </div>
          </nav>
        </div>

        {/* Server Timer */}
        {serverStartTime && userData?.servers?.length > 0 && (
          <div className="absolute top-2 right-4">
            <ServerTimer
              startTime={serverStartTime}
              duration={getServerDuration(userData.role)}
              onExpire={handleServerExpire}
            />
          </div>
        )}
      </header>
      
      {/* Main Content */}
      <main className="max-w-[95%] mx-auto p-4 flex flex-col lg:flex-row gap-6 h-[calc(100vh-85px)]">
        {/* Chat Interface */}
        <div className="w-full lg:w-[35%] flex flex-col bg-[#36393F] rounded-lg overflow-hidden">
          <div 
            ref={chatRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.isSolution ? (
                  <div className="max-w-[80%]">
                    <SolutionMessage message={message.content} />
                  </div>
                ) : message.isInfo ? (
                  <div className="max-w-[80%]">
                    <div className="bg-[#7289DA]/10 border border-[#7289DA]/20 rounded-lg p-4 flex items-start space-x-3">
                      <div className="text-[#7289DA]">
                        <MessageCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-medium text-[#7289DA] mb-1">Information</div>
                        <div className="text-gray-100">{message.content}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.type === 'user'
                        ? 'bg-[#7289DA] text-white'
                        : 'bg-[#40444B] text-gray-100 whitespace-pre-wrap break-words'
                    }`}
                  >
                    {message.content}
                    {message === messages[messages.length - 1] && message.type === 'system' && isGenerating && (
                      <div className="mt-2">
                        <LoadingDots />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
            <div className="space-y-4">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Describe your bot's features..."
                disabled={isLoading || isGenerating}
                className={`w-full bg-[#40444B] text-gray-100 rounded-lg px-4 py-3 min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-[#7289DA] ${
                  (isLoading || isGenerating) ? 'cursor-not-allowed opacity-50' : ''
                }`}
              />
              <div className="flex items-center justify-between space-x-2">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowTokenInput(!showTokenInput)}
                    className={`group relative flex items-center space-x-2 px-3 py-1.5 text-sm rounded-md transition-all duration-200 ${
                      isTokenSaved
                        ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                        : 'bg-[#2F3136] hover:bg-[#40444B]'
                    }`}
                  >
                    <span>Bot Token</span>
                    {isTokenSaved && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setUseEnhancedAI(prev => !prev)}
                    className={`group relative flex items-center space-x-2 px-3 py-1.5 text-sm rounded-md transition-all duration-200 bg-[#2F3136] ${
                      useEnhancedAI
                        ? 'text-yellow-300 hover:bg-[#40444B]'
                        : 'text-gray-300 hover:bg-[#40444B]'
                    }`}
                  >
                    <Sparkles className={`w-4 h-4 transition-all duration-300 ${
                      useEnhancedAI ? 'animate-pulse' : ''
                    }`} />
                    <span className="font-medium">Enhanced AI</span>
                    {useEnhancedAI && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                      </span>
                    )}
                  </button>
                  {userData && (
                    <div className="flex items-center space-x-2 px-3 py-1.5 text-sm rounded-md bg-[#2F3136] hover:bg-[#40444B] transition-all duration-200">
                      <span className="text-gray-300 font-medium">Tokens</span>
                      <span className="px-2 py-0.5 bg-[#7289DA]/20 text-[#7289DA] rounded-md font-semibold">
                        {userData.tokens}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className={`bg-[#7289DA] px-4 py-2 rounded-lg transition-colors ${
                    (isLoading || isGenerating) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#677BC4]'
                  }`}
                  disabled={isLoading || isGenerating}
                >
                  Send
                </button>
              </div>
              {showTokenInput && (
                <div className="mt-4 p-4 bg-[#2F3136] rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium">Bot Token</label>
                      {isTokenSaved && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-yellow-400">For testing only - Reset in production!</div>
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="password"
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="Enter your bot token..."
                      className="flex-1 bg-[#40444B] text-gray-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7289DA]"
                    />
                    <button
                      type="button"
                      onClick={handleTokenSave}
                      disabled={!botToken.trim()}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                        botToken.trim()
                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                          : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      Save Token
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>
        
        {/* Code Editor */}
        <div className="w-full lg:w-[65%]">
          <AnimatedCode code={currentCode} isLoading={isGenerating} />
        </div>
      </main>
      </>
      )}
      
      {/* Code Editor */}
      <div className="w-full lg:w-[65%]">
        <AnimatedCode code={currentCode} isLoading={isGenerating} />
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#36393F] rounded-lg w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold">Code History</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {codeHistory.map((version, index) => (
                <button
                  key={version.timestamp.getTime()}
                  onClick={() => handleVersionSelect(index)}
                  className={`w-full text-left p-4 rounded-lg mb-2 transition-colors ${
                    index === historyIndex
                      ? 'bg-[#7289DA] text-white'
                      : 'bg-[#2F3136] hover:bg-[#40444B]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{version.description}</div>
                      <div className="text-sm text-gray-400">
                        {version.timestamp.toLocaleString()}
                      </div>
                    </div>
                    {index === historyIndex && (
                      <div className="text-xs bg-white/20 px-2 py-1 rounded-full">
                        Current
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Project List */}
      {showProjects && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-[#36393F] rounded-lg w-full max-w-4xl">
            <div className="p-6">
              <ProjectList
                userId={user.uid}
                onSelect={(project) => {
                  setCurrentCode(project.code);
                  setShowProjects(false);
                }}
                onNew={() => {
                  setShowSaveDialog(true);
                  setShowProjects(false);
                }}
                onClose={() => setShowProjects(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Save Dialog */}
      <SaveProjectDialog
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={async (name, description) => {
          try {
            setIsSaving(true);
            const projectId = await createProject(user.uid, {
              name,
              description,
              code: currentCode
            });
            setShowSaveDialog(false);
            setMessages(prev => [...prev, {
              type: 'system',
              content: 'Project saved successfully!',
              isSolution: true
            }]);
          } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Failed to save project');
          } finally {
            setIsSaving(false);
          }
        }}
        isSaving={isSaving}
        error={saveError}
      />

      {/* Reset Confirmation */}
      <ResetConfirmDialog
        isOpen={showResetConfirm}
        onConfirm={() => {
          const defaultCode = getDefaultCode();
          setCurrentCode(defaultCode);
          setCodeHistory([{
            code: defaultCode,
            timestamp: new Date(),
            description: 'Reset to default'
          }]);
          setHistoryIndex(0);
        }}
        onClose={() => setShowResetConfirm(false)}
      />

      {/* Deployment Status */}
      <DeploymentStatus
        isVisible={showDeployment}
        currentStep={deploymentStatus}
        error={deploymentError}
        onClose={() => setShowDeployment(false)}
      />

      {/* User Dashboard */}
      <UserDashboard
        isOpen={showDashboard}
        onClose={() => setShowDashboard(false)}
        userData={userData}
        codeHistory={codeHistory}
      />
    </div>
  );
}

export default App;