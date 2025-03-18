# ICS3 Student Tester Extension

**Purpose**  
This extension streamlines the process of testing student Python assignments (with `main.py`) against specified criteria. It provides a visual interface to:
1. List all folders in the workspace containing a `main.py` and an `instructions.md`.
2. Run either Input/Output tests or function-based tests.
3. Check the student code against configurable “code constraints” (e.g., maximum usage of `if` statements, forbidden libraries, etc.).

Once the extension is activated, it displays a user-friendly webview for teachers and students to see detailed test results.

---

## Table of Contents

1. [Folder Structure](#folder-structure)  
2. [Installation & Building](#installation--building)  
    - [Prerequisites](#prerequisites)  
    - [Build Steps](#build-steps)  
    - [Installation](#installation)  
3. [Extension Overview](#extension-overview)  
    - [Key Files](#key-files)  
    - [How It Works Internally](#how-it-works-internally)  
4. [Configuration Files](#configuration-files)  
    - [test-config.json](#test-configjson)  
    - [Constraints Configuration](#constraints-configuration)  
5. [Using the Extension](#using-the-extension)  
    - [Step-by-Step Usage](#step-by-step-usage)  
    - [Running Input/Output Tests](#running-inputoutput-tests)  
    - [Running Function Tests](#running-function-tests)  
    - [Checking Code Constraints](#checking-code-constraints)  
6. [Customizing Constraints](#customizing-constraints)  
7. [Asking for Additional Constraints](#asking-for-additional-constraints)  
8. [Tips for Production Use](#tips-for-production-use)  
9. [Troubleshooting](#troubleshooting)  
10. [Follow-Up Questions](#follow-up-questions)

---

## Folder Structure

A typical directory layout for this extension looks like this:

```
.vscode/               # VS Code settings folder
node_modules/          # Node modules (managed by pnpm)
resources/
  └─ webview.html      # The webview UI displayed in VS Code
src/
  ├─ codeConstraint.ts # Code constraints handling logic
  ├─ extension.ts      # Main extension entry point
  └─ ...
build-and-install.sh   # (Optional) shell script to build & install the extension
CHANGELOG.md
esbuild.js             # Script used by pnpm to bundle the extension
eslint.config.mjs      # ESLint config
LICENSE.md
package.json
pnpm-lock.yaml
README.md
vsc-extension-quickstart.md
```

**Key points:**
- The `resources/webview.html` file defines the user interface for the teacher or student to see and run tests.
- The main logic of the extension is in `src/extension.ts` (extension activation, message handling) and `src/codeConstraint.ts` (checking constraints).
- `test-config.json` is expected in each student’s project folder alongside `main.py` and `instructions.md`.

---

## Installation & Building

### Prerequisites
- **Node.js** (preferably LTS or latest)  
- **pnpm** (instead of npm or yarn)  
- **VS Code** installed locally

### Build Steps
1. **Clone or Download** this repository into your local environment.
2. **Open** the folder in VS Code.
3. **Install dependencies**:  
   ```bash
   pnpm install
   ```
4. **Build** the extension:  
   ```bash
   pnpm build
   ```
   This runs `esbuild.js` internally to compile TypeScript sources into JavaScript in the `dist` folder (or wherever configured).

### Installation
After building, you have two ways to install:
1. **Using `build-and-install.sh`**:  
   - Make it executable if needed:  
     ```bash
     chmod +x build-and-install.sh
     ```
   - Run the script, which will build the extension and then install it:
     ```bash
     ./build-and-install.sh
     ```
   This typically involves creating a VSIX file and then installing it into VS Code.

2. **Manual Packaging**:  
   - Use the [VS Code CLI](https://code.visualstudio.com/docs/editor/extension-marketplace#_command-line-extension-management) to package the extension into a `.vsix`.  
   - Then install the `.vsix` by running:
     ```bash
     code --install-extension your-extension.vsix
     ```

Once installed, reload VS Code to ensure the extension is active.

---

## Extension Overview

### Key Files

- **`src/extension.ts`**  
  Manages activation of the extension, creation of the webview panel, scanning for `main.py`, reading `test-config.json`, and orchestrating the test routines.

- **`src/codeConstraint.ts`**  
  Contains logic to parse and evaluate code constraints (e.g., “use recursion at least once”, “no more than 3 `if` statements”).

- **`resources/webview.html`**  
  The HTML/JS/CSS for the interface that appears in VS Code. Lets users:
  - Select a Python project folder containing `main.py`.
  - View Code Constraint Check results.
  - View test results (Passed/Failed counters, details of each test).

- **`test-config.json`** (Per student project folder)  
  Defines which tests to run and any code constraints that should be enforced.

### How It Works Internally

1. **Extension Activation**:  
   When the user triggers the command (“Run Tests (ics3)”), `extension.ts` opens a webview (`testWebview`).

2. **Webview Initialization**:  
   The webview immediately sends a message (`scanFolders`) to find all folders containing:
   - `main.py`
   - `instructions.md`

3. **Folder Selection**:  
   The user selects a folder in the dropdown. The extension reads `test-config.json` in that folder to figure out:
   - The type of tests: `io` (Input/Output) or `function`.
   - Code constraints (if any).

4. **Constraints Check**:  
   If constraints are defined, `src/codeConstraint.ts` checks the `main.py` for constraint violations.

5. **Test Execution**:  
   - For **Input/Output** tests, the extension spawns `main.py` in a child process, sending each test’s input lines. It captures and compares the output to `expectedOutput`.
   - For **Function** tests, the extension runs a small snippet in memory that imports `main.py` and calls the specified function with test arguments, comparing the return value and type.

6. **Results Display**:  
   Results appear in the webview, showing each test’s status (Running, Passed, or Failed) along with helpful messages and details such as the input, expected output, and actual output.

---

## Configuration Files

### `test-config.json`
This file resides in the same folder as the student’s `main.py` and `instructions.md`. Its structure typically looks like:
```json
{
  "testType": "io", 
  "constraints": [
    {
      "type": "max",
      "target": "if",
      "value": 3,
      "message": "Too many 'if' statements!"
    }
  ],
  "tests": [
    {
      "input": "5\n10\n",
      "expectedOutput": "15"
    },
    {
      "input": "2\n2\n",
      "expectedOutput": "4"
    }
  ]
}
```

- **`testType`**  
  - `"io"` (Input/Output-based tests)  
  - `"function"` (Function-based tests)
- **`constraints`**  
  - An array of objects representing code constraints. [See details below.](#constraints-configuration)
- **`tests`**  
  - An array of test cases. For I/O tests, each object might have `input` and `expectedOutput`.  
  - For function tests, each might have `functionName`, `args`, `expectedResult`, and `expectedType`.

### Constraints Configuration

A single constraint has this shape:
```json
{
  "type": "max" | "min" | "required" | "forbidden",
  "target": "if" | "for" | "recursion" | "library" | ...,
  "value": ...,
  "message": "Descriptive error message"
}
```

1. **`type`:**  
   - `max`: The code should not exceed the specified count for `target`.  
   - `min`: The code should meet at least the specified count for `target`.  
   - `required`: Some feature/string must appear in the code (like recursion).  
   - `forbidden`: Some feature/string must not appear in the code (like a library).

2. **`target`:**  
   - Common tokens: `if`, `for`, `while`, `function`, `class`, `recursion`, `import`, etc.  
   - You can also specify `'library'` and set `value` to a library name (e.g. `math`) to forbid that import.

3. **`value`:**  
   - Numeric for `max` / `min`.  
   - A string for `required` / `forbidden` (like `import math`).  
   - Or boolean in certain advanced cases.

4. **`message`:**  
   - Optional custom message displayed when a constraint fails.

For example, to **require recursion** and **forbid the `random` library**:
```json
{
  "constraints": [
    {
      "type": "required",
      "target": "recursion",
      "value": true,
      "message": "Must use recursion at least once."
    },
    {
      "type": "forbidden",
      "target": "library",
      "value": "random",
      "message": "The 'random' library is not allowed."
    }
  ]
}
```

---

## Using the Extension

### Step-by-Step Usage

1. **Open** VS Code with your teaching environment where the students’ project folders exist.
2. **Run** the `Run Tests (ics3)` command from the Command Palette (or by clicking on the purple “Run Tests” icon in the status bar).
3. A **webview** titled **“Test Student Work”** appears.
4. The extension **automatically scans** for folders containing `main.py` + `instructions.md`.
5. **Select** one of the discovered folders in the drop-down menu.
6. The extension checks for `test-config.json` in that folder. If found:
   - It updates the **“Run Tests”** button label (e.g., “Run Input/Output Tests” or “Run Function Tests”).
   - It also tries to load any constraints.

### Running Input/Output Tests
If `testType` is `"io"`, each test object in `test-config.json` must define:
```json
{
  "input": "Lines of input here...\n",
  "expectedOutput": "Expected lines of output..."
}
```
1. Click **Run Input/Output Tests**.
2. The extension spawns `main.py`, feeds each `input` to `stdin`, and compares the program’s output to `expectedOutput`.
3. See the results in the webview:
   - **Running** → **Passed** / **Failed**  
   - If failed, you get details on the mismatch.

### Running Function Tests
If `testType` is `"function"`, each test object might look like:
```json
{
  "functionName": "addNumbers",
  "args": [5, 10],
  "expectedResult": 15,
  "expectedType": "int"
}
```
1. Click **Run Function Tests**.
2. The extension spawns a Python process, imports `main.py`, and calls `addNumbers(5, 10)`.
3. It checks whether the return value and return type match (`15` and `int`).
4. You see pass/fail details in the same manner.

### Checking Code Constraints
Any time tests run, the extension also checks constraints by default. A **“Code Constraint Check”** section displays:
- **Passed** if no constraints are violated.
- **Failed** if constraints are violated, along with a bullet list of which constraints were broken.

If you only want to check constraints (without running tests), you can have the extension call the `checkConstraints` command manually. In the current UI, constraints automatically display when you select a folder or run tests.

---

## Customizing Constraints

To add or modify constraints, open the `test-config.json` in the student’s project folder and edit the `constraints` array. Some example constraints:

```json
{
  "type": "max",
  "target": "if",
  "value": 2,
  "message": "No more than 2 if statements allowed."
},
{
  "type": "required",
  "target": "recursion",
  "value": true,
  "message": "Must use recursion!"
}
```

---

## Asking for Additional Constraints

If you need any additional or more sophisticated constraints, you can:
1. Open `test-config.json`.
2. Add a new entry in the `constraints` array, describing what you want.  
3. If you’re unsure how to craft that constraint, you can simply ask in a natural language form. For instance:  
   *“I want a constraint that forbids usage of the `print` function.”*  
4. Ask ChatGPT (or any generative tool) specifically:  
   > “Provide me a constraint object that forbids the usage of `print` in codeConstraint.ts.”  

Then copy that JSON snippet into the `constraints` array.

---

## Tips for Production Use

1. **Lock Down Python Interpreter**  
   If you’re grading multiple students, ensure your environment uses the correct Python version by configuring `python-tester-extension.pythonPath` or the `python.defaultInterpreterPath` in VS Code settings.

2. **Workspace Organization**  
   Place each student’s assignment in a separate subfolder containing `main.py`, `instructions.md`, and `test-config.json`.

3. **Timeout & Error Handling**  
   The extension kills a Python process if it takes too long (5 seconds by default). Increase or decrease as needed in `src/extension.ts` if you have especially slow or large programs.

4. **Constraint Tuning**  
   Constraints can be broad or precise. Always confirm the `target` and `type` you set matches your intention (e.g., `recursion` detection has some logic in `detectRecursion(code)`).

---

## Troubleshooting

- **No folders listed**:  
  The extension only lists folders containing both `main.py` and `instructions.md`. Make sure these exist in the same folder.
- **No `test-config.json`**:  
  The extension defaults to no constraints and tries to run Input/Output tests. If that’s not correct, create a `test-config.json`.
- **Tests not passing**:  
  Check if your script’s output includes extra prompts or spacing. The extension compares raw `stdout` lines to the `expectedOutput`.
- **Function not found**:  
  Ensure the function name in your `functionName` property actually exists in `main.py`.
- **Constraint not recognized**:  
  Confirm that you’re using correct `type` and `target` strings (`max`, `min`, `required`, `forbidden`, etc.).
