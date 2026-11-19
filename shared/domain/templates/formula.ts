// Template formulas (D26, spec/builder/features/object-templates.md#formulas): side-effect-free expressions
// in template metadata, parsed by a hand-written tokenizer and recursive-descent parser into an AST and
// evaluated by walking it. There is no `eval`/`Function`; a formula can only read the values it is given.
//
// Grammar (lowest to highest precedence):
//   expr    := or ( "?" expr ":" expr )?
//   or      := and ( "||" and )*
//   and     := eq ( "&&" eq )*
//   eq      := rel ( ( "==" | "!=" ) rel )*
//   rel     := add ( ( "<" | "<=" | ">" | ">=" ) add )*
//   add     := mul ( ( "+" | "-" ) mul )*
//   mul     := unary ( ( "*" | "/" | "%" ) unary )*
//   unary   := ( "-" | "!" ) unary | primary
//   primary := number | string | "true" | "false" | name | name "(" ( expr ( "," expr )* )? ")" | "(" expr ")"
// Types: number, boolean, and string (strings only for comparing choice parameters with == / !=).

export type FormulaType = "number" | "boolean" | "string";
export type FormulaValue = number | boolean | string;

/** A field that takes either a plain number or a formula evaluating to a number. */
export type NumberOrFormula = number | string;
/** A field that takes either a plain boolean or a formula evaluating to a boolean. */
export type BooleanOrFormula = boolean | string;

type BinaryOperator = "+" | "-" | "*" | "/" | "%" | "<" | "<=" | ">" | ">=" | "==" | "!=" | "&&" | "||";

export type FormulaNode =
  | Readonly<{ kind: "number"; value: number; at: number }>
  | Readonly<{ kind: "boolean"; value: boolean; at: number }>
  | Readonly<{ kind: "string"; value: string; at: number }>
  | Readonly<{ kind: "name"; name: string; at: number }>
  | Readonly<{ kind: "unary"; operator: "-" | "!"; operand: FormulaNode; at: number }>
  | Readonly<{ kind: "binary"; operator: BinaryOperator; left: FormulaNode; right: FormulaNode; at: number }>
  | Readonly<{
      kind: "conditional";
      test: FormulaNode;
      consequent: FormulaNode;
      alternate: FormulaNode;
      at: number;
    }>
  | Readonly<{ kind: "call"; name: string; args: readonly FormulaNode[]; at: number }>;

export type FormulaParse =
  | Readonly<{ ok: true; ast: FormulaNode; names: readonly string[] }>
  | Readonly<{ ok: false; message: string }>;

/** Functions and their arity ([min, max]); every argument and result is a number. */
export const formulaFunctions: Readonly<Record<string, readonly [number, number]>> = {
  min: [1, 16],
  max: [1, 16],
  floor: [1, 1],
  ceil: [1, 1],
  round: [1, 1],
  abs: [1, 1],
  clamp: [3, 3],
};

export const maxFormulaLength = 500;
const maxDepth = 48;

// ---------------------------------------------------------------------------------------------
// Tokenizer.

type Token =
  | Readonly<{ type: "number"; value: number; at: number }>
  | Readonly<{ type: "string"; value: string; at: number }>
  | Readonly<{ type: "name"; value: string; at: number }>
  | Readonly<{ type: "op"; value: string; at: number }>
  | Readonly<{ type: "end"; at: number }>;

const operators = [
  "<=",
  ">=",
  "==",
  "!=",
  "&&",
  "||",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "!",
  "?",
  ":",
  "(",
  ")",
  ",",
];

class FormulaSyntaxError extends Error {}

