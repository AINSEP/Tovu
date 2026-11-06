import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { createSimpleWebAuthnPasskeys, type PasskeyCredential, type PasskeyOptions } from '@jini-ai/user-management/server';
test('browser virtual authenticator verifies registration, assertions, UV, signatures, counters and local port changes', { timeout: 30000 }, async () => {
const adapter = createSimpleWebAuthnPasskeys({});
const scope = { workspaceId: 'synthetic-site', principalId: 'synthetic-owner' };
const identityRequire = createRequire(import.meta.resolve('@jini-ai/user-management/server'));
const bundle = await readFile(resolve(dirname(identityRequire.resolve('@simplewebauthn/browser')), '../dist/bundle/index.umd.min.js'));
const server = createServer((req,res) => {res.setHeader('content-type', req.url === '/browser.js' ? 'text/javascript' : 'text/html');res.end(req.url === '/browser.js' ? bundle : '<!doctype html><title>Passkey verification</title><script src="/browser.js"></script>');});
await new Promise<void>(resolve=>server.listen(0, '127.0.0.1', resolve));
const address = server.address(); assert.ok(address && typeof address !== 'string');
const port = address.port;
const site = { origin: `http://localhost:${port}`, rpId: 'localhost', name: 'Synthetic test' };
const browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}), headless: true, args: ['--no-sandbox'] });
try {
 const page = await browser.newPage();
 await page.goto(site.origin);
 const cdp = await page.context().newCDPSession(page);
 await cdp.send('WebAuthn.enable');
 const {authenticatorId} = await cdp.send('WebAuthn.addVirtualAuthenticator', {options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 const options = await adapter.registration({site,scope,credentials:[]});
 assert.equal((options.authenticatorSelection as { userVerification: string }).userVerification,'required');
 options.pubKeyCredParams = (options.pubKeyCredParams as { alg: number; type: string }[]).filter(parameter => parameter.alg === -7);
 const registration = await page.evaluate('SimpleWebAuthnBrowser.startRegistration(' + JSON.stringify({ optionsJSON: options }) + ')');
 const credential = {...scope,...await adapter.register({site,response:registration,challenge:options.challenge}),rpId:site.rpId};
 assert.equal(typeof credential.publicKey,'string');
 await assert.rejects(adapter.register({site:{...site,origin:'http://localhost:1'},response:registration,challenge:options.challenge}),/origin/i);
 await assert.rejects(adapter.register({site:{...site,rpId:'evil.test'},response:registration,challenge:options.challenge}),/RP|hash/i);
 console.log('PASS: real registration, required UV, wrong origin and RP rejection');
 type Assertion = { response: { signature: string; authenticatorData: string; clientDataJSON: string } };
 async function assertion(credentialOverride: PasskeyCredential=credential) {
  const options=await adapter.authentication({site,credentials:[credential]});
  const response=await page.evaluate('SimpleWebAuthnBrowser.startAuthentication(' + JSON.stringify({ optionsJSON: options }) + ')') as Assertion;
  return {options,response,counter:await adapter.authenticate({site,response,challenge:options.challenge,credential:credentialOverride})};
 }
 const first=await assertion();
 assert.ok(first.counter>credential.counter);
 await assert.rejects(adapter.authenticate({site,response:first.response,challenge:first.options.challenge,credential:{...credential,counter:first.counter}}),/counter/i);
 const corrupted=structuredClone(first.response); const signature=Buffer.from(corrupted.response.signature,'base64url');signature[signature.length-1]^=1;corrupted.response.signature=signature.toString('base64url');
 await assert.rejects(adapter.authenticate({site,response:corrupted,challenge:first.options.challenge,credential}));
 await assert.rejects(adapter.authenticate({site,response:first.response,challenge:'wrong',credential}),/challenge/i);
 console.log('PASS: real assertion, monotonic counter, stale counter, bad signature and wrong challenge rejection');
 // A valid signature without UV must be refused even if the credential is otherwise owned.
 await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:false});
 const noUVOptions=await adapter.authentication({site,credentials:[credential]});
 const permissiveOptions={...noUVOptions,userVerification:'discouraged'};
 const noUV=await page.evaluate('SimpleWebAuthnBrowser.startAuthentication(' + JSON.stringify({ optionsJSON: permissiveOptions }) + ')');
 await assert.rejects(adapter.authenticate({site,response:noUV,challenge:noUVOptions.challenge,credential}),/verification|verified/i);
 console.log('PASS: cryptographically valid assertion without UV rejected');
 await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});
 // WebAuthn permits zero counters for synced credentials. Re-sign with a zero-counter authenticator.
 const {credentials}=await cdp.send('WebAuthn.getCredentials',{authenticatorId});
 assert.equal(credentials.length,1);
 // A standards-shaped fixture signed by the test authenticator's key exercises a synced
 // credential whose stored and returned counters are both zero. This is test-only signing.
 const {createPrivateKey,sign}=await import('node:crypto');
 const raw=credentials[0]; assert.ok(raw);
 const zeroResponse=structuredClone(first.response);
 const authData=Buffer.from(zeroResponse.response.authenticatorData,'base64url');authData.writeUInt32BE(0,33);
 const clientHash=(await import('node:crypto')).createHash('sha256').update(Buffer.from(zeroResponse.response.clientDataJSON,'base64url')).digest();
 const privateKey=createPrivateKey({key:Buffer.from(raw.privateKey,'base64'),format:'der',type:'pkcs8'});
 zeroResponse.response.authenticatorData=authData.toString('base64url');
 zeroResponse.response.signature=sign(privateKey.asymmetricKeyType === 'ed25519' ? null : 'sha256',Buffer.concat([authData,clientHash]),privateKey).toString('base64url');
 assert.equal(await adapter.authenticate({site,response:zeroResponse,challenge:first.options.challenge,credential:{...credential,counter:0}}),0);
 console.log('PASS: valid zero-counter authenticator accepted by library');
 // A fresh ceremony on another local port keeps the same RP and credential.
 const second=createServer((req,res)=>{res.setHeader('content-type',req.url==='/browser.js'?'text/javascript':'text/html');res.end(req.url==='/browser.js'?bundle:'<!doctype html><script src="/browser.js"></script>');});
 await new Promise<void>(resolve=>second.listen(0,'127.0.0.1',resolve));
 try {
  const changedSite={...site,origin:`http://localhost:${(second.address() as { port: number }).port}`};
  await page.goto(changedSite.origin);
  const changed=await adapter.authentication({site:changedSite,credentials:[credential]});
  const response=await page.evaluate('SimpleWebAuthnBrowser.startAuthentication(' + JSON.stringify({ optionsJSON: changed }) + ')');
  assert.ok(await adapter.authenticate({site:changedSite,response,challenge:changed.challenge,credential})>0);
  console.log('PASS: new localhost port, stable RP, existing passkey accepted');
 } finally {await new Promise<void>((resolve,reject)=>second.close(error=>error ? reject(error) : resolve()));}
} finally {await browser.close();await new Promise<void>((resolve,reject)=>server.close(error=>error ? reject(error) : resolve()));}

});
