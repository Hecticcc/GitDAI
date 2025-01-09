import React from 'react';
import { CheckCircle, Copy, Check } from 'lucide-react';

interface CodeBlock {
  type: 'bash' | 'javascript';
  content: string;
}

interface SolutionMessageProps {
  message: string;
}

function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```(bash|javascript)\s*([\s\S]*?)\s*```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      type: match[1] as 'bash' | 'javascript',
      content: match[2].trim()
    });
  }

  return blocks;
}

function splitMessageParts(message: string): string[] {
  return message.split(/```(?:bash|javascript)[\s\S]*?```/).filter(Boolean).map(part => part.trim());
}

export function SolutionMessage({ message }: SolutionMessageProps) {
  const [copiedBlockIndex, setCopiedBlockIndex] = React.useState<number | null>(null);
  const codeBlocks = extractCodeBlocks(message);
  const textParts = splitMessageParts(message);

  const handleCopy = async (content: string, index: number) => {
    await navigator.clipboard.writeText(content);
    setCopiedBlockIndex(index);
    setTimeout(() => {
      setCopiedBlockIndex(null);
    }, 2000);
  };

  const renderCodeBlock = (block: CodeBlock, index: number) => {
    const isCopied = copiedBlockIndex === index;
    return (
      <div key={index} className="mt-3 relative">
        <div className="bg-[#2F3136] rounded-md overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-[#202225] border-b border-gray-700">
            <span className="text-sm font-medium text-gray-400">
              {block.type === 'bash' ? 'Install Command' : 'Updated Code'}
            </span>
            <button
              onClick={() => handleCopy(block.content, index)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
              title={`Copy ${block.type === 'bash' ? 'command' : 'code'}`}
            >
              {isCopied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="p-4 font-mono text-sm overflow-x-auto">
            <code className="text-gray-300 whitespace-pre">{block.content}</code>
          </div>
        </div>
      </div>
    );
  };

  const renderTextPart = (text: string, index: number) => {
    if (!text.trim()) return null;
    return (
      <div key={`text-${index}`} className="text-gray-100">
        {text}
      </div>
    );
  };

  const renderContent = () => {
    const content: JSX.Element[] = [];
    let blockIndex = 0;

    textParts.forEach((part, index) => {
      content.push(renderTextPart(part, index)!);
      if (codeBlocks[blockIndex]) {
        content.push(renderCodeBlock(codeBlocks[blockIndex], blockIndex));
        blockIndex++;
      }
    });

    // Add any remaining code blocks
    while (blockIndex < codeBlocks.length) {
      content.push(renderCodeBlock(codeBlocks[blockIndex], blockIndex));
      blockIndex++;
    }

    return content;
  };

  return (
    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-start space-x-3">
      <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-medium text-emerald-500 mb-1">Solution</div>
        <div className="space-y-4">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}