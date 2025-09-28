#!/usr/bin/env node

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DAEMON_SCRIPT = join(__dirname, '../src/daemon.ts');
const PID_FILE = join(process.cwd(), '.daemon-pid');

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

function isDaemonRunning() {
  if (!existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8'));
    process.kill(pid, 0); // Check if process exists
    return true;
  } catch {
    return false;
  }
}

function getDaemonPid() {
  if (!existsSync(PID_FILE)) {
    return null;
  }

  try {
    return parseInt(readFileSync(PID_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'start':
      console.log('🚀 Starting Code Mode daemon...');
      try {
        await runCommand('npx tsx', [DAEMON_SCRIPT, 'start']);
      } catch (error) {
        console.error('❌ Failed to start daemon:', error.message);
        process.exit(1);
      }
      break;

    case 'stop':
      console.log('🛑 Stopping Code Mode daemon...');
      if (isDaemonRunning()) {
        const pid = getDaemonPid();
        if (pid) {
          try {
            process.kill(pid, 'SIGTERM');
            console.log('✅ Daemon stop signal sent');
          } catch (error) {
            console.error('❌ Failed to stop daemon:', error.message);
            process.exit(1);
          }
        }
      } else {
        console.log('⚠️  Daemon not running');
      }
      break;

    case 'status':
      if (isDaemonRunning()) {
        const pid = getDaemonPid();
        console.log(`✅ Daemon running (PID: ${pid})`);
      } else {
        console.log('❌ Daemon not running');
      }
      break;

    case 'restart':
      console.log('🔄 Restarting Code Mode daemon...');
      if (isDaemonRunning()) {
        const pid = getDaemonPid();
        if (pid) {
          try {
            process.kill(pid, 'SIGTERM');
            console.log('🛑 Stopped existing daemon');
            // Wait a moment then start
            setTimeout(async () => {
              try {
                await runCommand('npx tsx', [DAEMON_SCRIPT, 'start']);
              } catch (error) {
                console.error('❌ Failed to restart daemon:', error.message);
                process.exit(1);
              }
            }, 2000);
          } catch (error) {
            console.error('❌ Failed to restart daemon:', error.message);
            process.exit(1);
          }
        }
      } else {
        try {
          await runCommand('npx tsx', [DAEMON_SCRIPT, 'start']);
        } catch (error) {
          console.error('❌ Failed to start daemon:', error.message);
          process.exit(1);
        }
      }
      break;

    case 'execute':
      if (args.length === 0) {
        console.error('❌ Usage: code-mode execute <typescript-code>');
        process.exit(1);
      }

      const code = args.join(' ');
      console.log('⚡ Executing TypeScript code...');
      try {
        // This would connect to the daemon's execution endpoint
        // For now, we'll use ts-node directly
        const tempFile = join(process.cwd(), 'temp-execution.ts');
        writeFileSync(tempFile, code);
        await runCommand('npx tsx', [tempFile]);
        unlinkSync(tempFile);
      } catch (error) {
        console.error('❌ Execution failed:', error.message);
        process.exit(1);
      }
      break;

    case 'health':
      console.log('🔍 Checking Code Mode health...');
      if (isDaemonRunning()) {
        console.log('✅ Daemon: Running');
        // Add more health checks here (API endpoint, runtime checks, etc.)
        console.log('✅ Overall status: Healthy');
      } else {
        console.log('❌ Daemon: Not running');
        console.log('❌ Overall status: Unhealthy');
        process.exit(1);
      }
      break;

    default:
      console.log(`
📦 Code Mode CLI

Usage: code-mode <command> [options]

Commands:
  start      Start the Code Mode daemon
  stop       Stop the Code Mode daemon
  restart    Restart the Code Mode daemon
  status     Check if daemon is running
  execute    Execute TypeScript code directly
  health     Check overall system health

Examples:
  code-mode start
  code-mode execute "console.log('Hello, Code Mode!')"
  code-mode status
      `);
  }
}

main().catch(console.error);