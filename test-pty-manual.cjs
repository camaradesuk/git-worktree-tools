const pty = require('node-pty');
const path = require('path');

const CLI_DIR = path.resolve('./dist/cli');
const repoDir = process.cwd();

const env = {
  ...process.env,
  FORCE_COLOR: '0',
  NO_COLOR: '1',
  TERM: 'xterm-256color',
};

console.log('Starting wt command...');
console.log('CWD:', repoDir);

const shell = '/bin/sh';
const shellArgs = ['-c', `node "${CLI_DIR}/wt.js"`];

const ptyProcess = pty.spawn(shell, shellArgs, {
  name: 'xterm-256color',
  cols: 120,
  rows: 30,
  cwd: repoDir,
  env,
});

let output = '';

ptyProcess.onData((data) => {
  output += data;
  process.stdout.write(data);
});

// Wait for menu, then navigate
setTimeout(() => {
  console.log('\n\n--- Sending DOWN arrow ---\n');
  ptyProcess.write('\x1B[B'); // Down arrow
}, 1500);

setTimeout(() => {
  console.log('\n\n--- Sending ENTER to select Browse PRs ---\n');
  ptyProcess.write('\r'); // Enter
}, 2500);

setTimeout(() => {
  console.log('\n\n--- Sending q to quit ---\n');
  ptyProcess.write('q');
}, 5000);

setTimeout(() => {
  console.log('\n\n=== SUMMARY ===\n');
  console.log('Output contains "Browse PR":', output.includes('Browse PR'));
  console.log(
    'Output contains "Pull Request":',
    output.includes('Pull Request') || output.includes('pull request')
  );
  console.log('Output contains repo name:', output.includes('git-worktree-tools'));

  // Check if we actually reached the PR browser view
  const reachedPrView =
    output.includes('Pull Requests') ||
    output.includes('0 PRs') ||
    output.includes('open') ||
    output.includes('#');
  console.log('Reached PR browser view:', reachedPrView);

  ptyProcess.kill();
  process.exit(0);
}, 6500);
