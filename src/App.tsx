import React from 'react';
import JSZip from 'jszip';
import { MessageCircle, Download, History, Bot, ChevronRight, Undo, X, Clock, Sparkles, Rocket } from 'lucide-react';
import { getChatResponse, extractCodeBlock, generatePackageJson, ModelType } from './lib/openai';
import { createPterodactylServer, testCreateServer, waitForInstallation } from './lib/pterodactyl';
import { AnimatedCode } from './components/AnimatedCode';
import { LoadingDots } from './components/LoadingDots';
import { SolutionMessage } from './components/SolutionMessage';

interface ChatMessage {
  type: 'user' | 'system';
  content: string;
  isSolution?: boolean;
}

interface CodeVersion {
  code: string;
  timestamp: Date;
  description: string;
}

export const DEFAULT_CODE = `// Your bot code will appear here
const Discord = require('discord.js');
const client = new Discord.Client();

client.on('ready', () => {
  console.log('Bot is ready!');
});
`;

const formatMessages = (messages: ChatMessage[]) => 
  messages.map(msg => ({
    role: msg.type === 'user' ? 'user' : 'assistant',
    content: msg.content
  }));

function App() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    { type: 'system', content: 'Welcome! I can help you create a Discord bot. The current bot has a Tic-tac-toe game command. What would you like to add?' }
  ]);
  const [input, setInput] = React.useState('');
  const [currentCode, setCurrentCode] = React.useState(DEFAULT_CODE);
  const [codeHistory, setCodeHistory] = React.useState<CodeVersion[]>([{
    code: DEFAULT_CODE,
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
  const chatRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, currentCode]);

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
      const response = await getChatResponse(formatMessages([...messages, userMessage]), model);
      const codeBlock = extractCodeBlock(response);
      
      if (codeBlock) {
        const newVersion: CodeVersion = {
          code: codeBlock,
          timestamp: new Date(),
          description: input.slice(0, 50) + (input.length > 50 ? '...' : '')
        };
        setCodeHistory(prev => [...prev.slice(0, historyIndex + 1), newVersion]);
        setHistoryIndex(prev => prev + 1);
        setCurrentCode(codeBlock);
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
        console.warn('No code block found, showing full response');
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
      setIsLoading(false); // API call is done
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
      {/* Header */}
      <header className="bg-[#23272A]/95 backdrop-blur-md border-b border-[#7289DA]/10 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 px-4 py-3">
            <div className="relative">
              <Bot className="w-8 h-8 text-[#7289DA]" />
              <div className="absolute inset-0 animate-ping-slow bg-[#7289DA] rounded-full opacity-20" />
            </div>
            <div className="relative">
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#7289DA] to-[#5865F2]">
                Discord Bot Builder
              </h1>
              <div className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-[#7289DA]/0 via-[#7289DA]/50 to-[#7289DA]/0" />
            </div>
          </div>
          <nav className="flex items-center px-4">
            <div className="flex items-center space-x-2 p-1 bg-[#2F3136]/50 backdrop-blur-md rounded-lg border border-white/5">
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-md hover:bg-[#7289DA]/10 transition-all duration-200"
            >
              <History className="w-5 h-5" />
              <span>History</span>
            </button>
            <button 
              onClick={handleRollback}
              disabled={historyIndex === 0}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md transition-all duration-200 ${
                historyIndex === 0 
                  ? 'text-gray-500 cursor-not-allowed' 
                  : 'hover:bg-[#7289DA]/10'
              }`}
              title={historyIndex === 0 ? 'No previous versions available' : 'Rollback to previous version'}
            >
              <Undo className="w-5 h-5" />
              <span>Rollback</span>
            </button>
            <button 
              onClick={handleDownload}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-md hover:bg-[#7289DA]/10 transition-all duration-200"
            >
              <Download className="w-5 h-5" />
              <span>Download</span>
            </button>
            </div>
          </nav>
        </div>
      </header>
      
      {/* History Panel */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#36393F] rounded-lg w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold flex items-center space-x-2">
                <Clock className="w-5 h-5" />
                <span>Code History</span>
              </h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {codeHistory.map((version, index) => (
                <button
                  key={index}
                  onClick={() => handleVersionSelect(index)}
                  className={`w-full text-left p-4 rounded-lg mb-2 transition-colors ${
                    index === historyIndex
                      ? 'bg-[#7289DA] text-white'
                      : 'bg-[#2F3136] hover:bg-[#40444B]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{version.description}</span>
                    <span className="text-sm opacity-75">
                      {version.timestamp.toLocaleString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-[95%] mx-auto p-4 flex flex-col lg:flex-row gap-6 h-[calc(100vh-4rem)]">
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
                    <span>Enhanced AI</span>
                    {useEnhancedAI && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                      </span>
                    )}
                  </button>
                  <button
                    onClick={async () => {
                      if (!botToken) {
                        setMessages(prev => [...prev, {
                          type: 'system',
                          content: 'Please add your bot token first by clicking the "Bot Token" button.',
                          isSolution: true
                        }]);
                        setShowTokenInput(true);
                        return;
                      }

                      if (isCreatingServer) return;

                      try {
                        setIsCreatingServer(true);
                        const serverName = `discord-bot-${Date.now()}`;
                        const server = await createPterodactylServer(
                          serverName,
                          'Discord bot server created via Bot Builder'
                        );
                        
                        const serverId = server.data.attributes.uuid || server.data.attributes.identifier;
                        
                        if (!serverId) {
                          throw new Error('Server ID not found in response');
                        }
                        
                        setMessages(prev => [...prev, {
                          type: 'system',
                          content: `Server created successfully. Waiting 90 seconds for installation...`
                        }]);

                        // Wait 90 seconds for server to initialize
                        await new Promise(resolve => setTimeout(resolve, 90000));
                        
                        setMessages(prev => [...prev, {
                          type: 'system',
                          content: 'Server installation complete. Uploading bot files...'
                        }]);

                        // Upload bot files
                        const files = [
                          {
                            path: 'bot.js',
                            content: currentCode
                          },
                          {
                            path: 'package.json',
                            content: generatePackageJson()
                          }
                        ];
                        
                        try {
                          const response = await fetch('/.netlify/functions/upload-files', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              serverId,
                              files
                            })
                          });

                          if (!response.ok) {
                            const error = await response.json();
                            throw new Error(error.error || 'Failed to upload files');
                          }
                          
                          const result = await response.json();
                          
                          if (!result.success) {
                            throw new Error('File upload failed');
                          }

                          setMessages(prev => [...prev, {
                            type: 'system',
                            content: `Successfully created and configured Pterodactyl server!\nServer ID: ${serverId}\nName: ${server.data.attributes.name}\nFiles uploaded: bot.js, package.json\nUpload results: ${result.results.map(r => `${r.path} (${r.success ? 'success' : 'failed'})`).join(', ')}`
                          }]);
                        } catch (error) {
                          throw new Error(`Failed to upload files: ${error.message}`);
                        }
                      } catch (error) {
                        setMessages(prev => [...prev, {
                          type: 'system',
                          content: `Failed to create Pterodactyl server: ${error instanceof Error ? error.message : 'Unknown error'}`,
                          isSolution: true
                        }]);
                      } finally {
                        setIsCreatingServer(false);
                      }
                    }}
                    disabled={isCreatingServer}
                    className={`group relative flex items-center space-x-2 px-3 py-1.5 text-sm rounded-md transition-all duration-200 bg-[#2F3136] ${
                      isCreatingServer
                        ? 'text-yellow-300'
                        : !botToken
                        ? 'text-gray-400 hover:bg-[#40444B]'
                        : 'text-gray-300 hover:bg-[#40444B]'
                    }`}
                  >
                    <Rocket className={`w-4 h-4 ${isCreatingServer ? 'animate-pulse' : ''}`} />
                    <span>{isCreatingServer ? 'Creating Server...' : 'Deploy to Pterodactyl'}</span>
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        setMessages(prev => [...prev, {
                          type: 'system',
                          content: 'Testing direct server creation...'
                        }]);
                        
                        const result = await testCreateServer();
                        setMessages(prev => [...prev, {
                          type: 'system',
                          content: `Test server created successfully!\nServer ID: ${result.attributes?.id || 'unknown'}`
                        }]);
                      } catch (error) {
                        setMessages(prev => [...prev, {
                          type: 'system',
                          content: `Test server creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                          isSolution: true
                        }]);
                      }
                    }}
                    className="group relative flex items-center space-x-2 px-3 py-1.5 text-sm rounded-md transition-all duration-200 bg-[#2F3136] text-gray-300 hover:bg-[#40444B]"
                  >
                    <Rocket className="w-4 h-4" />
                    <span>Test Server</span>
                  </button>
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
                      onClick={() => {
                        if (botToken.trim()) {
                          setIsTokenSaved(true);
                          setShowTokenInput(false);
                        }
                      }}
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

        {/* Preview Panel */}
        <div className="flex-1 bg-[#36393F] rounded-lg p-6 hidden lg:flex lg:flex-col min-w-0">
          <div className="flex items-center space-x-2 mb-4">
            <MessageCircle className="w-5 h-5 text-[#7289DA]" />
            <h2 className="text-lg font-semibold">Bot Preview</h2>
          </div>
          <div className="space-y-6 flex-1 min-h-0">
            <AnimatedCode code={currentCode} isLoading={isLoading} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;