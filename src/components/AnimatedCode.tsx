import React from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-core.js';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/themes/prism-tomorrow.css';
import { LoadingDots } from './LoadingDots';
import { DEFAULT_CODE } from '../App';
import { Terminal } from 'lucide-react';

interface AnimatedCodeProps {
  code: string;
  isLoading: boolean;
}

const CodeHeader = ({ isLoading }: { isLoading: boolean }) => (
  <div className="flex items-center justify-between px-4 py-3 bg-[#1A1B1E] border-b border-[#2F3136]">
    <div className="flex items-center space-x-3">
      <Terminal className="w-4 h-4 text-[#7289DA]" />
      <span className="text-sm font-medium text-gray-300">Generated Code</span>
      {isLoading && (
        <span className="px-2 py-0.5 text-xs font-medium bg-[#7289DA]/10 text-[#7289DA] rounded-full">
          Generating
        </span>
      )}
    </div>
    <div className="flex items-center space-x-1.5">
      <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
      <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
      <div className="w-3 h-3 rounded-full bg-[#28C840]" />
    </div>
  </div>
);

export function AnimatedCode({ code, isLoading }: AnimatedCodeProps) {
  const codeRef = React.useRef<HTMLPreElement>(null);

  React.useEffect(() => {
    if (codeRef.current) {
      const codeElement = codeRef.current.querySelector('code');
      if (codeElement) {
        codeElement.textContent = code || DEFAULT_CODE;
        Prism.highlightElement(codeElement);
      }
    }
  }, [code]);

  return (
    <div className="overflow-hidden rounded-lg border border-[#2F3136] bg-[#1A1B1E]">
      <CodeHeader isLoading={isLoading} />
      {isLoading && (
        <div className="absolute top-12 left-0 right-0 flex items-center justify-center space-x-3 p-4 bg-[#1A1B1E]/95 backdrop-blur-sm z-10">
          <LoadingDots />
          <span className="text-sm font-semibold text-[#7289DA] tracking-wide">
            Generating code<span className="opacity-75">...</span>
          </span>
        </div>
      )}
      <div className="relative">
        <pre
          ref={codeRef}
          className="text-sm text-gray-300 overflow-auto p-6 h-[calc(100vh-16rem)] font-mono"
        >
          <code className="language-javascript block" />
        </pre>
        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#1A1B1E] to-transparent pointer-events-none" />
      </div>
    </div>
  );
}