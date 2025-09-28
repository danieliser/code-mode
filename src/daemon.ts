#!/usr/bin/env node

import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { fork } from 'child_process';
import { detectEnvironment, logEnvironmentInfo } from './environment';
import { LocalRuntimeManager } from './runtime-manager';

const PID_FILE = join(process.cwd(), '.daemon-pid');
const LOG_FILE = join(process.cwd(), 'logs', 'daemon.log');

interface DaemonConfig {
  environment: any;
  features: {
    typescript: boolean;
    python: boolean;
    javascript: boolean;
    bash: boolean;
  };
  port: number;
}

export class CodeModeDaemon {
  private config: DaemonConfig;
  private runtimeManager: LocalRuntimeManager;

  constructor() {
    this.config = {
      environment: detectEnvironment(),
      features: {
        typescript: true,
        python: true,
        javascript: true,
        bash: true
      },
      port: parseInt(process.env.PORT || '3001')
    };
    this.runtimeManager = new LocalRuntimeManager();
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Code Mode daemon...');

    // Log environment information
    logEnvironmentInfo();

    // Initialize runtime manager
    await this.runtimeManager.initialize();

    // Write PID file
    writeFileSync(PID_FILE, process.pid.toString());

    // Set up graceful shutdown
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());

    console.log(`✅ Code Mode daemon started (PID: ${process.pid})`);
    console.log(`🌐 Environment: ${this.config.environment.type}`);
    console.log(`🔌 Port: ${this.config.port}`);

    // Keep the process alive
    setInterval(() => {
      // Heartbeat or health check logic can go here
    }, 30000);
  }

  stop(): void {
    console.log('🛑 Stopping Code Mode daemon...');

    // Clean up PID file
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }

    // Cleanup runtime manager
    if (this.runtimeManager) {
      // Add cleanup method to runtime manager if needed
    }

    console.log('✅ Code Mode daemon stopped');
    process.exit(0);
  }

  static isRunning(): boolean {
    if (!existsSync(PID_FILE)) {
      return false;
    }

    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf8'));
      process.kill(pid, 0); // Check if process exists
      return true;
    } catch {
      // Process doesn't exist, clean up stale PID file
      unlinkSync(PID_FILE);
      return false;
    }
  }

  static getPid(): number | null {
    if (!existsSync(PID_FILE)) {
      return null;
    }

    try {
      return parseInt(readFileSync(PID_FILE, 'utf8'));
    } catch {
      return null;
    }
  }
}

// Boot sequence function
export async function bootService(): Promise<void> {
  console.log('🔄 Booting Code Mode service...');

  const config = logEnvironmentInfo();
  console.log(`📍 Detected environment: ${config.type} (${config.isCloud ? 'cloud' : 'local'})`);

  const runtimeManager = new LocalRuntimeManager();
  const features = {
    typescript: true,
    python: true,
    javascript: true,
    bash: true
  };

  console.log('🔧 Initializing runtimes...');
  await runtimeManager.initialize();

  console.log('✅ Service boot complete');

  // Start daemon if not running
  if (!CodeModeDaemon.isRunning()) {
    const daemon = new CodeModeDaemon();
    await daemon.start();
  } else {
    console.log('⚠️  Daemon already running');
  }
}

// CLI entry point
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case 'start':
      bootService().catch(console.error);
      break;
    case 'stop':
      if (CodeModeDaemon.isRunning()) {
        const pid = CodeModeDaemon.getPid();
        if (pid) {
          process.kill(pid, 'SIGTERM');
          console.log('✅ Daemon stop signal sent');
        }
      } else {
        console.log('⚠️  Daemon not running');
      }
      break;
    case 'status':
      if (CodeModeDaemon.isRunning()) {
        const pid = CodeModeDaemon.getPid();
        console.log(`✅ Daemon running (PID: ${pid})`);
      } else {
        console.log('❌ Daemon not running');
      }
      break;
    case 'restart':
      console.log('🔄 Restarting daemon...');
      if (CodeModeDaemon.isRunning()) {
        const pid = CodeModeDaemon.getPid();
        if (pid) {
          process.kill(pid, 'SIGTERM');
          // Wait a moment then start
          setTimeout(() => {
            bootService().catch(console.error);
          }, 2000);
        }
      } else {
        bootService().catch(console.error);
      }
      break;
    default:
      console.log('Usage: daemon.ts [start|stop|status|restart]');
  }
}