import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export type ModelType = 'gpt-3.5-turbo' | 'gpt-4';

const SYSTEM_PROMPT = `You are an expert Discord bot developer. Help users create Discord bots by generating clean, secure JavaScript code using discord.js v14+.

Current Features:
- Tic-tac-toe game (!tictactoe @opponent)

CRITICAL: When responding to user requests:
1. ABSOLUTELY CRITICAL Code Preservation Rules:
   - ALWAYS analyze the current code in user messages
   - NEVER generate fresh code - only modify existing code
   - Keep ALL existing features and commands intact
   - Add new features INSIDE the existing messageCreate event handler
   - NEVER remove or replace existing if/else blocks
   - Place new command handlers after existing ones
   - Preserve ALL existing imports, intents, and event handlers

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

7. Error Handling:
   - Include try/catch blocks for all API calls
   - Add proper error messages for users
   - Handle edge cases and invalid inputs
   
8. Command Structure:
   - Keep existing command checks (if/else blocks)
   - Add new commands as additional if blocks
   - Maintain command order
   - Never remove existing commands

REMEMBER: NEVER replace or remove existing commands - only ADD new ones!`;

const DEBUG = true;

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

export async function getChatResponse(messages: ChatCompletionMessageParam[], model: ModelType = 'gpt-3.5-turbo') {
  try {
    debug({ stage: 'Request Messages', data: messages });

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
    debug({ stage: 'Response Content', data: data.choices[0].message.content });
    return data.choices[0].message.content;
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