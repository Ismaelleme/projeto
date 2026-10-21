import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const REQUEST_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

export function newRequestCode(): string {
  const bytes = randomBytes(10);
  let code = "";
  for (const byte of bytes) {
    code += REQUEST_CODE_ALPHABET[byte % REQUEST_CODE_ALPHABET.length];
  }
  return `VIS-${code}`;
}

export function newSessionToken(): string {
  return `sess_${randomBytes(32).toString("base64url")}`;
}

export function newCorrelationId(): string {
  return `corr_${randomBytes(9).toString("base64url")}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashCpf(cpf: string, secret: string): string {
  return createHmac("sha256", secret).update(cpf).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function hashPayload(value: unknown): string {
  return sha256(stableStringify(value));
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16_384, r: 8, p: 1 });
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, saltHex, hashHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) {
    return false;
  }
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
    N: 16_384,
    r: 8,
    p: 1,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }
  const digits = cpf.split("").map(Number);
  const first = digits
    .slice(0, 9)
    .reduce((sum, digit, index) => sum + digit * (10 - index), 0);
  const firstCheck = ((first * 10) % 11) % 10;
  if (firstCheck !== digits[9]) {
    return false;
  }
  const second = digits
    .slice(0, 10)
    .reduce((sum, digit, index) => sum + digit * (11 - index), 0);
  const secondCheck = ((second * 10) % 11) % 10;
  return secondCheck === digits[10];
}

export function cpfLast2(cpf: string): string {
  return normalizeCpf(cpf).slice(-2);
}

export function syntheticCpf(): string {
  const digits: number[] = [];
  for (let index = 0; index < 9; index += 1) {
    digits.push(randomBytes(1)[0] % 10);
  }
  const first = digits.reduce((sum, digit, index) => sum + digit * (10 - index), 0);
  digits.push(((first * 10) % 11) % 10);
  const second = digits.reduce((sum, digit, index) => sum + digit * (11 - index), 0);
  digits.push(((second * 10) % 11) % 10);
  return digits.join("");
}

export function syntheticCpfOrFallback(): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = syntheticCpf();
    if (isValidCpf(candidate)) {
      return candidate;
    }
  }
  return "52998224725";
}
