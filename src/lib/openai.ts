import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { calculateTokenCost, TokenCalculation } from './tokenCalculator';

export type ModelType = 'gpt-3.5-turbo' | 'gpt-4';

const SYSTEM_PROMPT = `You are an expert Discord bot developer. Help users create Discord bots by generating clean, secure JavaScript code using discord.js v14+.

Current Features: None

ULTRA CRITICAL - CODE PRESERVATION RULES:
1. ABSOLUTE CODE PRESERVATION:
   - ALWAYS analyze the current code in user messages
   - NEVER start from scratch - ONLY ADD to existing code
   - NEVER remove ANY existing commands or features
   - NEVER modify existing command logic
   - NEVER change existing if/else blocks
   - NEVER delete or replace ANY existing code
   - ALWAYS add new commands AFTER existing ones
   - ALWAYS preserve ALL imports and event handlers
   - ALWAYS keep existing messageCreate structure
   - ALWAYS maintain existing command prefixes
   - ALWAYS preserve error handling
   - ALWAYS keep existing variables and functions
   - ALWAYS keep ALL existing command blocks intact
   - ALWAYS preserve ALL existing features
   - ALWAYS maintain ALL existing functionality

2. CRITICAL Code Block Format:
   - ALWAYS use this EXACT format:
     Here's the updated code:

     \`\`\`javascript
     // Your code here
     \`\`\`
   - Use consistent 2-space indentation
   - NO explanations or text after the code block
   - Preserve exact whitespace and newlines
   - Keep existing command structure intact

3. For new features, updates, or general questions:
   - Explain what's being added
   - Show complete code with new features ADDED to existing code
   - Keep all existing functionality intact
   - Format response as: "Adding [feature] to your bot. Here's the updated code:"
   - NEVER use "Error:" prefix unless there's an actual error

4. For errors:
   - Start response with "Error:" or "Error Detected:"
   - Explain what caused the error
   - Show how to fix it
   - Include the complete working code that preserves all features

5. Discord.js v14+ Requirements:
   - Import statement: const { Client, GatewayIntentBits } = require('discord.js');
   - Client initialization:
     const client = new Client({ 
       intents: [
         GatewayIntentBits.Guilds,
         GatewayIntentBits.GuildMessages,
         GatewayIntentBits.MessageContent
       ]
     });

6. Intent Requirements:
   - Always use GatewayIntentBits (never Intents.FLAGS)
   - Include MessageContent intent when working with messages
   - Preserve existing intents when adding new ones
   - Add GuildMembers intent for member-related commands
   - Add VoiceState intent for voice commands
   - NEVER remove existing intents when adding new ones

7. Error Handling:
   - Include try/catch blocks for all API calls
   - Add proper error messages for users
   - Handle edge cases and invalid inputs
   
8. ULTRA CRITICAL Command Structure Rules:
   - NEVER modify existing command blocks
   - NEVER change command order
   - NEVER remove command handlers
   - NEVER delete ANY existing code
   - NEVER replace ANY existing commands
   - NEVER modify ANY existing features
   - ALWAYS add new commands as separate if/else blocks
   - ALWAYS place new commands AFTER existing ones
   - ALWAYS preserve existing command prefixes
   - ALWAYS maintain existing command structure
   - ALWAYS keep ALL existing command functionality
   - ALWAYS preserve ALL existing code blocks
   - ALWAYS keep ALL existing command logic
   - ALWAYS maintain ALL existing imports

9. Voice Command Requirements:
   - Add VoiceState intent when needed
   - Keep existing voice commands intact
   - Add new voice features after existing ones
   - Preserve ALL existing voice functionality
   - Include proper voice connection handling
   - Add error handling for voice states
   - Never remove existing voice commands

REMEMBER: Your task is to ADD features while preserving ALL existing code!
ULTRA CRITICAL: NEVER remove or replace ANY existing code, commands, or features!
ABSOLUTE RULE: ALWAYS preserve ALL existing functionality when adding new features!`;

const DEBUG = true;

interface ChatResponse {
  content: string;
  tokenCost?: TokenCalculation;
}

interface DebugInfo {
  stage: string;
  data: unknown;
}

function debug(info: DebugInfo) {
  if (DEBUG) {
    console.group(`🔍 Debug: ${info.stage}`);
    console.log(info.data);
    console.groupEnd();
  }
}

export async function getChatResponse(messages: ChatCompletionMessageParam[], model: ModelType = 'gpt-3.5-turbo'): Promise<ChatResponse> {
  try {
    debug({ stage: 'Request Messages', data: messages });
    
    // Calculate potential token cost first
    const lastMessage = messages[messages.length - 1];
    const estimatedTokens = lastMessage.content.length / 4; // Rough estimate
    const estimatedCost = calculateTokenCost(lastMessage.content, model === 'gpt-4');
    
    debug({ stage: 'Estimated Cost', data: estimatedCost });

    // Validate API key
    if (!import.meta.env.VITE_OPENAI_API_KEY?.startsWith('sk-')) {
      throw new Error('Invalid API key format');
    }

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        // Add a reminder message to preserve code
        { role: 'system', content: 'IMPORTANT: When you see "Current code:" in a message, that is the existing bot code. You must preserve ALL existing functionality and add new features to it. NEVER replace the entire code.' },
        ...messages,
      ],
      temperature: 0.5,
      max_tokens: 2048,
    };

    debug({ stage: 'Request Body', data: requestBody });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      debug({ stage: 'API Error', data: error });
      
      // Handle specific API errors
      if (error.error?.code === 'context_length_exceeded') {
        throw new Error('The conversation is too long. Please start a new one.');
      } else if (error.error?.code === 'rate_limit_exceeded') {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      } else if (error.error?.type === 'invalid_request_error') {
        throw new Error('Invalid request. Please check your input and try again.');
      }
      
      throw new Error(error.error?.message || 'Failed to get response from ChatGPT');
    }

    const data = await response.json();
    debug({ stage: 'API Response', data: data });
    const content = data.choices[0].message.content;
    const codeBlock = extractCodeBlock(content);
    
    // Calculate actual token cost based on response
    const actualTokens = content.length / 4; // Rough estimate
    const tokenCost = {
      ...estimatedCost,
      totalCost: Math.max(estimatedCost.totalCost, actualTokens)
    };

    debug({ stage: 'Token Cost', data: tokenCost });

    return {
      content,
      tokenCost
    };
  } catch (error) {
    console.error('OpenAI API Error:', error);
    if (error instanceof Error) {
      // Preserve specific error messages
      throw error;
    } else {
      throw new Error('Failed to generate response. Please try again.');
    }
  }
}

