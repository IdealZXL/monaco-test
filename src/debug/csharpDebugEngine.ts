export type DebugStatus = "idle" | "running" | "paused" | "completed";

export type RuntimeValue = string | number | boolean | null;

export interface DebugFrame {
  name: string;
  line: number;
}

export interface DebugState {
  status: DebugStatus;
  code: string;
  breakpoints: number[];
  executableLines: number[];
  pointer: number;
  currentLine: number | null;
  variables: Record<string, RuntimeValue>;
  output: string[];
  callStack: DebugFrame[];
  lastEvent: string;
}

export const emptyDebugState: DebugState = {
  status: "idle",
  code: "",
  breakpoints: [],
  executableLines: [],
  pointer: 0,
  currentLine: null,
  variables: {},
  output: [],
  callStack: [],
  lastEvent: "调试器未启动"
};

export function startDebugSession(code: string, breakpoints: Set<number>): DebugState {
  const executableLines = findExecutableLines(code);
  const state: DebugState = {
    ...emptyDebugState,
    status: executableLines.length > 0 ? "running" : "completed",
    code,
    breakpoints: [...breakpoints].sort((a, b) => a - b),
    executableLines,
    currentLine: executableLines[0] ?? null,
    lastEvent: executableLines.length > 0 ? "调试会话已启动" : "没有可执行语句"
  };

  return runUntilBreakpoint(state, false);
}

export function pauseAtEntryDebugSession(code: string, breakpoints: Set<number>): DebugState {
  const executableLines = findExecutableLines(code);

  return {
    ...emptyDebugState,
    status: executableLines.length > 0 ? "paused" : "completed",
    code,
    breakpoints: [...breakpoints].sort((a, b) => a - b),
    executableLines,
    currentLine: executableLines[0] ?? null,
    callStack: executableLines[0] ? getCallStack(code, executableLines[0]) : [],
    lastEvent: executableLines.length > 0 ? "已在入口处暂停" : "没有可执行语句"
  };
}

export function continueDebugSession(state: DebugState): DebugState {
  if (state.status === "completed" || state.status === "idle") {
    return state;
  }

  return runUntilBreakpoint({ ...state, status: "running", lastEvent: "继续运行" }, true);
}

export function stepOverDebugSession(state: DebugState): DebugState {
  if (state.status === "completed" || state.status === "idle") {
    return state;
  }

  const nextState = executeCurrentLine({ ...state, status: "paused" });
  return updateCurrentPosition(nextState, "单步执行完成");
}

export function stopDebugSession(): DebugState {
  return {
    ...emptyDebugState,
    lastEvent: "调试会话已停止"
  };
}

function runUntilBreakpoint(state: DebugState, skipCurrentBreakpoint: boolean): DebugState {
  let nextState = state;
  const initialPointer = state.pointer;

  while (nextState.pointer < nextState.executableLines.length) {
    const lineNumber = nextState.executableLines[nextState.pointer];
    const isCurrentBreakpoint = nextState.breakpoints.includes(lineNumber);
    const shouldSkipBreakpoint = skipCurrentBreakpoint && nextState.pointer === initialPointer;

    if (isCurrentBreakpoint && !shouldSkipBreakpoint) {
      return {
        ...nextState,
        status: "paused",
        currentLine: lineNumber,
        callStack: getCallStack(nextState.code, lineNumber),
        lastEvent: `命中第 ${lineNumber} 行断点`
      };
    }

    nextState = executeCurrentLine(nextState);
  }

  return {
    ...nextState,
    status: "completed",
    currentLine: null,
    callStack: [],
    lastEvent: "程序执行完成"
  };
}

function executeCurrentLine(state: DebugState): DebugState {
  const lineNumber = state.executableLines[state.pointer];
  const line = getLine(state.code, lineNumber);
  const execution = executeLine(line, state.variables);

  return {
    ...state,
    pointer: state.pointer + 1,
    variables: execution.variables,
    output: execution.output ? [...state.output, execution.output] : state.output,
    callStack: getCallStack(state.code, lineNumber),
    currentLine: lineNumber,
    lastEvent: execution.event
  };
}

function updateCurrentPosition(state: DebugState, event: string): DebugState {
  if (state.pointer >= state.executableLines.length) {
    return {
      ...state,
      status: "completed",
      currentLine: null,
      callStack: [],
      lastEvent: "程序执行完成"
    };
  }

  const currentLine = state.executableLines[state.pointer];
  return {
    ...state,
    status: "paused",
    currentLine,
    callStack: getCallStack(state.code, currentLine),
    lastEvent: event
  };
}

