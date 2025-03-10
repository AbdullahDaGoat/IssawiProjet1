import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { checkCodeConstraints } from './codeConstraint';

// You can keep this global context if needed for other operations.
(globalThis as any).context = undefined;

/**
 * Entry point for your extension.
 */
export async function activate(context: vscode.ExtensionContext) {
  (globalThis as any).context = context;

  // Create and show the status bar item.
  const runTestsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  runTestsStatusBarItem.text = '$(zap) Run Tests';
  runTestsStatusBarItem.tooltip = 'Run Tests (ics3)';
  runTestsStatusBarItem.command = 'extension.ics3';
  runTestsStatusBarItem.color = '#800080'; // purple
  runTestsStatusBarItem.show();
  context.subscriptions.push(runTestsStatusBarItem);

  // Hide JSON files in the explorer (workspace setting).
  const config = vscode.workspace.getConfiguration('files');
  const currentExcludes = config.get<{ [key: string]: boolean }>('exclude') || {};
  const newExcludes = {
    ...currentExcludes,
    '**/*.json': true
  };
  config.update('exclude', newExcludes, vscode.ConfigurationTarget.Workspace);

  // Register the primary command that opens the webview.
  const disposable = vscode.commands.registerCommand('extension.ics3', async () => {
    console.log("✅ 'Run Tests (ics3)' command was triggered!");
    vscode.window.showInformationMessage('Running Tests (ics3)...'); // UI feedback

    const panel = vscode.window.createWebviewPanel(
      'testWebview',
      'Test Student Work',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(context.extensionPath)]
      }
    );

    // Provide the webview content.
    panel.webview.html = getWebviewContent(context);

    // Auto-scan for folders when the webview is created.
    setTimeout(async () => {
      await handleScanFolders(panel);
    }, 500);

    // Listen for messages from the webview.
    panel.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case 'scanFolders':
          await handleScanFolders(panel);
          break;

        case 'folderSelected':
          await handleFolderSelected(panel, message.folder);
          break;

        case 'runIOTests':
          await handleRunIOTests(panel, message.folder);
          break;

        case 'runFunctionTests':
          await handleRunFunctionTests(panel, message.folder);
          break;

        case 'checkConstraints':
          await handleCheckConstraints(panel, message.folder);
          break;

        case 'openInstructions':
          {
            const folderPath: string = message.folder;
            const instructionsUri = vscode.Uri.file(path.join(folderPath, 'instructions.md'));
            vscode.commands.executeCommand('markdown.showPreview', instructionsUri);
          }
          break;
      }
    }, undefined, context.subscriptions);
  });

  context.subscriptions.push(disposable);
}

/**
 * Dispose resources if needed.
 */
export function deactivate() {
  // Optionally clean up
}

/* --------------------------------------------------------------------------
   HELPER FUNCTIONS
   -------------------------------------------------------------------------- */

/**
 * Utility to retrieve the Python interpreter path from user/workspace settings
 * or fall back to a default for the current platform.
 */
function getPythonPath(): string {
  const extensionConfig = vscode.workspace.getConfiguration('python-tester-extension');
  const userPythonPath = extensionConfig.get<string>('pythonPath');

  const pythonConfig = vscode.workspace.getConfiguration('python');
  const configuredPythonPath =
    pythonConfig.get<string>('defaultInterpreterPath') ||
    pythonConfig.get<string>('pythonPath');

  const defaultPythonPath = process.platform === 'darwin' ? 'python3' : 'python';
  const finalPath = userPythonPath || configuredPythonPath || defaultPythonPath;
  console.log(`Python path used: ${finalPath}`);
  return finalPath;
}

/**
 * Command handler: scans the workspace for all main.py files (excluding node_modules).
 */
async function handleScanFolders(panel: vscode.WebviewPanel) {
  const mainPyUris = await vscode.workspace.findFiles('**/main.py', '**/node_modules/**');
  const validFolders: string[] = [];

  for (const uri of mainPyUris) {
    const folderPath = path.dirname(uri.fsPath);
    const instructionsMdPath = path.join(folderPath, 'instructions.md');
    const instructionsUri = vscode.Uri.file(instructionsMdPath);

    try {
      // Check if instructions.md exists
      await vscode.workspace.fs.stat(instructionsUri);
      validFolders.push(folderPath);
    } catch {
      console.log(`Skipping ${folderPath}: No instructions.md found`);
    }
  }

  panel.webview.postMessage({ command: 'folderList', folders: validFolders });
}

