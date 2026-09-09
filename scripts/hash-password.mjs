import { randomBytes, scryptSync } from "node:crypto";
import { emitKeypressEvents } from "node:readline";
if (!process.stdin.isTTY)
  throw new Error(
    "Run in an interactive terminal to enter a password privately.",
  );
process.stdout.write("Password (at least 12 characters; input hidden): ");
emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
let password = "";
process.stdin.on("keypress", (text, key) => {
  if (key.ctrl && key.name === "c") process.exit(130);
  if (key.name === "return") {
    process.stdin.setRawMode(false);
    if (password.length < 12) {
      process.stderr.write("\nUse at least 12 characters.\n");
      process.exit(1);
    }
    const salt = randomBytes(16).toString("hex");
    process.stdout.write(
      `\nscrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}\n`,
    );
    process.exit(0);
  }
  if (key.name === "backspace") password = password.slice(0, -1);
  else if (text && !key.ctrl && !key.meta) password += text;
});
