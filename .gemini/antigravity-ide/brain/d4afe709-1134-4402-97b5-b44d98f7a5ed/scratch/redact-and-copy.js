const fs = require('fs');
const path = require('path');

const srcRoot = 'c:\\Users\\pejos\\OneDrive\\Desktop\\Anti';
const destRoot = path.join(srcRoot, 'lumen-backend-audit');

const filesToProcess = [
  { src: 'server.ts', dest: 'server.ts' },
  { src: 'api/index.ts', dest: 'api/index.ts' },
  { src: 'src/lib/supabaseClient.ts', dest: 'src/lib/supabaseClient.ts' },
  { src: 'scripts/reset-passwords.ts', dest: 'scripts/reset-passwords.ts' },
  { src: 'scripts/seed-ignite-agency.ts', dest: 'scripts/seed-ignite-agency.ts' },
  { src: 'scripts/seed-tenant.ts', dest: 'scripts/seed-tenant.ts' },
  { src: 'scripts/verify-auth.ts', dest: 'scripts/verify-auth.ts' },
  { src: 'scripts/verify-branding.ts', dest: 'scripts/verify-branding.ts' },
  { src: 'scripts/verify-client-limit.ts', dest: 'scripts/verify-client-limit.ts' },
  { src: 'scripts/verify-cta-pdf.ts', dest: 'scripts/verify-cta-pdf.ts' },
  { src: 'scripts/verify-features.ts', dest: 'scripts/verify-features.ts' },
  { src: '.env.example', dest: '.env.example' },
  { src: '.env', dest: '.env', isEnv: true },
  { src: '.env.local', dest: '.env.local', isEnv: true }
];

function ensureDirSync(dirpath) {
  if (!fs.existsSync(dirpath)) {
    fs.mkdirSync(dirpath, { recursive: true });
  }
}

// Helper to check and redact credentials using regular expressions
function redactContent(content, filename) {
  let redacted = content;

  // 1. Redact JWT strings (including those starting with eyJhbGciOi or eyJhbGciOiJIUzI1Ni)
  const jwtRegex = /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_+/=]*\b/g;
  redacted = redacted.replace(jwtRegex, '[REDACTED]');

  // 2. Redact hardcoded passwords from scripts
  const passwords = [
    'IgnitePass123!',
    'AgencyPass123!',
    'AdminPass123!'
  ];
  for (const pw of passwords) {
    redacted = redacted.split(pw).join('[REDACTED]');
  }

  // 3. Redact default Windsor API secret values
  redacted = redacted.split('windsor_secret_123').join('[REDACTED]');
  redacted = redacted.split('MY_GEMINI_API_KEY').join('[REDACTED]');
  redacted = redacted.split('MY_CLAUDE_API_KEY').join('[REDACTED]');
  redacted = redacted.split('MY_ANTHROPIC_API_KEY').join('[REDACTED]');

  return redacted;
}

function processEnvFile(content) {
  const lines = content.split(/\r?\n/);
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return line; // preserve comments and blank lines
    }
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const varName = line.substring(0, eqIdx).trim();
      return `${varName}=[REDACTED]`;
    }
    return line;
  });
  return processedLines.join('\n');
}

console.log('Starting file copying and redaction process...');

for (const entry of filesToProcess) {
  const fullSrcPath = path.join(srcRoot, entry.src);
  const fullDestPath = path.join(destRoot, entry.dest);

  if (!fs.existsSync(fullSrcPath)) {
    console.warn(`Source file not found, skipping: ${fullSrcPath}`);
    continue;
  }

  console.log(`Processing: ${entry.src} -> ${entry.dest}`);
  ensureDirSync(path.dirname(fullDestPath));

  let content = fs.readFileSync(fullSrcPath, 'utf8');

  if (entry.isEnv) {
    content = processEnvFile(content);
  } else {
    content = redactContent(content, entry.src);
  }

  fs.writeFileSync(fullDestPath, content, 'utf8');
}

console.log('Source file copying and redaction completed successfully!');
