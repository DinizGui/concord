import { ApiError } from "./http";
import { parseSnowflake } from "./snowflake";

export const USERNAME_PATTERN = /^[a-z0-9_.]{2,32}$/;

type FieldErrors =Record<string, { _errors: { code: string; message: string }[] }>;

type StringOpts = { min?: number; max?: number; pattern?: RegExp; trim?: boolean };

// Valida o corpo acumulando erros por campo (formato 50035 do Discord).
// Campos obrigatórios que falharem voltam undefined; done() lança antes de serem usados.
export class Form {
  private errors: FieldErrors = {};

  constructor(private body: Record<string, unknown>) {}

  has(key: string) {
    return Object.prototype.hasOwnProperty.call(this.body, key) && this.body[key] !== undefined;
  }

  isNull(key: string) {
    return this.has(key) && this.body[key] === null;
  }

  fail(key: string, code: string, message: string) {
    (this.errors[key] ??= { _errors: [] })._errors.push({ code, message });
  }

  string(key: string, opts: StringOpts = {}): string | undefined {
    if (!this.has(key) || this.body[key] === null) {
      this.fail(key, "BASE_TYPE_REQUIRED", "This field is required");
      return undefined;
    }
    return this.checkString(key, opts);
  }

  optionalString(key: string, opts: StringOpts = {}): string | null | undefined {
    if (!this.has(key)) return undefined;
    if (this.body[key] === null) return null;
    return this.checkString(key, opts);
  }

  private checkString(key: string, { min = 0, max = 2000, pattern, trim = true }: StringOpts) {
    const raw = this.body[key];
    if (typeof raw !== "string") {
      this.fail(key, "BASE_TYPE_STRING", "Must be a string");
      return undefined;
    }
    const value = trim ? raw.trim() : raw;
    if (value.length < min || value.length > max) {
      this.fail(key, "BASE_TYPE_BAD_LENGTH", `Must be between ${min} and ${max} in length`);
      return undefined;
    }
    if (pattern && !pattern.test(value)) {
      this.fail(key, "STRING_TYPE_REGEX", "Invalid format");
      return undefined;
    }
    return value;
  }

  int(key: string, { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {}): number | undefined {
    if (!this.has(key) || this.body[key] === null) return undefined;
    const raw = this.body[key];
    if (typeof raw !== "number" || !Number.isInteger(raw)) {
      this.fail(key, "NUMBER_TYPE_COERCE", "Must be an integer");
      return undefined;
    }
    if (raw < min || raw > max) {
      this.fail(key, "NUMBER_TYPE_MAX", `Must be between ${min} and ${max}`);
      return undefined;
    }
    return raw;
  }

  bool(key: string): boolean | undefined {
    if (!this.has(key) || this.body[key] === null) return undefined;
    const raw = this.body[key];
    if (typeof raw !== "boolean") {
      this.fail(key, "BASE_TYPE_BOOLEAN", "Must be a boolean");
      return undefined;
    }
    return raw;
  }

  snowflake(key: string): bigint | null | undefined {
    if (!this.has(key)) return undefined;
    if (this.body[key] === null) return null;
    const id = parseSnowflake(this.body[key]);
    if (id == null) this.fail(key, "NUMBER_TYPE_COERCE", "Value is not snowflake");
    return id ?? undefined;
  }

  snowflakes(key: string, { max = 250 }: { max?: number } = {}): bigint[] | undefined {
    if (!this.has(key) || this.body[key] === null) return undefined;
    const raw = this.body[key];
    if (!Array.isArray(raw) || raw.length > max) {
      this.fail(key, "BASE_TYPE_ARRAY", `Must be an array with up to ${max} items`);
      return undefined;
    }
    const ids: bigint[] = [];
    for (const item of raw) {
      const id = parseSnowflake(item);
      if (id == null) {
        this.fail(key, "NUMBER_TYPE_COERCE", "Value is not snowflake");
        return undefined;
      }
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  // permissões chegam como string numérica (igual ao Discord)
  permissions(key: string): bigint | undefined {
    if (!this.has(key) || this.body[key] === null) return undefined;
    const raw = this.body[key];
    if ((typeof raw !== "string" && typeof raw !== "number") || !/^\d{1,20}$/.test(String(raw))) {
      this.fail(key, "NUMBER_TYPE_COERCE", "Must be a permission bitfield string");
      return undefined;
    }
    return BigInt(String(raw));
  }

  done() {
    if (Object.keys(this.errors).length) throw new ApiError(400, 50035, "Invalid Form Body", this.errors);
  }
}

export function idParam(value: string, notFound: () => ApiError): bigint {
  const id = parseSnowflake(value);
  if (id == null) throw notFound();
  return id;
}

export function queryInt(value: string | null, def: number, min: number, max: number) {
  if (value == null || value === "") return def;
  const n = Number(value);
  if (!Number.isInteger(n)) return def;
  return Math.min(max, Math.max(min, n));
}
