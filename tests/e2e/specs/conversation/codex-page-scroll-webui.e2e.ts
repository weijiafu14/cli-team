/**
 * Browser-side regression for the real Codex ACP conversation page.
 *
 * This intentionally targets the already-running PM2 WebUI environment instead of
 * packaged Electron smoke, because the user explicitly asked for browser-based
 * end-to-end validation against the live dev runtime.
 */
import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const WEBUI_URL = process.env.AIONUI_WEBUI_URL || 'http://127.0.0.1:25809';
const TARGET_CONVERSATION_ID = process.env.AIONUI_SCROLL_CONVERSATION_ID || '1b79160c';
const SESSION_COOKIE_NAME = 'aionui-session';
const DEFAULT_DEV_DB = path.join(os.homedir(), '.aionui-dev/aionui.db');
const DEFAULT_APP_DB = path.join(os.homedir(), 'Library/Application Support/AionUi/aionui/aionui.db');

type AdminRow = {
  id: string;
  username: string;
  jwt_secret: string;
};

function getAdminRow(): AdminRow {
  const dbPath = process.env.AIONUI_WEBUI_DB || (fs.existsSync(DEFAULT_DEV_DB) ? DEFAULT_DEV_DB : DEFAULT_APP_DB);
  const raw = execFileSync('sqlite3', [
    dbPath,
    '-json',
    "select id, username, jwt_secret from users where username='admin' limit 1;",
  ]).toString();
  const rows = JSON.parse(raw) as AdminRow[];
  if (!rows.length) {
    throw new Error('WebUI admin user not found');
  }
  return rows[0];
}

function makeSessionToken(row: AdminRow): string {
  return jwt.sign(
    {
      userId: row.id,
      username: row.username,
    },
    row.jwt_secret,
    {
      expiresIn: '24h',
      issuer: 'aionui',
      audience: 'aionui-webui',
    }
  );
}

test.describe('Codex WebUI conversation page', () => {
  test('opens the real Codex ACP conversation close to the bottom', async ({ page, context }) => {
    const admin = getAdminRow();
    const sessionToken = makeSessionToken(admin);
    const url = new URL(WEBUI_URL);

    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: sessionToken,
        domain: url.hostname,
        path: '/',
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);

    await page.goto(`${WEBUI_URL}/#/conversation/${TARGET_CONVERSATION_ID}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });

    await page.waitForTimeout(8_000);

    const scrollInfo = await page.evaluate(() => {
      const scroller = document.querySelector('div.flex-1.h-full.pb-10px.box-border');
      if (!(scroller instanceof HTMLDivElement)) {
        return null;
      }

      return {
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        distanceToBottom: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight,
        bodyText: document.body.innerText,
      };
    });

    expect(scrollInfo).not.toBeNull();
    expect(scrollInfo?.bodyText || '').toContain('Codex');
    expect(scrollInfo?.distanceToBottom ?? Number.POSITIVE_INFINITY).toBeLessThan(200);
  });
});