function executeLine(
  rawLine: string,
  variables: Record<string, RuntimeValue>
): { variables: Record<string, RuntimeValue>; output?: string; event: string } {
  const line = rawLine.trim().replace(/;$/, "");
  const nextVariables = { ...variables };
  const writeLineMatch = line.match(/^Console\.WriteLine\((.*)\)$/);

  if (writeLineMatch) {
    const value = evaluateExpression(writeLineMatch[1], nextVariables);
    return {
      variables: nextVariables,
      output: formatValue(value),
      event: `输出 ${formatValue(value)}`
    };
  }

  const declarationMatch = line.match(
    /^(?:const\s+)?(?<type>var|bool|byte|char|decimal|double|float|int|long|string|DateTime|Guid)\s+(?<name>[A-Za-z_]\w*)(?:\s*=\s*(?<expression>.*))?$/
  );
  if (declarationMatch?.groups) {
    const { type, name, expression } = declarationMatch.groups;
    nextVariables[name] = expression ? evaluateExpression(expression, nextVariables) : defaultValueFor(type);
    return {
      variables: nextVariables,
      event: `声明变量 ${name}`
    };
  }

  const assignmentMatch = line.match(/^(?<name>[A-Za-z_]\w*)\s*=\s*(?<expression>.*)$/);
  if (assignmentMatch?.groups) {
    const { name, expression } = assignmentMatch.groups;
    nextVariables[name] = evaluateExpression(expression, nextVariables);
    return {
      variables: nextVariables,
      event: `更新变量 ${name}`
    };
  }

  const returnMatch = line.match(/^return(?:\s+(?<expression>.*))?$/);
  if (returnMatch?.groups?.expression) {
    return {
      variables: nextVariables,
      event: `返回 ${formatValue(evaluateExpression(returnMatch.groups.expression, nextVariables))}`
    };
  }

  return {
    variables: nextVariables,
    event: `执行第 ${line ? "一条" : "空"}语句`
  };
}

function evaluateExpression(expression: string, variables: Record<string, RuntimeValue>): RuntimeValue {
  const trimmed = expression.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\$"[\s\S]*"$/.test(trimmed)) {
    return trimmed
      .slice(2, -1)
      .replace(/\{([A-Za-z_]\w*)\}/g, (_, name: string) => formatValue(variables[name] ?? null));
  }

  if (/^"[\s\S]*"$/.test(trimmed)) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (trimmed === "null") {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (/^[A-Za-z_]\w*$/.test(trimmed) && Object.prototype.hasOwnProperty.call(variables, trimmed)) {
    return variables[trimmed];
  }

  const substituted = trimmed.replace(/\b[A-Za-z_]\w*\b/g, (name) => {
    if (name === "true" || name === "false" || name === "null") {
      return name;
    }

    if (Object.prototype.hasOwnProperty.call(variables, name)) {
      return JSON.stringify(variables[name]);
    }

    return name;
  });

  if (/^[\d\s+\-*/%().<>=!&|"'A-Za-z_]+$/.test(substituted)) {
    try {
      const value = Function(`"use strict"; return (${substituted});`)() as RuntimeValue;
      if (["string", "number", "boolean"].includes(typeof value) || value === null) {
        return value;
      }
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function defaultValueFor(type: string): RuntimeValue {
  if (type === "string" || type === "DateTime" || type === "Guid") {
    return "";
  }

  if (type === "bool") {
    return false;
  }

  return 0;
}

function findExecutableLines(code: string): number[] {
  return code
    .split("\n")
    .map((line, index) => ({ line: stripInlineComment(line).trim(), lineNumber: index + 1 }))
    .filter(({ line }) => isExecutableLine(line))
    .map(({ lineNumber }) => lineNumber);
}

function isExecutableLine(line: string): boolean {
  if (!line || line === "{" || line === "}" || line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
    return false;
  }

  if (/^(using|namespace|public\s+class|private\s+class|internal\s+class|class|else|try|catch|finally)\b/.test(line)) {
    return false;
  }

  if (/^(public|private|protected|internal|static|async|\s).*\)\s*\{?$/.test(line) && !line.startsWith("Console.")) {
    return false;
  }

  return true;
}

function getLine(code: string, lineNumber: number): string {
  return code.split("\n")[lineNumber - 1] ?? "";
}

function getCallStack(code: string, lineNumber: number): DebugFrame[] {
  const lines = code.split("\n");
  const frames: DebugFrame[] = [{ name: "Program", line: 1 }];
  const methodPattern = /\b(?:public|private|protected|internal|static|async|\s)+[\w<>\[\],\s]+\s+([A-Za-z_]\w*)\s*\(/;

  for (let index = 0; index < lineNumber; index++) {
    const methodName = lines[index].match(methodPattern)?.[1];
    if (methodName && !["if", "for", "foreach", "while", "switch", "catch"].includes(methodName)) {
      frames.unshift({ name: methodName, line: index + 1 });
    }
  }

  return frames.slice(0, 4);
}

function stripInlineComment(line: string): string {
  const commentIndex = line.indexOf("//");
  return commentIndex >= 0 ? line.slice(0, commentIndex) : line;
}

function formatValue(value: RuntimeValue): string {
  if (value === null) {
    return "null";
  }

  return String(value);
}
