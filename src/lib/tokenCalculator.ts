interface TokenCosts {
  base: number;
  linesOfCode: number;
  nestedLevels: number;
  functions: number;
  classes: number;
  dbOperations: number;
  apiEndpoints: number;
  imports: number;
  comments: number;
  errorHandling: number;
  optimizations: number;
  security: number;
}

export interface TokenCalculation {
  totalCost: number;
  breakdown: TokenCosts;
  isEnhancedAI?: boolean;
}

const TOKEN_COSTS: TokenCosts = {
  base: 50,
  linesOfCode: 2,
  nestedLevels: 5,
  functions: 8,
  classes: 15,
  dbOperations: 10,
  apiEndpoints: 20,
  imports: 3,
  comments: 1,
  errorHandling: 5,
  optimizations: 10,
  security: 15
};

export function calculateTokenCost(code: string, isEnhancedAI: boolean = false): TokenCalculation {
  const lines = code.split('\n');
  let nestingLevel = 0;
  let maxNestingLevel = 0;
  
  const breakdown: TokenCosts = {
    base: TOKEN_COSTS.base,
    linesOfCode: 0,
    nestedLevels: 0,
    functions: 0,
    classes: 0,
    dbOperations: 0,
    apiEndpoints: 0,
    imports: 0,
    comments: 0,
    errorHandling: 0,
    optimizations: 0,
    security: 0
  };

  // Count lines of code (excluding empty lines)
  breakdown.linesOfCode = lines.filter(line => line.trim().length > 0).length * TOKEN_COSTS.linesOfCode;

  // Process each line
  lines.forEach(line => {
    const trimmedLine = line.trim();

    // Count imports
    if (trimmedLine.startsWith('import ') || trimmedLine.startsWith('require(')) {
      breakdown.imports += TOKEN_COSTS.imports;
    }

    // Count comments
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
      breakdown.comments += TOKEN_COSTS.comments;
    }

    // Count functions
    if (trimmedLine.includes('function') || trimmedLine.match(/=>\s*{/)) {
      breakdown.functions += TOKEN_COSTS.functions;
    }

    // Count classes
    if (trimmedLine.startsWith('class ')) {
      breakdown.classes += TOKEN_COSTS.classes;
    }

    // Count database operations
    if (
      trimmedLine.includes('.query(') ||
      trimmedLine.includes('.findOne(') ||
      trimmedLine.includes('.find(') ||
      trimmedLine.includes('.update(') ||
      trimmedLine.includes('.delete(')
    ) {
      breakdown.dbOperations += TOKEN_COSTS.dbOperations;
    }

    // Count API endpoints
    if (
      trimmedLine.includes('.get(') ||
      trimmedLine.includes('.post(') ||
      trimmedLine.includes('.put(') ||
      trimmedLine.includes('.delete(') ||
      trimmedLine.includes('fetch(')
    ) {
      breakdown.apiEndpoints += TOKEN_COSTS.apiEndpoints;
    }

    // Count error handling
    if (trimmedLine.includes('try {') || trimmedLine.includes('catch (')) {
      breakdown.errorHandling += TOKEN_COSTS.errorHandling;
    }

    // Count security implementations
    if (
      trimmedLine.includes('.authenticate') ||
      trimmedLine.includes('.authorize') ||
      trimmedLine.includes('verify') ||
      trimmedLine.includes('validate')
    ) {
      breakdown.security += TOKEN_COSTS.security;
    }

    // Track nesting level
    if (trimmedLine.includes('{')) {
      nestingLevel++;
      maxNestingLevel = Math.max(maxNestingLevel, nestingLevel);
    }
    if (trimmedLine.includes('}')) {
      nestingLevel--;
    }
  });

  // Calculate nesting cost
  breakdown.nestedLevels = maxNestingLevel * TOKEN_COSTS.nestedLevels;

  // Calculate total cost
  const totalCost = Object.values(breakdown).reduce((sum, cost) => sum + cost, 0);

  // Apply enhanced AI multiplier if enabled
  const finalCost = isEnhancedAI ? Math.ceil(totalCost * 2.5) : totalCost;

  return {
    totalCost: finalCost,
    breakdown,
    isEnhancedAI
  };
}