/**
 * Command handler: reads test-config.json for the given folder, determines test type and constraints.
 */
async function handleFolderSelected(panel: vscode.WebviewPanel, folderPath: string) {
  const configFilePath = path.join(folderPath, 'test-config.json');
  const configUri = vscode.Uri.file(configFilePath);

  try {
    await vscode.workspace.fs.stat(configUri);
    const content = await vscode.workspace.fs.readFile(configUri);
    const json = JSON.parse(content.toString());
    panel.webview.postMessage({
      command: 'updateTestButton',
      testType: json.testType,
      hasConstraints: Array.isArray(json.constraints) && json.constraints.length > 0
    });
  } catch {
    // No test-config.json or testType
    panel.webview.postMessage({
      command: 'updateTestButton',
      testType: null,
      hasConstraints: false
    });
  }
}

/**
 * Command handler: checks code constraints from test-config.json in the specified folder.
 */
async function handleCheckConstraints(panel: vscode.WebviewPanel, folderPath: string) {
  try {
    const result = await checkCodeConstraints(folderPath);

    if (result.passed) {
      panel.webview.postMessage({
        command: 'constraintResults',
        status: 'passed',
        message: 'All code constraints passed! ✔'
      });
    } else {
      panel.webview.postMessage({
        command: 'constraintResults',
        status: 'failed',
        message: 'Code constraint violations found! ✘',
        violations: result.violations
      });
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error checking constraints: ${error}`);
    panel.webview.postMessage({
      command: 'constraintResults',
      status: 'error',
      message: `Error checking constraints: ${error}`
    });
  }
}

/**
 * Command handler: runs I/O tests from test-config.json in the specified folder.
 */
async function handleRunIOTests(panel: vscode.WebviewPanel, folderPath: string) {
  const configFilePath = path.join(folderPath, 'test-config.json');
  const configUri = vscode.Uri.file(configFilePath);

  try {
    // First, check code constraints if they exist
    await handleCheckConstraints(panel, folderPath);

    const content = await vscode.workspace.fs.readFile(configUri);
    const config = JSON.parse(content.toString());
    const tests = config.tests || [];

    let passedCount = 0;
    const totalTests = tests.length;

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      panel.webview.postMessage({
        command: 'testStatus',
        index: i + 1,
        status: 'running',
        message: `Running test ${i + 1}...`
      });
      await delay(400);

      try {
        const actualOutput = await runPythonTest(folderPath, test.input);
        if (actualOutput.trim() === test.expectedOutput.trim()) {
          passedCount++;
          panel.webview.postMessage({
            command: 'testStatus',
            index: i + 1,
            status: 'passed',
            message: `Test ${i + 1} passed ✔`
          });
        } else {
          panel.webview.postMessage({
            command: 'testStatus',
            index: i + 1,
            status: 'failed',
            message: `Test ${i + 1} failed ✘`,
            testInput: test.input,
            expectedOutput: test.expectedOutput,
            actualOutput: actualOutput
          });
        }
      } catch (err) {
        panel.webview.postMessage({
          command: 'testStatus',
          index: i + 1,
          status: 'failed',
          message: `Test ${i + 1} failed ✘`,
          testInput: test.input,
          expectedOutput: test.expectedOutput,
          actualOutput: String(err)
        });
      }
      await delay(99);
    }

    // No spreadsheet submission logic anymore; simply report final status
    if (passedCount === totalTests) {
      panel.webview.postMessage({
        command: 'submissionStatus',
        status: 'success',
        message: 'All tests passed!'
      });
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error reading config: ${error}`);
  }
}

/**
 * Command handler: runs function tests from test-config.json in the specified folder.
 * Compares both result and result type.
 */
