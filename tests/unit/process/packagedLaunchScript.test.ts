/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(__dirname, '../../..');
const scriptPath = path.join(repoRoot, 'scripts', 'packaged-launch.sh');

describe('packaged-launch.sh', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it('overwrites the previous launch log and captures packaged app output', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'packaged-launch-script-'));
    tempDirs.push(tempDir);

    const fakeAppPath = path.join(tempDir, 'fake-aionui.sh');
    const logPath = path.join(tempDir, 'packaged-app.log');

    await fs.writeFile(fakeAppPath, '#!/bin/sh\necho "fake app stdout"\necho "fake app stderr" >&2\n', 'utf-8');
    await fs.chmod(fakeAppPath, 0o755);
    await fs.writeFile(logPath, 'old log content\n', 'utf-8');

    const { stdout } = await execFileAsync('sh', [scriptPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AIONUI_PACKAGED_EXECUTABLE: fakeAppPath,
        AIONUI_PACKAGED_CWD: tempDir,
        AIONUI_PACKAGED_LOG_FILE: logPath,
      },
    });

    expect(stdout).toContain(`[packaged-launch] log file: ${logPath}`);

    const logContent = await fs.readFile(logPath, 'utf-8');
    expect(logContent).toContain('[packaged-launch] executable:');
    expect(logContent).toContain('fake app stdout');
    expect(logContent).toContain('fake app stderr');
    expect(logContent).not.toContain('old log content');
  });
});
