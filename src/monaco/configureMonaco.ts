import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { registerCSharpLanguage } from "./csharpLanguage";

type MonacoEnvironmentHost = typeof globalThis & {
  MonacoEnvironment?: {
    getWorker(_: string, label: string): Worker;
  };
};

let configured = false;

export function configureMonaco(): typeof monaco {
  if (configured) {
    return monaco;
  }

  (self as MonacoEnvironmentHost).MonacoEnvironment = {
    getWorker() {
      return new editorWorker();
    }
  };

  registerCSharpLanguage(monaco);
  configured = true;

  return monaco;
}

export { monaco };
