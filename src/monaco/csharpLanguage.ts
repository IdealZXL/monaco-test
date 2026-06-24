import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";

const languageId = "csharp";

const keywords = [
  "abstract",
  "as",
  "async",
  "await",
  "base",
  "break",
  "case",
  "catch",
  "checked",
  "class",
  "const",
  "continue",
  "default",
  "delegate",
  "do",
  "else",
  "enum",
  "event",
  "explicit",
  "extern",
  "false",
  "finally",
  "fixed",
  "for",
  "foreach",
  "goto",
  "if",
  "implicit",
  "in",
  "interface",
  "internal",
  "is",
  "lock",
  "namespace",
  "new",
  "null",
  "operator",
  "out",
  "override",
  "params",
  "private",
  "protected",
  "public",
  "readonly",
  "ref",
  "return",
  "sealed",
  "sizeof",
  "stackalloc",
  "static",
  "struct",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "unchecked",
  "unsafe",
  "using",
  "virtual",
  "void",
  "volatile",
  "while",
  "yield"
];

const primitiveTypes = [
  "bool",
  "byte",
  "char",
  "decimal",
  "double",
  "dynamic",
  "float",
  "int",
  "long",
  "object",
  "sbyte",
  "short",
  "string",
  "uint",
  "ulong",
  "ushort",
  "var"
];

const dotNetTypes = [
  "Console",
  "DateTime",
  "Guid",
  "List",
  "Dictionary",
  "IEnumerable",
  "Task",
  "Math",
  "StringBuilder",
  "Exception",
  "ArgumentException",
  "CancellationToken"
];

const snippets = [
  {
    label: "class",
    detail: "C# class",
    insertText: [
      "public class ${1:ClassName}",
      "{",
      "\t$0",
      "}"
    ].join("\n")
  },
  {
    label: "main",
    detail: "Program entry point",
    insertText: [
      "public static void Main(string[] args)",
      "{",
      "\t$0",
      "}"
    ].join("\n")
  },
  {
    label: "cw",
    detail: "Console.WriteLine",
    insertText: "Console.WriteLine($1);$0"
  },
  {
    label: "prop",
    detail: "Auto property",
    insertText: "public ${1:string} ${2:Name} { get; set; }$0"
  },
  {
    label: "for",
    detail: "for loop",
    insertText: [
      "for (int ${1:i} = 0; ${1:i} < ${2:length}; ${1:i}++)",
      "{",
      "\t$0",
      "}"
    ].join("\n")
  },
  {
    label: "try",
    detail: "try/catch block",
    insertText: [
      "try",
      "{",
      "\t$1",
      "}",
      "catch (Exception ex)",
      "{",
      "\tConsole.WriteLine(ex.Message);",
      "\t$0",
      "}"
    ].join("\n")
  },
  {
    label: "async",
    detail: "Async method",
    insertText: [
      "public async Task ${1:MethodName}Async()",
      "{",
      "\tawait ${2:Task.CompletedTask};",
      "\t$0",
      "}"
    ].join("\n")
  }
];

const memberCompletions: Record<string, string[]> = {
  Console: ["WriteLine", "Write", "ReadLine", "ReadKey", "Clear", "ForegroundColor", "ResetColor"],
  Math: ["Abs", "Ceiling", "Floor", "Max", "Min", "Pow", "Round", "Sqrt"],
  string: ["Concat", "Compare", "Format", "IsNullOrEmpty", "IsNullOrWhiteSpace", "Join"]
};

let registered = false;

