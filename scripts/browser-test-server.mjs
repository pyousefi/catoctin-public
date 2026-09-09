import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import next from "next";

const certificateDirectory = mkdtempSync(
  join(tmpdir(), "catoctin-browser-tls-"),
);
process.on("exit", () =>
  rmSync(certificateDirectory, { recursive: true, force: true }),
);
const key = join(certificateDirectory, "key.pem");
const cert = join(certificateDirectory, "cert.pem");
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost",
  ],
  { stdio: "ignore" },
);

const app = next({ dev: false, hostname: "localhost", port: 3100 });
await app.prepare();
const server = createServer(
  { key: readFileSync(key), cert: readFileSync(cert) },
  app.getRequestHandler(),
);
server.listen(3100, "localhost");
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    process.exit(0);
  });
}
