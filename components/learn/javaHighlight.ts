// A small Java tokenizer for syntax highlighting. It is intentionally simple
// (no parsing) — enough to colour keywords, types, strings, comments,
// annotations, numbers and method calls in teaching examples.

export type TokenType = 'plain' | 'keyword' | 'type' | 'fn' | 'string' | 'comment' | 'annotation' | 'number';

export interface Token {
  text: string;
  type: TokenType;
}

const KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue',
  'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if',
  'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private',
  'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this',
  'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'var', 'record', 'sealed', 'permits',
  'yield', 'true', 'false', 'null',
]);

const TOKEN_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])+')|(@[A-Za-z_]\w*)|(\b0[xX][\da-fA-F_]+[lL]?\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[lLfFdD]?\b)|([A-Za-z_$][\w$]*)/g;

const CALL_RE = /\s*\(/y;

export const tokenizeJava = (source: string): Token[] => {
  const tokens: Token[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(source)) !== null) {
    if (match.index > last) tokens.push({ text: source.slice(last, match.index), type: 'plain' });
    const [text, comment, string, annotation, number, identifier] = match;
    let type: TokenType = 'plain';
    if (comment) type = 'comment';
    else if (string) type = 'string';
    else if (annotation) type = 'annotation';
    else if (number) type = 'number';
    else if (identifier) {
      if (KEYWORDS.has(identifier)) type = 'keyword';
      else if (/^[A-Z]/.test(identifier)) type = 'type';
      else {
        CALL_RE.lastIndex = TOKEN_RE.lastIndex;
        if (CALL_RE.test(source)) type = 'fn';
      }
    }
    tokens.push({ text, type });
    last = TOKEN_RE.lastIndex;
  }
  if (last < source.length) tokens.push({ text: source.slice(last), type: 'plain' });
  return tokens;
};

export const TOKEN_CLASSES: Record<TokenType, string> = {
  plain: '',
  keyword: 'text-violet-300',
  type: 'text-sky-300',
  fn: 'text-amber-200',
  string: 'text-emerald-300',
  comment: 'text-slate-500 italic',
  annotation: 'text-pink-300',
  number: 'text-orange-300',
};
