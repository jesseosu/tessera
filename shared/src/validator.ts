type Rule = { field: string; type: 'string' | 'number'; required?: boolean; min?: number; max?: number; maxLength?: number };

export function validate(body: Record<string, unknown>, rules: Rule[]): string | null {
  for (const rule of rules) {
    const val = body[rule.field];
    if (rule.required && (val === undefined || val === null || val === '')) {
      return `${rule.field} is required`;
    }
    if (val === undefined || val === null) continue;
    if (rule.type === 'string' && typeof val !== 'string') {
      return `${rule.field} must be a string`;
    }
    if (rule.type === 'number') {
      const n = Number(val);
      if (isNaN(n)) return `${rule.field} must be a number`;
      if (rule.min !== undefined && n < rule.min) return `${rule.field} must be >= ${rule.min}`;
      if (rule.max !== undefined && n > rule.max) return `${rule.field} must be <= ${rule.max}`;
    }
    if (rule.type === 'string' && typeof val === 'string' && rule.maxLength && val.length > rule.maxLength) {
      return `${rule.field} must be <= ${rule.maxLength} characters`;
    }
  }
  return null;
}

export function sanitize(input: string): string {
  return input.replace(/[<>]/g, '');
}

export function parseBody(raw: string | null): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}