export function registerCSharpLanguage(monaco: typeof Monaco): void {
  if (registered) {
    return;
  }

  if (!monaco.languages.getLanguages().some((language) => language.id === languageId)) {
    monaco.languages.register({
      id: languageId,
      aliases: ["C#", "csharp", "cs"],
      extensions: [".cs"],
      mimetypes: ["text/x-csharp"]
    });
  }

  monaco.languages.setLanguageConfiguration(languageId, {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"]
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"]
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string"] },
      { open: "'", close: "'", notIn: ["string", "comment"] }
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" }
    ],
    folding: {
      markers: {
        start: /^\s*#region\b/,
        end: /^\s*#endregion\b/
      }
    }
  });

  monaco.languages.setMonarchTokensProvider(languageId, {
    defaultToken: "",
    tokenPostfix: ".cs",
    keywords,
    typeKeywords: primitiveTypes,
    operators: [
      "=",
      ">",
      "<",
      "!",
      "~",
      "?",
      ":",
      "==",
      "<=",
      ">=",
      "!=",
      "&&",
      "||",
      "++",
      "--",
      "+",
      "-",
      "*",
      "/",
      "&",
      "|",
      "^",
      "%",
      "<<",
      ">>",
      "=>"
    ],
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    tokenizer: {
      root: [
        [/[a-zA-Z_]\w*/, { cases: { "@typeKeywords": "type", "@keywords": "keyword", "@default": "identifier" } }],
        { include: "@whitespace" },
        [/[{}()\[\]]/, "@brackets"],
        [/[<>](?!@symbols)/, "@brackets"],
        [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
        [/\d*\.\d+([eE][\-+]?\d+)?[fFdDmM]?/, "number.float"],
        [/0[xX][0-9a-fA-F]+/, "number.hex"],
        [/\d+([eE][\-+]?\d+)?[lL]?/, "number"],
        [/[;,.]/, "delimiter"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string"],
        [/'[^\\']'/, "string"],
        [/(')(@escapes)(')/, ["string", "string.escape", "string"]],
        [/'/, "string.invalid"]
      ],
      whitespace: [
        [/[ \t\r\n]+/, ""],
        [/\/\*/, "comment", "@comment"],
        [/\/\/.*$/, "comment"]
      ],
      comment: [
        [/[^\/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[\/*]/, "comment"]
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, "string", "@pop"]
      ]
    }
  });

  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: [".", " ", "<"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      const prefix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: Math.max(1, position.column - 32),
        endLineNumber: position.lineNumber,
        endColumn: position.column
      });
      const memberOwner = prefix.match(/([A-Za-z_]\w*)\.\w*$/)?.[1];

      if (memberOwner && memberCompletions[memberOwner]) {
        return {
          suggestions: memberCompletions[memberOwner].map((member) => ({
            label: member,
            kind: monaco.languages.CompletionItemKind.Method,
            detail: `${memberOwner}.${member}`,
            insertText: member,
            range
          }))
        };
      }

      const documentSymbols = getDocumentSymbols(model.getValue());
      const suggestions: Monaco.languages.CompletionItem[] = [
        ...keywords.map((keyword) => ({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword,
          range
        })),
        ...primitiveTypes.map((type) => ({
          label: type,
          kind: monaco.languages.CompletionItemKind.TypeParameter,
          insertText: type,
          range
        })),
        ...dotNetTypes.map((type) => ({
          label: type,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: type,
          range
        })),
        ...snippets.map((snippet) => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: snippet.detail,
          insertText: snippet.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        })),
        ...documentSymbols.variables.map((variable) => ({
          label: variable,
          kind: monaco.languages.CompletionItemKind.Variable,
          detail: "当前文件变量",
          insertText: variable,
          range
        })),
        ...documentSymbols.methods.map((method) => ({
          label: method,
          kind: monaco.languages.CompletionItemKind.Method,
          detail: "当前文件方法",
          insertText: `${method}($0)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        }))
      ];

      return { suggestions };
    }
  });

  monaco.languages.registerHoverProvider(languageId, {
    provideHover(_model, position) {
      const word = _model.getWordAtPosition(position)?.word;
      if (!word) {
        return null;
      }

      if (word === "Console") {
        return {
          contents: [
            { value: "**System.Console**" },
            { value: "提供标准输入、输出和错误流的访问能力。" }
          ]
        };
      }

      if (primitiveTypes.includes(word)) {
        return {
          contents: [
            { value: `**${word}**` },
            { value: "C# 内置类型，可用于声明变量、字段、参数或返回值。" }
          ]
        };
      }

      return null;
    }
  });

  registered = true;
}

export function updateCSharpDiagnostics(monaco: typeof Monaco, model: Monaco.editor.ITextModel): void {
  const markers: Monaco.editor.IMarkerData[] = [];
  const lines = model.getLinesContent();
  const stack: Array<{ char: string; line: number; column: number }> = [];
  const openingBrackets: Record<string, string> = {
    "{": "}",
    "[": "]",
    "(": ")"
  };
  const closingBrackets: Record<string, string> = {
    "}": "{",
    "]": "[",
    ")": "("
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const code = stripInlineComment(line);

    for (let column = 1; column <= code.length; column++) {
      const char = code[column - 1];
      if (openingBrackets[char]) {
        stack.push({ char, line: lineNumber, column });
      } else if (closingBrackets[char]) {
        const last = stack.pop();
        if (!last || last.char !== closingBrackets[char]) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: `未匹配的 '${char}'`,
            startLineNumber: lineNumber,
            startColumn: column,
            endLineNumber: lineNumber,
            endColumn: column + 1
          });
        }
      }
    }

    if (looksLikeMissingSemicolon(code)) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: "该语句可能缺少分号",
        startLineNumber: lineNumber,
        startColumn: Math.max(1, line.length),
        endLineNumber: lineNumber,
        endColumn: line.length + 1
      });
    }
  });

  stack.forEach((entry) => {
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      message: `未关闭的 '${entry.char}'`,
      startLineNumber: entry.line,
      startColumn: entry.column,
      endLineNumber: entry.line,
      endColumn: entry.column + 1
    });
  });

  monaco.editor.setModelMarkers(model, "csharp-analyzer", markers);
}

function getDocumentSymbols(code: string): { variables: string[]; methods: string[] } {
  const variables = new Set<string>();
  const methods = new Set<string>();
  const variablePattern = /\b(?:var|bool|byte|char|decimal|double|float|int|long|string|DateTime|Guid)\s+([A-Za-z_]\w*)\b/g;
  const methodPattern = /\b(?:public|private|protected|internal|static|async|\s)+[\w<>\[\],\s]+\s+([A-Za-z_]\w*)\s*\(/g;

  for (const match of code.matchAll(variablePattern)) {
    variables.add(match[1]);
  }

  for (const match of code.matchAll(methodPattern)) {
    if (!["if", "for", "foreach", "while", "switch", "catch"].includes(match[1])) {
      methods.add(match[1]);
    }
  }

  return {
    variables: [...variables],
    methods: [...methods]
  };
}

function stripInlineComment(line: string): string {
  const commentIndex = line.indexOf("//");
  return commentIndex >= 0 ? line.slice(0, commentIndex) : line;
}

function looksLikeMissingSemicolon(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.endsWith(";") || trimmed.endsWith("{") || trimmed.endsWith("}") || trimmed.startsWith("#")) {
    return false;
  }

  if (/^(if|for|foreach|while|switch|using|namespace|class|public class|private class|try|catch|else)\b/.test(trimmed)) {
    return false;
  }

  return /^(?:var|bool|byte|char|decimal|double|float|int|long|string|DateTime|Guid|Console\.|return\b|[A-Za-z_]\w*\s*=)/.test(trimmed);
}
