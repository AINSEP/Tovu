import * as undici from "undici";
import * as http from "node:http";
import * as https from "node:https";
import { request as sendRequest } from "undici";
import { request as sendHttp } from "node:http";
import { request as sendHttps } from "https";
// ruleid: no-raw-fetch
fetch("https://example.invalid");
// ruleid: no-raw-fetch
globalThis.fetch("https://example.invalid");
// ruleid: no-raw-fetch
undici.request("https://example.invalid");
// ruleid: no-raw-fetch
http.request("https://example.invalid");
// ruleid: no-raw-fetch
https.request("https://example.invalid");
// ruleid: no-raw-fetch
sendRequest("https://example.invalid");
// ruleid: no-raw-fetch
sendHttp("https://example.invalid");
// ruleid: no-raw-fetch
sendHttps("https://example.invalid");
// ok: no-raw-fetch
guardedClient.send({ request: { url: "https://example.invalid", method: "GET" } });
// ok: no-raw-fetch
createTovuOAuthHttpPorts({ http: guardedClient }, {});
// ok: no-raw-fetch
database.request({ query: "select 1" });