export function extractCodeBlock(text: string): string | null {
  debug({ stage: 'Extract Input', data: text });

  // First try strict format
  let codeBlockRegex = /```javascript\s*([\s\S]*?)\s*```/;
  let match = text.match(codeBlockRegex);
  
  // If no match, try more lenient format
  if (!match) {
    codeBlockRegex = /```(?:javascript|js)?\s*([\s\S]*?)\s*```/;
    match = text.match(codeBlockRegex);
  }

  debug({ 
    stage: 'JavaScript Block Match', 
    data: { pattern: codeBlockRegex, match }
  });
  
  if (!match) {
    debug({ 
      stage: 'Extraction Failed', 
      data: { text, reason: 'No code block found' }
    });
    return null;
  }

  debug({ stage: 'Raw Match', data: match });
  
  // Clean up the code block by removing extra newlines at start/end
  const code = match[1].trim();
  console.log('Successfully extracted code block');
  return code;
}

export function generatePackageJson(): string {
  return JSON.stringify({
    "name": "discord-bot",
    "version": "1.0.0",
    "description": "A Discord bot generated with Discord Bot Builder",
    "main": "bot.js",
    "scripts": {
      "start": "node bot.js"
    },
    "dependencies": {
      "discord.js": "^14.14.1",
      "dotenv": "^16.4.5"
    },
    "engines": {
      "node": ">=16.9.0"
    }
  }, null, 2);
}

const DEFAULT_CODE = `// Your bot code will appear here
const { Client, GatewayIntentBits } = require('discord.js');

// Define the required intents for the bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,           // For guild-related events
    GatewayIntentBits.GuildMessages,    // To listen to messages
    GatewayIntentBits.MessageContent,   // To read message content
    GatewayIntentBits.GuildMembers      // To interact with members
  ]
});

// Bot token setup
const TOKEN = 'TOKEN_HERE';

client.on('ready', () => {
  console.log('Bot is ready!');
});

client.login(TOKEN);
`;

export function getDefaultCode(): string {
  return DEFAULT_CODE;
}

const formatMessages = (messages: ChatMessage[]) => 
  messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

export function updateBotToken(code: string, token: string): string {
  // If code doesn't exist yet, use default code with the token
  if (!code || code === DEFAULT_CODE) {
    return DEFAULT_CODE.replace(/['"]TOKEN_HERE['"]/, `'${token}'`)
      .replace(/const \{ Client,/, 'const { Client, GatewayIntentBits } = require(\'discord.js\');');
  }

  // Look for existing token in different formats
  const tokenPatterns = [
    /const TOKEN\s*=\s*['"]([^'"]*)['"]/,
    /client\.login\(['"]([^'"]*)['"]\)/,
    /token:\s*['"]([^'"]*)['"]/,
    /['"]TOKEN_HERE['"]/
  ];

  let updatedCode = code;
  let tokenFound = false;

  // Ensure proper imports and intents
  if (!updatedCode.includes('GatewayIntentBits')) {
    updatedCode = updatedCode
      .replace(/const \{ Client[^}]*\}/, 'const { Client, GatewayIntentBits }')
      .replace(/new Client\(\)/, `new Client({
  intents: [
    GatewayIntentBits.Guilds,           // For guild-related events
    GatewayIntentBits.GuildMessages,    // To listen to messages
    GatewayIntentBits.MessageContent,   // To read message content
    GatewayIntentBits.GuildMembers      // To interact with members
  ]
})`);
  }

  // Try to replace existing token
  for (const pattern of tokenPatterns) {
    if (pattern.test(updatedCode)) {
      updatedCode = updatedCode.replace(pattern, (match) => 
        match.replace(/['"]([^'"]*)['"]/g, `'${token}'`));
      tokenFound = true;
    }
  }

  // If no token was found, add it before client.login()
  if (!tokenFound) {
    if (updatedCode.includes('client.login')) {
      // Check if we need to add the token declaration
      if (!updatedCode.includes('const TOKEN')) {
        // Add token before login
        updatedCode = updatedCode.replace(
          /client\.login\([^)]*\)/,
          `const TOKEN = '${token}';\n\nclient.login(TOKEN)`
        );
      }
    } else {
      // Add token and login at the end
      updatedCode = `${updatedCode.trim()}\n\nconst TOKEN = '${token}';\nclient.login(TOKEN);\n`;
    }
  }

  return updatedCode;
}