async function handleRunFunctionTests(panel: vscode.WebviewPanel, folderPath: string) {
  const configFilePath = path.join(folderPath, 'test-config.json');
  const configUri = vscode.Uri.file(configFilePath);

  try {
    // First, check code constraints if they exist
    await handleCheckConstraints(panel, folderPath);

    const content = await vscode.workspace.fs.readFile(configUri);
    const config = JSON.parse(content.toString());
    const tests = config.tests || [];

    let passedCount = 0;
    const totalTests = tests.length;

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      panel.webview.postMessage({
        command: 'testStatus',
        index: i + 1,
        status: 'running',
        message: `Running test ${i + 1}...`
      });
      await delay(400);

      try {
        const outputJson = await runPythonFunctionTest(folderPath, test);
        const actualObj = JSON.parse(outputJson);
        const actualResult = actualObj.result;
        const actualType = actualObj.resultType;

        if (
          actualResult.toString().trim() === test.expectedResult.toString().trim() &&
          actualType.toLowerCase() === test.expectedType.toLowerCase()
        ) {
          passedCount++;
          panel.webview.postMessage({
            command: 'testStatus',
            index: i + 1,
            status: 'passed',
            message: `Test ${i + 1} passed ✔`
          });
        } else {
          panel.webview.postMessage({
            command: 'testStatus',
            index: i + 1,
            status: 'failed',
            message: `Test ${i + 1} failed ✘`,
            testInput: `Function: ${test.functionName}(${test.args.join(', ')})`,
            expectedOutput: `Expected: ${test.expectedResult} (${test.expectedType})`,
            actualOutput: `Got: ${actualResult} (${actualType})`
          });
        }
      } catch (err) {
        panel.webview.postMessage({
          command: 'testStatus',
          index: i + 1,
          status: 'failed',
          message: `Test ${i + 1} failed ✘`,
          testInput: `Function: ${test.functionName}(${test.args.join(', ')})`,
          expectedOutput: `Expected: ${test.expectedResult} (${test.expectedType})`,
          actualOutput: String(err)
        });
      }
      await delay(99);
    }

    // No spreadsheet submission logic anymore; simply report final status
    if (passedCount === totalTests) {
      panel.webview.postMessage({
        command: 'submissionStatus',
        status: 'success',
        message: 'All tests passed!'
      });
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error reading config: ${error}`);
  }
}

/* --------------------------------------------------------------------------
   PYTHON TEST RUNNERS
   -------------------------------------------------------------------------- */

/** Delay utility. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Runs main.py in the given folder with the provided input.
 * Returns a promise that resolves with captured stdout, or rejects on error.
 */
function runPythonTest(folder: string, input: string, timeout = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();
    const pythonProcess = spawn(pythonPath, ['main.py'], { cwd: folder });

    let output = '';
    let errorOutput = '';

    const timeoutId = setTimeout(() => {
      pythonProcess.kill();
      reject('Test timed out after ' + (timeout / 1000) + ' seconds');
    }, timeout);

    pythonProcess.stdout.on('data', data => {
      output += data.toString();
    });
    pythonProcess.stderr.on('data', data => {
      errorOutput += data.toString();
    });
    pythonProcess.on('close', code => {
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve(output);
      } else {
        reject(`Process exited with code ${code}\nError: ${errorOutput}`);
      }
    });

    // Provide the test input to main.py.
    pythonProcess.stdin.write(input);
    pythonProcess.stdin.end();
  });
}

/**
 * Runs a function test by importing main.py and calling a target function with arguments.
 */
function runPythonFunctionTest(folder: string, test: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonPath = getPythonPath();

    // Use JSON to encode arguments so we can handle lists/dicts more reliably.
    const serializedArgs = JSON.stringify(test.args || []);

    const inlineCode = `
import json
import sys
sys.path.insert(0, ".")
import main

args = json.loads('${serializedArgs}')
func = getattr(main, '${test.functionName}')
result = func(*args)
print(json.dumps({"result": result, "resultType": type(result).__name__}))
    `;
    const pythonProcess = spawn(pythonPath, ['-c', inlineCode], { cwd: folder });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', data => {
      output += data.toString();
    });
    pythonProcess.stderr.on('data', data => {
      errorOutput += data.toString();
    });
    pythonProcess.on('close', code => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(`Process exited with code ${code}\nError: ${errorOutput}`);
      }
    });
  });
}

/* --------------------------------------------------------------------------
   WEBVIEW CONTENT
   -------------------------------------------------------------------------- */
function getWebviewContent(context: vscode.ExtensionContext): string {
  const webviewPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'webview.html');
  const fileContent = fs.readFileSync(webviewPath.fsPath, 'utf-8');
  return fileContent;
}