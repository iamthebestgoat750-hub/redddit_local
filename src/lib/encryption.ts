import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "your-32-char-encryption-key-here-!!!"; // Must be 32 chars
const IV_LENGTH = 16;

export function encrypt(text: string) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
        "aes-256-cbc",
        Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
        iv
    );
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(text: string) {
    const textParts = text.split(":");
    const ivPart = textParts.shift();
    if (!ivPart) throw new Error("Invalid encrypted text");

    const iv = Buffer.from(ivPart, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
        iv
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
