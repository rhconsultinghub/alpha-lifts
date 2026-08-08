// One-off VAPID key generator for the Web Push reminders (src/push.ts). Run from worker/:
//   node scripts/gen-vapid.mjs
// Prints:
//   - the PUBLIC key (base64url, uncompressed P-256 point) → paste into wrangler.toml
//     VAPID_PUBLIC_KEY (it ships to every browser; not a secret)
//   - the PRIVATE key as a JWK JSON string → `npx wrangler secret put VAPID_PRIVATE_JWK`
// Regenerating keys invalidates every existing subscription (devices must re-subscribe).
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;

const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privJwk = await subtle.exportKey('jwk', pair.privateKey);
const rawPub = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));

const b64url = bytes => Buffer.from(bytes).toString('base64url');

console.log('VAPID_PUBLIC_KEY (wrangler.toml [vars]):');
console.log(b64url(rawPub));
console.log('\nVAPID_PRIVATE_JWK (wrangler secret put VAPID_PRIVATE_JWK — paste the one line below):');
console.log(JSON.stringify(privJwk));