const isDigit = (char: string): boolean => char >= "0" && char <= "9";
const isNameStart = (char: string): boolean =>
  (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
const isNamePart = (char: string): boolean => isNameStart(char) || isDigit(char);

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source.charAt(i);
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      i += 1;
      continue;
    }
    const at = i + 1;
    if (isDigit(char) || (char === "." && isDigit(source.charAt(i + 1)))) {
      let end = i;
      while (isDigit(source.charAt(end))) end += 1;
      if (source.charAt(end) === ".") {
        end += 1;
        while (isDigit(source.charAt(end))) end += 1;
      }
      if (source.charAt(end) === "e" || source.charAt(end) === "E") {
        let exponent = end + 1;
        if (source.charAt(exponent) === "+" || source.charAt(exponent) === "-") exponent += 1;
        if (!isDigit(source.charAt(exponent))) throw new FormulaSyntaxError(`Malformed number at ${at}`);
        while (isDigit(source.charAt(exponent))) exponent += 1;
        end = exponent;
      }
      if (isNameStart(source.charAt(end))) throw new FormulaSyntaxError(`Malformed number at ${at}`);
      tokens.push({ type: "number", value: Number(source.slice(i, end)), at });
      i = end;
      continue;
    }
    if (isNameStart(char)) {
      let end = i + 1;
      while (isNamePart(source.charAt(end))) end += 1;
      tokens.push({ type: "name", value: source.slice(i, end), at });
      i = end;
      continue;
    }
    if (char === '"' || char === "'") {
      const close = source.indexOf(char, i + 1);
      if (close < 0) throw new FormulaSyntaxError(`Unterminated text at ${at}`);
      tokens.push({ type: "string", value: source.slice(i + 1, close), at });
      i = close + 1;
      continue;
    }
    const operator = operators.find((candidate) => source.startsWith(candidate, i));
    if (operator === undefined) throw new FormulaSyntaxError(`Unexpected '${char}' at ${at}`);
    tokens.push({ type: "op", value: operator, at });
    i += operator.length;
  }
  tokens.push({ type: "end", at: source.length + 1 });
  return tokens;
};

// ---------------------------------------------------------------------------------------------
// Parser.

const describe = (token: Token): string =>
  token.type === "end"
    ? "the end"
    : token.type === "string"
      ? `'${token.value}'`
      : `'${String(token.value)}'`;

const parseTokens = (tokens: readonly Token[]): FormulaNode => {
  let position = 0;
  let depth = 0;
  const peek = (): Token => tokens[position] ?? { type: "end", at: 0 };
  const next = (): Token => {
    const token = peek();
    position += 1;
    return token;
  };
  const isOp = (value: string): boolean => {
    const token = peek();
    return token.type === "op" && token.value === value;
  };
  const expect = (value: string): void => {
    const token = next();
    if (token.type !== "op" || token.value !== value)
      throw new FormulaSyntaxError(`Expected '${value}' at ${token.at}, found ${describe(token)}`);
  };
  const binaryLevel = (ops: readonly BinaryOperator[], operand: () => FormulaNode) => (): FormulaNode => {
    let left = operand();
    for (;;) {
      const token = peek();
      const operator = token.type === "op" ? ops.find((candidate) => candidate === token.value) : undefined;
      if (operator === undefined) return left;
      next();
      const right = operand();
      left = { kind: "binary", operator, left, right, at: token.at };
    }
  };

  const primary = (): FormulaNode => {
    const token = next();
    switch (token.type) {
      case "number":
        return { kind: "number", value: token.value, at: token.at };
      case "string":
        return { kind: "string", value: token.value, at: token.at };
      case "name": {
        if (token.value === "true" || token.value === "false")
          return { kind: "boolean", value: token.value === "true", at: token.at };
        if (!isOp("(")) return { kind: "name", name: token.value, at: token.at };
        next();
        const args: FormulaNode[] = [];
        if (!isOp(")")) {
          args.push(expression());
          while (isOp(",")) {
            next();
            args.push(expression());
          }
        }
        expect(")");
        return { kind: "call", name: token.value, args, at: token.at };
      }
      case "op":
        if (token.value === "(") {
          const inner = expression();
          expect(")");
          return inner;
        }
        throw new FormulaSyntaxError(`Unexpected ${describe(token)} at ${token.at}`);
      case "end":
        throw new FormulaSyntaxError("Unexpected end of formula");
    }
  };

  const unary = (): FormulaNode => {
    const token = peek();
    if (token.type === "op" && (token.value === "-" || token.value === "!")) {
      next();
      depth += 1;
      if (depth > maxDepth) throw new FormulaSyntaxError("Formula is nested too deeply");
      const operand = unary();
      depth -= 1;
      return { kind: "unary", operator: token.value, operand, at: token.at };
    }
    return primary();
  };
  const multiplicative = binaryLevel(["*", "/", "%"], unary);
  const additive = binaryLevel(["+", "-"], multiplicative);
  const relational = binaryLevel(["<=", ">=", "<", ">"], additive);
  const equality = binaryLevel(["==", "!="], relational);
  const and = binaryLevel(["&&"], equality);
  const or = binaryLevel(["||"], and);

  function expression(): FormulaNode {
    depth += 1;
    if (depth > maxDepth) throw new FormulaSyntaxError("Formula is nested too deeply");
    const test = or();
    let result = test;
    const token = peek();
    if (token.type === "op" && token.value === "?") {
      next();
      const consequent = expression();
      expect(":");
      const alternate = expression();
      result = { kind: "conditional", test, consequent, alternate, at: token.at };
    }
    depth -= 1;
    return result;
  }

  const ast = expression();
  const rest = peek();
  if (rest.type !== "end") throw new FormulaSyntaxError(`Unexpected ${describe(rest)} at ${rest.at}`);
  return ast;
};

