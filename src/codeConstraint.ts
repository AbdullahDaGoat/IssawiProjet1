import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a constraint on student code
 */
interface CodeConstraint {
  type: string;                       // 'max', 'min', 'required', or 'forbidden'
  target: string;                     // e.g. 'if', 'for', 'while', 'recursion', 'function'
  value: number | string | boolean;   // can be numeric, string, or boolean
  message: string;                    // message to display if constraint is violated
}

interface ConstraintsConfig {
  constraints: CodeConstraint[];
}

/**
 * Analyzes Python code against defined constraints
 */
export async function checkCodeConstraints(folderPath: string): Promise<{ passed: boolean; violations: string[] }> {
  const mainPyPath = path.join(folderPath, 'main.py');
  const configPath = path.join(folderPath, 'test-config.json');
  
  // Results to return
  const result = { passed: true, violations: [] as string[] };
  
  try {
    // Read the main.py file
    const codeContent = fs.readFileSync(mainPyPath, 'utf8');
    
    // Read the test-config.json file
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    // Check if constraints are defined
    if (!config.constraints || !Array.isArray(config.constraints)) {
      return result; // No constraints => automatically passed
    }
    
    // Process each constraint
    for (const constraint of config.constraints) {
      const violation = evaluateConstraint(constraint, codeContent);
      if (violation) {
        result.violations.push(violation);
        result.passed = false;
      }
    }
    return result;
  } catch (error) {
    console.error('Error checking code constraints:', error);
    result.passed = false;
    result.violations.push(`Error checking constraints: ${error}`);
    return result;
  }
}

/**
 * Evaluates a single constraint against the code
 * Returns a violation message if constraint is not met, null otherwise
 */
function evaluateConstraint(constraint: CodeConstraint, code: string): string | null {
  switch (constraint.type) {
    case 'max':
      return checkMaxConstraint(constraint, code);
    case 'min':
      return checkMinConstraint(constraint, code);
    case 'required':
      return checkRequiredConstraint(constraint, code);
    case 'forbidden':
      return checkForbiddenConstraint(constraint, code);
    default:
      return `Unknown constraint type: ${constraint.type}`;
  }
}

function checkMaxConstraint(constraint: CodeConstraint, code: string): string | null {
  const count = countOccurrences(constraint.target, code);
  if (count > Number(constraint.value)) {
    return constraint.message ||
      `Code uses ${count} ${constraint.target} statements, but maximum allowed is ${constraint.value}.`;
  }
  return null;
}

function checkMinConstraint(constraint: CodeConstraint, code: string): string | null {
  const count = countOccurrences(constraint.target, code);
  if (count < Number(constraint.value)) {
    return constraint.message ||
      `Code uses only ${count} ${constraint.target} statements, but minimum required is ${constraint.value}.`;
  }
  return null;
}

function checkRequiredConstraint(constraint: CodeConstraint, code: string): string | null {
  if (typeof constraint.value === 'string') {
    // e.g. "value" must appear somewhere in code
    if (!code.includes(constraint.value)) {
      return constraint.message || `Code must include '${constraint.value}'.`;
    }
  } else {
    // e.g. recursion or something else
    if (constraint.target === 'recursion' && !detectRecursion(code)) {
      return constraint.message || 'Code must use recursion.';
    }
  }
  return null;
}

function checkForbiddenConstraint(constraint: CodeConstraint, code: string): string | null {
  if (typeof constraint.value === 'string') {
    if (code.includes(constraint.value)) {
      return constraint.message || `Code must not include '${constraint.value}'.`;
    }
  } else if (constraint.target === 'library') {
    // Check for forbidden library imports
    const importRegex = new RegExp(`import\\s+${constraint.value}|from\\s+${constraint.value}\\s+import`, 'g');
    if (importRegex.test(code)) {
      return constraint.message || `Using library '${constraint.value}' is not allowed.`;
    }
  }
  return null;
}

function countOccurrences(target: string, code: string): number {
  switch (target) {
    case 'if':
      // Count if statements, excluding 'elif'
      return (code.match(/\bif\s+/g) || []).length;
    case 'for':
      return (code.match(/\bfor\s+/g) || []).length;
    case 'while':
      return (code.match(/\bwhile\s+/g) || []).length;
    case 'function':
      // Count function definitions
      return (code.match(/\bdef\s+\w+\s*\(/g) || []).length;
    case 'class':
      // Count class definitions
      return (code.match(/\bclass\s+\w+/g) || []).length;
    case 'import':
      return (code.match(/\bimport\s+|from\s+\w+\s+import/g) || []).length;
    case 'comprehension':
      return (code.match(/\[[^[\]]*for[^[\]]*\]/g) || []).length +
             (code.match(/\{[^{}]*for[^{}]*\}/g) || []).length;
    case 'try':
      return (code.match(/\btry\s*:/g) || []).length;
    default:
      // For custom targets, just count word occurrences
      const regex = new RegExp(`\\b${target}\\b`, 'g');
      return (code.match(regex) || []).length;
  }
}

/** Basic recursion detection: function calls itself somewhere in its body. */
function detectRecursion(code: string): boolean {
  // Extract function names
  const functionMatches = code.match(/def\s+(\w+)\s*\(/g) || [];
  const functionNames = functionMatches.map(match => {
    const nameMatch = match.match(/def\s+(\w+)/);
    return nameMatch ? nameMatch[1] : '';
  }).filter(Boolean);

  // Check if any function calls itself
  for (const funcName of functionNames) {
    const callPattern = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
    const allCalls = code.match(callPattern) || [];
    // If there's more occurrences than the single definition, there's a call
    if (allCalls.length > 1) {
      return true;
    }

    // Also check if the function name appears inside its own definition block
    const defStart = code.indexOf(`def ${funcName}`);
    if (defStart >= 0) {
      let defEnd = code.indexOf('\ndef ', defStart + 1);
      if (defEnd < 0) {
        defEnd = code.length;
      }
      const functionBody = code.substring(defStart, defEnd);
      const bodyStart = functionBody.indexOf('\n') + 1;
      const body = functionBody.substring(bodyStart);
      if (body.includes(funcName)) {
        return true;
      }
    }
  }
  return false;
}
