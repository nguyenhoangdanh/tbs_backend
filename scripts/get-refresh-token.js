// Wrapper: chạy script TypeScript gốc
require('child_process').execFileSync(
  'npx', ['ts-node', 'scripts/get-drive-oauth-token.ts'],
  { stdio: 'inherit', cwd: __dirname + '/..' }
);
