// Chromium over CDP, isolated profile and loopback fixtures; no browser test dependency.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pageUrl = process.env.HOMEPLAN_CHECK_URL;
const sourceUrl = process.env.HOMEPLAN_CHECK_SOURCE;
assert.ok(pageUrl && sourceUrl, "Run through check-ha-storage.py with HOMEPLAN_HA_BROWSER=1.");
const profile = await mkdtemp(join(tmpdir(), "homeplan-browser-"));
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
let socket;
let checks = 0;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(port, "Chromium started");
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const tab = tabs.find((item) => item.type === "page");
  assert.ok(tab);
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  const responses = [];
  const errors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callback?.reject(new Error(JSON.stringify(message.error)));
      else callback?.resolve(message.result);
    } else if (message.method === "Network.responseReceived")
      responses.push({ url: message.params.response.url, status: message.params.response.status });
    else if (message.method === "Page.javascriptDialogOpening") {
      socket.send(
        JSON.stringify({ id: ++nextId, method: "Page.handleJavaScriptDialog", params: { accept: true } }),
      );
    } else if (message.method === "Runtime.exceptionThrown")
      errors.push(
        message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text,
      );
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const deep = `function findAll(selector, root=document) { const result=[...root.querySelectorAll(selector)]; for(const element of root.querySelectorAll('*')) if(element.shadowRoot) result.push(...findAll(selector, element.shadowRoot)); return result; }`;
  const run = (code) => evaluate(`(()=>{${deep};${code}})()`);
  const wait = async (code, label, timeout = 20000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await run(code)) {
        checks++;
        return;
      }
      await delay(100);
    }
    const visible = await run(
      "return findAll('.message, .status, .error, h2, h3, p').map(e=>e.textContent.trim()).filter(Boolean).slice(-20)",
    );
    const state = await run(
      "const p=document.querySelector('homeplan-panel'); return {ready:document.readyState,tags:[...document.body.children].map(e=>e.tagName),started:p?.started,dev:p?.bootstrap?.connection?.devMode,remote:p?.instance!==null,app:(()=>{const a=p?.shadowRoot?.querySelector('homeplan-integration-app');return a?{connected:a.isConnected,defined:customElements.get(a.localName)===a.constructor,updated:a.hasUpdated,pending:a.isUpdatePending,context:a.context?.remote,appShadow:a.shadowRoot?.innerHTML.slice(-1800),own:Object.keys(a)}:null})(),shadow:p?.shadowRoot?.innerHTML.slice(0,2000),url:location.href}",
    );
    throw new Error(
      `Timed out: ${label}. State: ${JSON.stringify(state)}. Recent network: ${JSON.stringify(responses.slice(-12))}. Visible: ${JSON.stringify(visible)}. Failed network: ${JSON.stringify(responses.filter((r) => r.status >= 400).slice(-12))}. Browser errors: ${errors.join(" | ")}`,
    );
  };
  const click = async (text) => {
    await wait(
      `return findAll('button').some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`,
      `${text} enabled`,
    );
    await run(
      `findAll('button').find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled).click(); return true`,
    );
  };
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await call("Page.navigate", { url: pageUrl });
  await wait(
    "return findAll('button').some(b=>b.textContent.trim()==='Setup your home')",
    "gradient setup button",
  );
  assert.equal(await run("return findAll('canvas').length"), 0);
  checks++;
  await click("Setup your home");
  await wait(
    "return findAll('homeplan-binding-editor').length===1&&findAll('h3').some(h=>h.textContent.trim()==='House setup')",
    "Settings opened on its House node with House setup",
  );
  await run(
    `const input=findAll('input[type=url]')[0]; input.value=${JSON.stringify(sourceUrl)}; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); return true`,
  );
  await click("Connect");
  await wait(
    "return findAll('button').some(b=>b.textContent.trim()==='Use this house')",
    "connected house list",
  );
  await click("Use this house");
  await wait(
    "return findAll('canvas').some(c=>c.width>0)&&findAll('.house-name').some(h=>h.textContent.includes('Saved B · Shown'))",
    "selected canvas and Settings reopened on the shown house",
  );
  await wait(
    "return findAll('homeplan-binding-editor').length===1&&findAll('.tree-pane .room-row, .tree-pane .item:not(.house-row)').length>0",
    "Settings tree populated with the house's things",
  );
  await delay(1500);
  assert.ok(
    responses.some((r) => r.url.includes("/files/") && r.url.includes("geometry.bin") && r.status === 200),
    "authenticated glTF buffer rendered",
  );
  checks++;
  assert.ok(
    responses.some((r) => r.url.includes("/files/") && r.url.includes("/textures/") && r.status === 200),
    "authenticated nested glTF texture rendered",
  );
  checks++;
  assert.ok(
    responses.some((r) => r.url.includes("/files/images/") && r.status === 200),
    "authenticated house image rendered",
  );
  checks++;
  assert.deepEqual(errors, [], "no uncaught browser exceptions in local setup/render/settings");
  checks++;
  const shot = await call("Page.captureScreenshot", { format: "png" });
  await writeFile("dist/ha-check-fixtures/setup-and-house.png", Buffer.from(shot.data, "base64"));
  await run(
    "const toggle=findAll('homeplan-connection-settings')[0].shadowRoot.querySelector('input[type=checkbox]'); toggle.checked=true; toggle.dispatchEvent(new Event('change',{bubbles:true})); return true",
  );
  await click("Reload page");
  await wait(
    "return findAll('.message').some(e=>e.textContent.includes('DEV MODE — Remote'))&&findAll('canvas').some(c=>c.width>0)",
    "unified remote code/data",
    30000,
  );
  assert.ok(
    responses.some(
      (r) => r.url.startsWith(sourceUrl) && r.url.includes("/ha-viewer/entry.ts") && r.status === 200,
    ),
    "remote viewer code loaded",
  );
  checks++;
  assert.ok(
    responses.some(
      (r) =>
        r.url.includes("/api/homeplan/remote/houses/") && r.url.includes("/document") && r.status === 200,
    ),
    "remote working data loaded",
  );
  checks++;
  await run("return true");
  assert.deepEqual(errors, [], "no uncaught browser exceptions in remote viewer");
  checks++;
  await call("Page.navigate", { url: new URL("homeplan-check?offline=1", pageUrl).href });
  await wait(
    "return findAll('.message').some(e=>e.textContent.includes('Local fallback'))&&findAll('canvas').some(c=>c.width>0)",
    "source-off visible local fallback",
    30000,
  );
  assert.equal(await run("return findAll('homeplan-integration-app')[0]!==undefined"), true);
  checks++;
  console.log(
    `HA browser checks: ${checks} passed (isolated Chromium, real HA auth/routes, private glTF/images, remote code/data and offline fallback).`,
  );
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  await delay(500);
  await rm(profile, { recursive: true, force: true });
}
