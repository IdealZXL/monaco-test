import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
import { configureMonaco, monaco } from "./monaco/configureMonaco";
import { updateCSharpDiagnostics } from "./monaco/csharpLanguage";
import {
  continueDebugSession,
  DebugState,
  emptyDebugState,
  pauseAtEntryDebugSession,
  startDebugSession,
  stepOverDebugSession,
  stopDebugSession
} from "./debug/csharpDebugEngine";

const initialCode = `using System;

namespace MonacoDemo
{
    public class Program
    {
        public static void Main(string[] args)
        {
            string name = "Monaco";
            int count = 3;

            Console.WriteLine($"Hello {name}");
            count = count + 1;
            Console.WriteLine(count);
        }
    }
}`;

function App() {
  const [code, setCode] = useState(initialCode);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(() => new Set([12]));
  const [debugState, setDebugState] = useState<DebugState>(emptyDebugState);
  const [markerCount, setMarkerCount] = useState(0);

  const sortedBreakpoints = useMemo(() => [...breakpoints].sort((a, b) => a - b), [breakpoints]);

  const toggleBreakpoint = useCallback((lineNumber: number) => {
    setBreakpoints((current) => {
      const next = new Set(current);
      if (next.has(lineNumber)) {
        next.delete(lineNumber);
      } else {
        next.add(lineNumber);
      }
      return next;
    });
  }, []);

  const runOrContinue = useCallback(() => {
    setDebugState((current) => {
      if (current.status === "paused") {
        return continueDebugSession(current);
      }

      return startDebugSession(code, breakpoints);
    });
  }, [breakpoints, code]);

  const stepOver = useCallback(() => {
    setDebugState((current) => {
      const activeState =
        current.status === "idle" || current.status === "completed"
          ? pauseAtEntryDebugSession(code, breakpoints)
          : current;
      return stepOverDebugSession(activeState);
    });
  }, [breakpoints, code]);

  const restart = useCallback(() => {
    setDebugState(startDebugSession(code, breakpoints));
  }, [breakpoints, code]);

  const stop = useCallback(() => {
    setDebugState(stopDebugSession());
  }, []);

  return (
    <main className="appShell">
      <header className="hero">
        <div>
          <p className="eyebrow">Monaco + C#</p>
          <h1>C# 智能编辑器</h1>
          <p>
            内置 C# 语法高亮、上下文补全、代码片段、基础诊断和前端调试器，可作为接入
            Roslyn LSP / DAP 服务的页面基础。
          </p>
        </div>
        <div className="heroStats">
          <span>{markerCount} 个诊断</span>
          <span>{sortedBreakpoints.length} 个断点</span>
          <span>{debugState.status}</span>
        </div>
      </header>

      <section className="workspaceGrid">
        <div className="editorCard">
          <div className="cardHeader">
            <div>
              <h2>Editor.cs</h2>
              <span>Ctrl / Cmd + Space 触发补全，点击行号栏添加断点</span>
            </div>
            <button type="button" className="secondaryButton" onClick={() => setCode(initialCode)}>
              重置示例
            </button>
          </div>
          <MonacoCSharpEditor
            code={code}
            breakpoints={breakpoints}
            currentLine={debugState.currentLine}
            onChange={setCode}
            onToggleBreakpoint={toggleBreakpoint}
            onMarkerCountChange={setMarkerCount}
          />
        </div>

        <aside className="debugPanel">
          <div className="cardHeader">
            <div>
              <h2>调试控制台</h2>
              <span>{debugState.lastEvent}</span>
            </div>
          </div>

          <div className="toolbar">
            <button type="button" onClick={runOrContinue}>
              {debugState.status === "paused" ? "继续" : "运行"}
            </button>
            <button type="button" onClick={stepOver}>
              单步
            </button>
            <button type="button" onClick={restart}>
              重启
            </button>
            <button type="button" className="secondaryButton" onClick={stop}>
              停止
            </button>
          </div>

          <DebugSection title="断点">
            {sortedBreakpoints.length === 0 ? (
              <p className="emptyState">暂无断点</p>
            ) : (
              <ul className="lineList">
                {sortedBreakpoints.map((line) => (
                  <li key={line}>第 {line} 行</li>
                ))}
              </ul>
            )}
          </DebugSection>

          <DebugSection title="变量">
            {Object.keys(debugState.variables).length === 0 ? (
              <p className="emptyState">运行或单步后展示变量</p>
            ) : (
              <dl className="variableList">
                {Object.entries(debugState.variables).map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </DebugSection>

          <DebugSection title="调用栈">
            {debugState.callStack.length === 0 ? (
              <p className="emptyState">调试暂停时展示调用栈</p>
            ) : (
              <ul className="lineList">
                {debugState.callStack.map((frame) => (
                  <li key={`${frame.name}-${frame.line}`}>
                    {frame.name} <span>line {frame.line}</span>
                  </li>
                ))}
              </ul>
            )}
          </DebugSection>

          <DebugSection title="输出">
            <pre className="consoleOutput">
              {debugState.output.length > 0 ? debugState.output.join("\n") : "Console.WriteLine 输出会显示在这里"}
            </pre>
          </DebugSection>
        </aside>
      </section>
    </main>
  );
}

interface MonacoCSharpEditorProps {
  code: string;
  breakpoints: Set<number>;
  currentLine: number | null;
  onChange(value: string): void;
  onToggleBreakpoint(lineNumber: number): void;
  onMarkerCountChange(count: number): void;
}

function MonacoCSharpEditor({
  code,
  breakpoints,
  currentLine,
  onChange,
  onToggleBreakpoint,
  onMarkerCountChange
}: MonacoCSharpEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<Monaco.editor.ITextModel | null>(null);
  const breakpointDecorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const currentLineDecorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const onChangeRef = useRef(onChange);
  const onToggleBreakpointRef = useRef(onToggleBreakpoint);
  const onMarkerCountChangeRef = useRef(onMarkerCountChange);

  useEffect(() => {
    onChangeRef.current = onChange;
    onToggleBreakpointRef.current = onToggleBreakpoint;
    onMarkerCountChangeRef.current = onMarkerCountChange;
  }, [onChange, onMarkerCountChange, onToggleBreakpoint]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) {
      return;
    }

    const monacoInstance = configureMonaco();
    const model = monacoInstance.editor.createModel(code, "csharp");
    const editor = monacoInstance.editor.create(host, {
      model,
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      lineHeight: 22,
      tabSize: 4,
      insertSpaces: true,
      glyphMargin: true,
      renderLineHighlight: "all",
      scrollBeyondLastLine: false,
      suggest: {
        showSnippets: true,
        showWords: true
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true
      }
    });

    editorRef.current = editor;
    modelRef.current = model;
    breakpointDecorationsRef.current = editor.createDecorationsCollection();
    currentLineDecorationsRef.current = editor.createDecorationsCollection();

    const refreshDiagnostics = () => {
      updateCSharpDiagnostics(monacoInstance, model);
      onMarkerCountChangeRef.current(
        monacoInstance.editor.getModelMarkers({
          owner: "csharp-analyzer",
          resource: model.uri
        }).length
      );
    };

    refreshDiagnostics();

    const contentSubscription = editor.onDidChangeModelContent(() => {
      const nextValue = model.getValue();
      refreshDiagnostics();
      onChangeRef.current(nextValue);
    });

    const mouseSubscription = editor.onMouseDown((event) => {
      const targetType = event.target.type;
      const clickedGutter =
        targetType === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;

      if (clickedGutter && event.target.position) {
        onToggleBreakpointRef.current(event.target.position.lineNumber);
      }
    });

    return () => {
      contentSubscription.dispose();
      mouseSubscription.dispose();
      breakpointDecorationsRef.current?.clear();
      currentLineDecorationsRef.current?.clear();
      editor.dispose();
      model.dispose();
    };
  }, []);

  useEffect(() => {
    const model = modelRef.current;
    if (model && model.getValue() !== code) {
      model.setValue(code);
    }
  }, [code]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !breakpointDecorationsRef.current) {
      return;
    }

    breakpointDecorationsRef.current.set(
      [...breakpoints].map((lineNumber) => ({
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: "breakpointGlyph",
          glyphMarginHoverMessage: { value: `第 ${lineNumber} 行断点` }
        }
      }))
    );
  }, [breakpoints]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !currentLineDecorationsRef.current) {
      return;
    }

    currentLineDecorationsRef.current.set(
      currentLine
        ? [
            {
              range: new monaco.Range(currentLine, 1, currentLine, 1),
              options: {
                isWholeLine: true,
                className: "debugCurrentLine",
                glyphMarginClassName: "currentLineGlyph",
                glyphMarginHoverMessage: { value: "当前暂停位置" }
              }
            }
          ]
        : []
    );

    if (currentLine) {
      editor.revealLineInCenterIfOutsideViewport(currentLine);
    }
  }, [currentLine]);

  return <div ref={containerRef} className="editorHost" />;
}

function DebugSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="debugSection">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default App;
