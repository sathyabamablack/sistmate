import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto as crypto, generateKeyPairSync, randomBytes } from "node:crypto";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { cleanLine, isPushHost, parseAlert, parseCursor, parseSubscription } from "../src/validate.ts";

const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);
const good = (endpoint: string) => ({ endpoint, keys: { p256dh: P256DH, auth: AUTH } });

test("accepts the push services browsers use", () => {
  for (const host of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://wns2-par02p.notify.windows.com/?token=abc",
  ]) {
    assert.ok(parseSubscription(good(host)), host);
  }
});

test("refuses endpoints that are not a push service (the Worker would POST to them)", () => {
  for (const bad of [
    "http://fcm.googleapis.com/x",
    "https://evil.example/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://127.0.0.1/x",
    "https://169.254.169.254/latest",
    "not a url",
  ]) {
    assert.equal(parseSubscription(good(bad)), null, bad);
  }
  assert.equal(isPushHost("push.apple.com.evil.example"), false);
});

test("refuses malformed keys and bodies", () => {
  const ok = "https://fcm.googleapis.com/x";
  assert.equal(parseSubscription({ endpoint: ok, keys: { p256dh: "short", auth: AUTH } }), null);
  assert.equal(parseSubscription({ endpoint: ok, keys: { p256dh: P256DH, auth: "no spaces allowed here!" } }), null);
  assert.equal(parseSubscription({ endpoint: ok }), null);
  assert.equal(parseSubscription(null), null);
  assert.equal(parseSubscription("x"), null);
});

test("alerts: trims, limits and keeps the link on this site", () => {
  assert.deepEqual(parseAlert({ title: "  Results \n out ", body: "Open it", url: "/notifications" }), {
    title: "Results out",
    body: "Open it",
    url: "/notifications",
  });
  assert.equal(parseAlert({ title: "x", body: "y", url: "//evil.example" }), null);
  assert.equal(parseAlert({ title: "x", body: "y", url: "https://evil.example" }), null);
  assert.equal(parseAlert({ title: "x", body: "y", url: "/a\b" }), null);
  assert.equal(parseAlert({ title: "", body: "y" }), null);
  assert.equal(parseAlert({ title: "x", body: "   " }), null);
  assert.equal(cleanLine("a".repeat(500), 80).length, 80);
  assert.equal(parseAlert({ title: "x", body: "y" })?.url, "");
});

test("cursor is a safe non-negative integer", () => {
  assert.equal(parseCursor(12), 12);
  assert.equal(parseCursor(-1), 0);
  assert.equal(parseCursor(1.5), 0);
  assert.equal(parseCursor("5"), 0);
  assert.equal(parseCursor(1e15), 0);
});

/** Decrypts an aes128gcm Web Push body the way a browser does (RFC 8291), to prove the library's output is readable. */
async function decrypt(body: Uint8Array, uaPrivate: CryptoKey, uaPublicRaw: Uint8Array, authSecret: Uint8Array) {
  const salt = body.slice(0, 16);
  const idLen = body[20]!;
  const asPublicRaw = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);
  const asPublic = await crypto.subtle.importKey("raw", asPublicRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: asPublic }, uaPrivate, 256);
  const enc = new TextEncoder();
  const hkdf = async (ikm: ArrayBuffer | Uint8Array, saltIn: Uint8Array, info: Uint8Array, bits: number) => {
    const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    return crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: saltIn, info }, key, bits);
  };
  const keyInfo = new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublicRaw, ...asPublicRaw]);
  const ikm = await hkdf(secret, authSecret, keyInfo, 256);
  const cek = await hkdf(ikm, salt, enc.encode("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(ikm, salt, enc.encode("Content-Encoding: nonce\0"), 96);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, ciphertext));
  // Strip the padding: data, then 0x02 (last record), then zeros.
  let end = plain.length;
  while (end > 0 && plain[end - 1] === 0) end--;
  return new TextDecoder().decode(plain.slice(0, end - 1));
}

test("an alert built with our VAPID key format decrypts to the same JSON", async () => {
  // A subscriber, as a browser would create one.
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const authSecret = randomBytes(16);
  const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
  // A server key pair in the exact shape wrangler.jsonc / the secret use.
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = privateKey.export({ format: "jwk" });
  const publicKey = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]));

  const message = { title: "Results are out", body: "Check your marks", url: "/marks", tag: "t1" };
  const init = await buildPushPayload(
    { data: message, options: { ttl: 60 } },
    { endpoint: "https://fcm.googleapis.com/fcm/send/x", expirationTime: null, keys: { p256dh: b64u(uaPublicRaw), auth: b64u(authSecret) } },
    { subject: "https://sistmate.vercel.app", publicKey, privateKey: jwk.d! },
  );
  assert.match(String((init.headers as Record<string, string>).authorization), /^vapid t=/);
  const text = await decrypt(new Uint8Array(init.body as ArrayBuffer), ua.privateKey, uaPublicRaw, authSecret);
  assert.deepEqual(JSON.parse(text), message);
});
