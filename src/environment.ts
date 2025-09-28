export interface DeploymentEnvironment {
  type: 'railway' | 'fly' | 'heroku' | 'docker' | 'local';
  isCloud: boolean;
  port: number;
  features: {
    persistence: boolean;
    scaling: boolean;
    monitoring: boolean;
  };
}

export function detectEnvironment(): DeploymentEnvironment {
  const env = process.env;

  // Railway detection
  if (env.RAILWAY_ENVIRONMENT) {
    return {
      type: 'railway',
      isCloud: true,
      port: parseInt(env.PORT || '3000'),
      features: {
        persistence: true,
        scaling: true,
        monitoring: true
      }
    };
  }

  // Fly.io detection
  if (env.FLY_APP_NAME) {
    return {
      type: 'fly',
      isCloud: true,
      port: parseInt(env.PORT || '8080'),
      features: {
        persistence: true,
        scaling: true,
        monitoring: true
      }
    };
  }

  // Heroku detection
  if (env.DYNO) {
    return {
      type: 'heroku',
      isCloud: true,
      port: parseInt(env.PORT || '3000'),
      features: {
        persistence: false, // Ephemeral filesystem
        scaling: true,
        monitoring: true
      }
    };
  }

  // Docker detection
  if (env.DOCKER_CONTAINER || existsSync('/.dockerenv')) {
    return {
      type: 'docker',
      isCloud: false,
      port: parseInt(env.PORT || '3001'),
      features: {
        persistence: true,
        scaling: false,
        monitoring: false
      }
    };
  }

  // Default to local
  return {
    type: 'local',
    isCloud: false,
    port: parseInt(env.PORT || '3001'),
    features: {
      persistence: true,
      scaling: false,
      monitoring: false
    }
  };
}

export function logEnvironmentInfo(): DeploymentEnvironment {
  const config = detectEnvironment();

  console.log('🌍 Environment Detection:');
  console.log(`  Type: ${config.type}`);
  console.log(`  Cloud: ${config.isCloud ? 'Yes' : 'No'}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Features:`);
  console.log(`    Persistence: ${config.features.persistence ? 'Yes' : 'No'}`);
  console.log(`    Scaling: ${config.features.scaling ? 'Yes' : 'No'}`);
  console.log(`    Monitoring: ${config.features.monitoring ? 'Yes' : 'No'}`);

  return config;
}

// Helper function for Docker detection
function existsSync(path: string): boolean {
  try {
    require('fs').accessSync(path);
    return true;
  } catch {
    return false;
  }
}