const collectNames = (node: FormulaNode, into: Set<string>): void => {
  switch (node.kind) {
    case "name":
      into.add(node.name);
      return;
    case "unary":
      collectNames(node.operand, into);
      return;
    case "binary":
      collectNames(node.left, into);
      collectNames(node.right, into);
      return;
    case "conditional":
      collectNames(node.test, into);
      collectNames(node.consequent, into);
      collectNames(node.alternate, into);
      return;
    case "call":
      for (const arg of node.args) collectNames(arg, into);
      return;
    default:
      return;
  }
};

const parseCache = new Map<string, FormulaParse>();
const parseCacheLimit = 4096;

/** Parses a formula once; results (including failures) are cached by source text. */
export const parseFormula = (source: string): FormulaParse => {
  const cached = parseCache.get(source);
  if (cached !== undefined) return cached;
  let result: FormulaParse;
  if (source.length > maxFormulaLength)
    result = { ok: false, message: `Formula is longer than ${maxFormulaLength} characters` };
  else if (source.trim() === "") result = { ok: false, message: "Formula is empty" };
  else {
    try {
      const ast = parseTokens(tokenize(source));
      const names = new Set<string>();
      collectNames(ast, names);
      result = { ok: true, ast, names: [...names] };
    } catch (error: unknown) {
      if (!(error instanceof FormulaSyntaxError)) throw error;
      result = { ok: false, message: error.message };
    }
  }
  if (parseCache.size >= parseCacheLimit) parseCache.clear();
  parseCache.set(source, result);
  return result;
};

// ---------------------------------------------------------------------------------------------
// Static checking.

/** What a formula may read: each name's type, and the allowed texts of a choice (string) parameter. */
export type FormulaNameInfo = Readonly<{ type: FormulaType; choices?: readonly string[] }>;
export type FormulaScope = Readonly<Record<string, FormulaNameInfo>>;

export type FormulaCheck =
  | Readonly<{ ok: true; type: FormulaType; names: readonly string[] }>
  | Readonly<{ ok: false; message: string }>;

class FormulaTypeError extends Error {}

