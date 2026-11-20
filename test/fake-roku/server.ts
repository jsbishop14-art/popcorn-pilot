// The fake Roku: an ECP server plus an SSDP responder, standing in for real TVs in every test and CI run.
import http from 'node:http';
import dgram from 'node:dgram';
import type { AddressInfo } from 'node:net';

export interface FakeRokuCall {
  method: string;
  path: string;
  query: Record<string, string>;
}

export interface FakeRokuOptions {
  name?: string;
  serial?: string;
  model?: string;
  port?: number;
  /** UDP port to answer SSDP M-SEARCH on (0 = pick one; undefined = no SSDP). */
  ssdpPort?: number;
  /** Answer every ECP call with 403, like a Roku with "Control by mobile apps" off. */
  refuseControl?: boolean;
}

export interface FakeRoku {
  port: number;
  ssdpPort: number | null;
  calls: FakeRokuCall[];
  state: { power: 'on' | 'standby'; activeApp: { id: string | null; name: string }; player: 'play' | 'pause' | 'close' };
  close(): Promise<void>;
}

const APPS: Record<string, string> = { '12': 'Netflix', '13': 'Prime Video', '2285': 'Hulu', '837': 'YouTube', dev: 'Popcorn Pilot' };

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function startFakeRoku(opts: FakeRokuOptions = {}): Promise<FakeRoku> {
  const name = opts.name ?? 'Fake Roku';
  const calls: FakeRokuCall[] = [];
  const state: FakeRoku['state'] = { power: 'on', activeApp: { id: null, name: 'Roku' }, player: 'close' };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const call = { method: req.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams) };
    calls.push(call);
    const xml = (body: string) => {
      res.writeHead(200, { 'content-type': 'text/xml; charset="utf-8"' });
      res.end(`<?xml version="1.0" encoding="UTF-8" ?>\n${body}`);
    };
    if (opts.refuseControl) {
      res.writeHead(403);
      res.end();
      return;
    }
    const p = url.pathname;
    if (call.method === 'GET' && p === '/query/device-info') {
      return xml(
        `<device-info><serial-number>${esc(opts.serial ?? 'FAKE0001')}</serial-number><model-name>${esc(opts.model ?? 'Roku Ultra')}</model-name>` +
          `<user-device-name>${esc(name)}</user-device-name><power-mode>${state.power === 'on' ? 'PowerOn' : 'DisplayOff'}</power-mode></device-info>`,
      );
    }
    if (call.method === 'GET' && p === '/query/active-app') {
      const a = state.activeApp;
      return xml(a.id ? `<active-app><app id="${esc(a.id)}" type="appl" version="1.0">${esc(a.name)}</app></active-app>` : `<active-app><app>Roku</app></active-app>`);
    }
    if (call.method === 'GET' && p === '/query/media-player') {
      const id = state.activeApp.id;
      return xml(
        `<player error="false" state="${state.player}">${id ? `<plugin bandwidth="10000000 bps" id="${esc(id)}" name="${esc(state.activeApp.name)}"/>` : ''}` +
          (state.player === 'close' ? '' : '<position>120000 ms</position><duration>1320000 ms</duration>') +
          `</player>`,
      );
    }
    if (call.method === 'POST' && p.startsWith('/keypress/')) {
      const key = decodeURIComponent(p.slice('/keypress/'.length));
      if (key === 'PowerOff') state.power = 'standby';
      if (key === 'PowerOn') state.power = 'on';
      if (key === 'Home') state.activeApp = { id: null, name: 'Roku' };
      res.writeHead(200);
      res.end();
      return;
    }
    if (call.method === 'POST' && p.startsWith('/launch/')) {
      const id = decodeURIComponent(p.slice('/launch/'.length));
      state.activeApp = { id, name: APPS[id] ?? `Channel ${id}` };
      state.player = call.query.contentId ? 'play' : 'close';
      state.power = 'on';
      res.writeHead(200);
      res.end();
      return;
    }
    if (call.method === 'POST' && p === '/search/browse') {
      const provider = call.query['provider-id'];
      if (call.query.launch === 'true' && provider) {
        state.activeApp = { id: provider, name: APPS[provider] ?? `Channel ${provider}` };
        state.player = 'play';
      }
      res.writeHead(200);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  let ssdp: dgram.Socket | null = null;
  let ssdpPort: number | null = null;
  if (opts.ssdpPort !== undefined) {
    const sock = dgram.createSocket('udp4');
    sock.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8');
      if (!/^M-SEARCH/i.test(text) || !/^st:\s*(roku:ecp|ssdp:all)\s*$/im.test(text)) return;
      const reply = `HTTP/1.1 200 OK\r\nCache-Control: max-age=3600\r\nST: roku:ecp\r\nLocation: http://127.0.0.1:${port}/\r\nUSN: uuid:roku:ecp:${opts.serial ?? 'FAKE0001'}\r\n\r\n`;
      sock.send(reply, rinfo.port, rinfo.address);
    });
    await new Promise<void>((resolve) => sock.bind(opts.ssdpPort, '127.0.0.1', resolve));
    ssdp = sock;
    ssdpPort = sock.address().port;
  }

  return {
    port,
    ssdpPort,
    calls,
    state,
    close: () =>
      new Promise<void>((resolve) => {
        ssdp?.close();
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
