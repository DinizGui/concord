// Snowflake no formato do Discord: 42 bits de tempo | 5 worker | 5 processo | 12 sequência.
// Sem literais 1n porque o tsconfig mira ES2017.

const B = BigInt;
export const CONCORD_EPOCH = B(1767225600000); // 2026-01-01T00:00:00Z

const workerId = B(Math.floor(Math.random() * 32));
const processId = B((typeof process !== "undefined" ? process.pid : 0) % 32);
const MAX_INCREMENT = B(0xfff);
const MAX_SNOWFLAKE = (B(1) << B(63)) - B(1);

let lastTimestamp = B(0);
let increment = B(0);

function now() {
  return B(Date.now()) - CONCORD_EPOCH;
}

export function snowflake(): bigint {
  let ts = now();
  if (ts <= lastTimestamp) {
    ts = lastTimestamp;
    increment = (increment + B(1)) & MAX_INCREMENT;
    if (increment === B(0)) {
      // estourou 4096 ids no mesmo ms: espera o próximo
      while (now() <= lastTimestamp) {}
      ts = now();
    }
  } else {
    increment = B(0);
  }
  lastTimestamp = ts;
  return (ts << B(22)) | (workerId << B(17)) | (processId << B(12)) | increment;
}

export function snowflakeDate(id: bigint): Date {
  return new Date(Number((id >> B(22)) + CONCORD_EPOCH));
}

// menor snowflake possível naquele instante (para filtrar mensagens por data)
export function snowflakeFromDate(date: Date): bigint {
  const ts = B(date.getTime()) - CONCORD_EPOCH;
  return ts > B(0) ? ts << B(22) : B(0);
}

export function parseSnowflake(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const str = String(value);
  if (!/^\d{1,20}$/.test(str)) return null;
  const id = B(str);
  return id > B(0) && id <= MAX_SNOWFLAKE ? id : null;
}
