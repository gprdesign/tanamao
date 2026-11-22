#!/usr/bin/env python3
"""Only loopback and an ephemeral Chromium profile; no real data or services."""
import asyncio, http.server, json, os, socket, subprocess, tempfile, threading, time, urllib.request
import websockets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
os.chdir(ROOT)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Quiet)
threading.Thread(target=server.serve_forever,daemon=True).start()
with socket.socket() as s:
    s.bind(('127.0.0.1',0)); port=s.getsockname()[1]
async def run(wsurl):
    async with websockets.connect(wsurl,max_size=4_000_000) as ws:
        await ws.send(json.dumps({'id':1,'method':'Page.navigate','params':{'url':f'http://127.0.0.1:{server.server_port}/lab/multitab-tests.html'}}))
        await ws.recv()
        for i in range(2,102):
            await asyncio.sleep(.1)
            await ws.send(json.dumps({'id':i,'method':'Runtime.evaluate','params':{'expression':"document.querySelector('#out')?.textContent || ''",'returnByValue':True}}))
            while True:
                result=json.loads(await ws.recv())
                if result.get('id')==i: break
            text=result.get('result',{}).get('result',{}).get('value','')
            if text.startswith('ALL PASS') or text.startswith('FAIL'):
                print(text)
                if not text.startswith('ALL PASS'): raise SystemExit(1)
                return
        raise SystemExit('Timeout no teste IndexedDB')
try:
    with tempfile.TemporaryDirectory(prefix='tnm-chromium-test-') as profile:
        browser=subprocess.Popen(['chromium','--headless','--no-sandbox','--disable-gpu','--disable-popup-blocking','--disable-dev-shm-usage','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--no-first-run','--remote-allow-origins=*',f'--remote-debugging-port={port}',f'--user-data-dir={profile}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try:
                    targets=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json',timeout=1));break
                except Exception: time.sleep(.1)
            else: raise SystemExit('Chromium não inicializou')
            page=next(t for t in targets if t['type']=='page')
            asyncio.run(run(page['webSocketDebuggerUrl']))
        finally:
            browser.terminate()
            try: browser.wait(timeout=5)
            except subprocess.TimeoutExpired: browser.kill(); browser.wait()
finally: server.shutdown()