const typeNode = (node: FormulaNode, scope: FormulaScope): FormulaType => {
  const need = (child: FormulaNode, type: FormulaType, what: string): void => {
    const actual = typeNode(child, scope);
    if (actual !== type)
      throw new FormulaTypeError(`${what} at ${child.at} needs a ${type}, not a ${actual}`);
  };
  switch (node.kind) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    case "name": {
      if (!Object.hasOwn(scope, node.name))
        throw new FormulaTypeError(`Unknown name '${node.name}' at ${node.at}`);
      const info = scope[node.name];
      if (info === undefined) throw new FormulaTypeError(`Unknown name '${node.name}' at ${node.at}`);
      return info.type;
    }
    case "unary":
      if (node.operator === "-") {
        need(node.operand, "number", "'-'");
        return "number";
      }
      need(node.operand, "boolean", "'!'");
      return "boolean";
    case "binary": {
      const op = node.operator;
      if (op === "&&" || op === "||") {
        need(node.left, "boolean", `'${op}'`);
        need(node.right, "boolean", `'${op}'`);
        return "boolean";
      }
      if (op === "==" || op === "!=") {
        const left = typeNode(node.left, scope);
        const right = typeNode(node.right, scope);
        if (left !== right)
          throw new FormulaTypeError(`'${op}' at ${node.at} compares a ${left} with a ${right}`);
        for (const [a, b] of [
          [node.left, node.right],
          [node.right, node.left],
        ] as const) {
          if (a.kind !== "name" || b.kind !== "string") continue;
          const choices = scope[a.name]?.choices;
          if (choices !== undefined && !choices.includes(b.value))
            throw new FormulaTypeError(
              `'${b.value}' at ${b.at} is not a choice of ${a.name} (${choices.join(", ")})`,
            );
        }
        return "boolean";
      }
      need(node.left, "number", `'${op}'`);
      need(node.right, "number", `'${op}'`);
      return op === "<" || op === "<=" || op === ">" || op === ">=" ? "boolean" : "number";
    }
    case "conditional": {
      need(node.test, "boolean", "The condition of '?'");
      const consequent = typeNode(node.consequent, scope);
      const alternate = typeNode(node.alternate, scope);
      if (consequent !== alternate)
        throw new FormulaTypeError(
          `The branches of '?' at ${node.at} differ (${consequent} and ${alternate})`,
        );
      return consequent;
    }
    case "call": {
      const arity = formulaFunctions[node.name];
      if (!Object.hasOwn(formulaFunctions, node.name) || arity === undefined)
        throw new FormulaTypeError(`Unknown function '${node.name}' at ${node.at}`);
      const [lo, hi] = arity;
      if (node.args.length < lo || node.args.length > hi)
        throw new FormulaTypeError(
          `${node.name} at ${node.at} takes ${lo === hi ? String(lo) : `${lo} to ${hi}`} argument${hi === 1 ? "" : "s"}, not ${node.args.length}`,
        );
      for (const arg of node.args) need(arg, "number", `An argument of ${node.name}`);
      return "number";
    }
  }
};

/** Parses and type-checks a formula against the names it may read; `expected` is the type the field needs. */
export const checkFormula = (source: string, scope: FormulaScope, expected?: FormulaType): FormulaCheck => {
  const parsed = parseFormula(source);
  if (!parsed.ok) return parsed;
  try {
    const type = typeNode(parsed.ast, scope);
    if (expected !== undefined && type !== expected)
      return { ok: false, message: `The formula gives a ${type}; a ${expected} is needed` };
    return { ok: true, type, names: parsed.names };
  } catch (error: unknown) {
    if (!(error instanceof FormulaTypeError)) throw error;
    return { ok: false, message: error.message };
  }
};

// ---------------------------------------------------------------------------------------------
// Evaluation.

export type FormulaValues = Readonly<Record<string, FormulaValue>>;

export type FormulaResult =
  Readonly<{ ok: true; value: FormulaValue }> | Readonly<{ ok: false; message: string }>;

class FormulaEvaluationError extends Error {}

const evaluateNode = (node: FormulaNode, values: FormulaValues): FormulaValue => {
  const numberOf = (child: FormulaNode): number => {
    const value = evaluateNode(child, values);
    if (typeof value !== "number") throw new FormulaEvaluationError(`A number is needed at ${child.at}`);
    return value;
  };
  const booleanOf = (child: FormulaNode): boolean => {
    const value = evaluateNode(child, values);
    if (typeof value !== "boolean") throw new FormulaEvaluationError(`A boolean is needed at ${child.at}`);
    return value;
  };
  switch (node.kind) {
    case "number":
    case "boolean":
    case "string":
      return node.value;
    case "name": {
      const value = Object.hasOwn(values, node.name) ? values[node.name] : undefined;
      if (value === undefined) throw new FormulaEvaluationError(`${node.name} has no value`);
      return value;
    }
    case "unary":
      return node.operator === "-" ? -numberOf(node.operand) : !booleanOf(node.operand);
    case "binary":
      switch (node.operator) {
        case "&&":
          return booleanOf(node.left) && booleanOf(node.right);
        case "||":
          return booleanOf(node.left) || booleanOf(node.right);
        case "==":
        case "!=": {
          const left = evaluateNode(node.left, values);
          const right = evaluateNode(node.right, values);
          if (typeof left !== typeof right)
            throw new FormulaEvaluationError(`'${node.operator}' at ${node.at} compares different types`);
          return node.operator === "==" ? left === right : left !== right;
        }
        case "<":
          return numberOf(node.left) < numberOf(node.right);
        case "<=":
          return numberOf(node.left) <= numberOf(node.right);
        case ">":
          return numberOf(node.left) > numberOf(node.right);
        case ">=":
          return numberOf(node.left) >= numberOf(node.right);
        case "+":
          return numberOf(node.left) + numberOf(node.right);
        case "-":
          return numberOf(node.left) - numberOf(node.right);
        case "*":
          return numberOf(node.left) * numberOf(node.right);
        case "/":
          return numberOf(node.left) / numberOf(node.right);
        case "%":
          return numberOf(node.left) % numberOf(node.right);
      }
      break;
    case "conditional":
      return booleanOf(node.test)
        ? evaluateNode(node.consequent, values)
        : evaluateNode(node.alternate, values);
    case "call": {
      const args = node.args.map(numberOf);
      const [a = Number.NaN, b = Number.NaN, c = Number.NaN] = args;
      switch (node.name) {
        case "min":
          return Math.min(...args);
        case "max":
          return Math.max(...args);
        case "floor":
          // A small tolerance so 1650 / 50 style quotients do not fall one short through rounding.
          return Math.floor(a + 1e-9);
        case "ceil":
          return Math.ceil(a - 1e-9);
        case "round":
          return Math.round(a);
        case "abs":
          return Math.abs(a);
        case "clamp":
          return Math.min(Math.max(a, b), c);
        default:
          throw new FormulaEvaluationError(`Unknown function '${node.name}'`);
      }
    }
  }
  throw new FormulaEvaluationError("Unsupported formula");
};

