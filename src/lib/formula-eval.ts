/**
 * Safe formula evaluator. Accepts an expression like
 * "base_salary + (base_salary * bonus_pct/100 * performance_score/3) + equity_grant + benefits"
 * and a values map. Only +, -, *, /, parens, numbers, decimals, and identifiers allowed.
 */
export function evalFormula(expression: string, values: Record<string, number>): number {
  // Substitute identifiers with numeric literals
  const safeExpr = expression.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (id) => {
    const v = values[id];
    if (typeof v !== "number" || !Number.isFinite(v)) return "0";
    return `(${v})`;
  });

  // Whitelist check: digits, dots, operators, parens, whitespace
  if (!/^[\d\s+\-*/().]+$/.test(safeExpr)) return NaN;

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${safeExpr});`)();
    return typeof result === "number" && Number.isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

/** Pretty-print an expression with spaces around operators */
export function prettyExpression(expr: string): string {
  return expr.replace(/\s+/g, " ").replace(/\s*([+\-*/])\s*/g, " $1 ").trim();
}

/** Plain-English translator for common patterns */
export function explainFormula(name: string, description: string): string {
  return description;
}