/** Evaluates a formula; a non-finite number (division by zero) is an error. */
export const evaluateFormula = (source: string, values: FormulaValues): FormulaResult => {
  const parsed = parseFormula(source);
  if (!parsed.ok) return parsed;
  try {
    const value = evaluateNode(parsed.ast, values);
    if (typeof value === "number" && !Number.isFinite(value))
      return { ok: false, message: "The formula does not give a finite number" };
    return { ok: true, value };
  } catch (error: unknown) {
    if (!(error instanceof FormulaEvaluationError)) throw error;
    return { ok: false, message: error.message };
  }
};

export type NumberResult = Readonly<{ ok: true; value: number }> | Readonly<{ ok: false; message: string }>;
export type BooleanResult = Readonly<{ ok: true; value: boolean }> | Readonly<{ ok: false; message: string }>;

/** A number field: plain numbers pass through, formulas must give a number. */
export const resolveNumber = (field: NumberOrFormula, values: FormulaValues): NumberResult => {
  if (typeof field === "number") return { ok: true, value: field };
  const result = evaluateFormula(field, values);
  if (!result.ok) return result;
  return typeof result.value === "number"
    ? { ok: true, value: result.value }
    : { ok: false, message: `'${field}' does not give a number` };
};

/** A boolean field: plain booleans pass through, formulas must give a boolean. */
export const resolveBoolean = (field: BooleanOrFormula, values: FormulaValues): BooleanResult => {
  if (typeof field === "boolean") return { ok: true, value: field };
  const result = evaluateFormula(field, values);
  if (!result.ok) return result;
  return typeof result.value === "boolean"
    ? { ok: true, value: result.value }
    : { ok: false, message: `'${field}' does not give a boolean` };
};

// ---------------------------------------------------------------------------------------------
// Named formulas (metadata `formulas`): derived values that may read each other.

export type NamedFormulaOrder =
  Readonly<{ ok: true; order: readonly string[] }> | Readonly<{ ok: false; cycle: readonly string[] }>;

/** Orders named formulas so each comes after the named formulas it reads; reports the first cycle. */
export const orderNamedFormulas = (formulas: Readonly<Record<string, string>>): NamedFormulaOrder => {
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (name: string): readonly string[] | null => {
    const seen = state.get(name);
    if (seen === "done") return null;
    if (seen === "visiting") return [...stack.slice(stack.indexOf(name)), name];
    state.set(name, "visiting");
    stack.push(name);
    const source = formulas[name] ?? "";
    const parsed = parseFormula(source);
    if (parsed.ok) {
      for (const dependency of parsed.names) {
        if (!Object.hasOwn(formulas, dependency)) continue;
        const cycle = visit(dependency);
        if (cycle !== null) return cycle;
      }
    }
    stack.pop();
    state.set(name, "done");
    order.push(name);
    return null;
  };
  for (const name of Object.keys(formulas)) {
    const cycle = visit(name);
    if (cycle !== null) return { ok: false, cycle };
  }
  return { ok: true, order };
};
