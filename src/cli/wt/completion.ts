/**
 * wt completion - Generate shell completion scripts
 *
 * Generates shell completion scripts for bash, zsh, and fish.
 */

import type { CommandModule } from 'yargs';

interface CompletionArgs {
  shell?: string;
}

const BASH_COMPLETION = `###-begin-wt-completions-###
#
# wt bash completion script
#
# Installation:
#   wt completion bash >> ~/.bashrc
#   source ~/.bashrc
#
_wt_yargs_completions()
{
    local cur_word args type_list

    cur_word="\${COMP_WORDS[COMP_CWORD]}"
    args=("\${COMP_WORDS[@]}")

    # ask yargs to generate completions
    type_list=$(wt --get-yargs-completions "\${args[@]}")

    COMPREPLY=( $(compgen -W "\${type_list}" -- \${cur_word}) )

    # if no match was found, fall back to filename completion
    if [ \${#COMPREPLY[@]} -eq 0 ]; then
      COMPREPLY=()
    fi

    return 0
}
complete -o bashdefault -o default -F _wt_yargs_completions wt
###-end-wt-completions-###`;

const ZSH_COMPLETION = `#compdef wt
###-begin-wt-completions-###
#
# wt zsh completion script
#
# Installation:
#   wt completion zsh > ~/.zsh/completions/_wt
#   # Add to .zshrc: fpath=(~/.zsh/completions $fpath)
#   autoload -Uz compinit && compinit
#

_wt() {
  local -a commands
  commands=(
    'new:Create a new PR with a dedicated worktree'
    'n:Create a new PR with a dedicated worktree'
    'list:List worktrees with PR status'
    'ls:List worktrees with PR status'
    'clean:Clean up merged/closed PR worktrees'
    'c:Clean up merged/closed PR worktrees'
    'link:Manage gitignored files via hard links'
    'l:Manage gitignored files via hard links'
    'state:Query git worktree state'
    's:Query git worktree state'
    'config:Configuration management'
    'cfg:Configuration management'
    'completion:Generate shell completion scripts'
  )

  _arguments -C \\
    '1: :->command' \\
    '*::arg:->args'

  case "$state" in
    command)
      _describe -t commands 'wt command' commands
      ;;
    args)
      case $words[1] in
        new|n)
          _arguments \\
            '1:description:' \\
            '--pr[Existing PR number]:number:' \\
            '--draft[Create as draft PR]' \\
            '--json[Output result as JSON]' \\
            '--non-interactive[Run without prompts]' \\
            '--action[Action to take]:action:(commit_all commit_staged stash)' \\
            '--stash-untracked[Also stash untracked files]'
          ;;
        list|ls)
          _arguments \\
            '--verbose[Show full paths and commit hashes]' \\
            '--json[Output as JSON]' \\
            '--no-status[Skip GitHub PR status lookup]' \\
            '--no-interactive[Disable interactive mode]' \\
            '--filter[Filter worktrees by type]:filter:(pr main feature)'
          ;;
        clean|c)
          _arguments \\
            '1:pr-number:' \\
            '--all[Clean all merged/closed worktrees]' \\
            '--dry-run[Show what would be cleaned]' \\
            '--force[Force cleanup even with uncommitted changes]' \\
            '--json[Output result as JSON]'
          ;;
        link|l)
          _arguments \\
            '1:command:(link manage validate)' \\
            '--help[Show help]'
          ;;
        state|s)
          _arguments \\
            '--json[Output as JSON]' \\
            '--quiet[Only output state name]'
          ;;
        config|cfg)
          _arguments \\
            '1:command:(show init edit)' \\
            '--help[Show help]'
          ;;
        completion)
          _arguments \\
            '1:shell:(bash zsh fish)'
          ;;
      esac
      ;;
  esac
}

_wt "$@"
###-end-wt-completions-###`;

const FISH_COMPLETION = `# wt fish completion script
#
# Installation:
#   wt completion fish > ~/.config/fish/completions/wt.fish
#

# Disable file completions for the wt command
complete -c wt -f

# Main commands
complete -c wt -n '__fish_use_subcommand' -a 'new' -d 'Create a new PR with a dedicated worktree'
complete -c wt -n '__fish_use_subcommand' -a 'n' -d 'Create a new PR (alias)'
complete -c wt -n '__fish_use_subcommand' -a 'list' -d 'List worktrees with PR status'
complete -c wt -n '__fish_use_subcommand' -a 'ls' -d 'List worktrees (alias)'
complete -c wt -n '__fish_use_subcommand' -a 'clean' -d 'Clean up merged/closed PR worktrees'
complete -c wt -n '__fish_use_subcommand' -a 'c' -d 'Clean worktrees (alias)'
complete -c wt -n '__fish_use_subcommand' -a 'link' -d 'Manage gitignored files via hard links'
complete -c wt -n '__fish_use_subcommand' -a 'l' -d 'Link files (alias)'
complete -c wt -n '__fish_use_subcommand' -a 'state' -d 'Query git worktree state'
complete -c wt -n '__fish_use_subcommand' -a 's' -d 'Query state (alias)'
complete -c wt -n '__fish_use_subcommand' -a 'config' -d 'Configuration management'
complete -c wt -n '__fish_use_subcommand' -a 'cfg' -d 'Config (alias)'
complete -c wt -n '__fish_use_subcommand' -a 'completion' -d 'Generate shell completion scripts'

# new/n options
complete -c wt -n '__fish_seen_subcommand_from new n' -l pr -s p -d 'Existing PR number' -r
complete -c wt -n '__fish_seen_subcommand_from new n' -l draft -s d -d 'Create as draft PR'
complete -c wt -n '__fish_seen_subcommand_from new n' -l json -d 'Output result as JSON'
complete -c wt -n '__fish_seen_subcommand_from new n' -l non-interactive -s n -d 'Run without prompts'
complete -c wt -n '__fish_seen_subcommand_from new n' -l action -s a -d 'Action to take' -ra 'commit_all commit_staged stash'
complete -c wt -n '__fish_seen_subcommand_from new n' -l stash-untracked -d 'Also stash untracked files'

# list/ls options
complete -c wt -n '__fish_seen_subcommand_from list ls' -l verbose -s v -d 'Show full paths'
complete -c wt -n '__fish_seen_subcommand_from list ls' -l json -d 'Output as JSON'
complete -c wt -n '__fish_seen_subcommand_from list ls' -l no-status -s s -d 'Skip GitHub PR status'
complete -c wt -n '__fish_seen_subcommand_from list ls' -l no-interactive -s n -d 'Disable interactive mode'
complete -c wt -n '__fish_seen_subcommand_from list ls' -l filter -s f -d 'Filter by type' -ra 'pr main feature'

# clean/c options
complete -c wt -n '__fish_seen_subcommand_from clean c' -l all -s a -d 'Clean all merged/closed'
complete -c wt -n '__fish_seen_subcommand_from clean c' -l dry-run -s d -d 'Preview only'
complete -c wt -n '__fish_seen_subcommand_from clean c' -l force -s f -d 'Force cleanup'
complete -c wt -n '__fish_seen_subcommand_from clean c' -l json -d 'Output as JSON'

# link/l subcommands
complete -c wt -n '__fish_seen_subcommand_from link l' -a 'link' -d 'Create hard links'
complete -c wt -n '__fish_seen_subcommand_from link l' -a 'manage' -d 'Manage manifest'
complete -c wt -n '__fish_seen_subcommand_from link l' -a 'validate' -d 'Validate manifest'

# state/s options
complete -c wt -n '__fish_seen_subcommand_from state s' -l json -d 'Output as JSON'
complete -c wt -n '__fish_seen_subcommand_from state s' -l quiet -s q -d 'Only output state name'

# config/cfg subcommands
complete -c wt -n '__fish_seen_subcommand_from config cfg' -a 'show' -d 'Show config'
complete -c wt -n '__fish_seen_subcommand_from config cfg' -a 'init' -d 'Initialize config'
complete -c wt -n '__fish_seen_subcommand_from config cfg' -a 'edit' -d 'Edit config'

# completion shells
complete -c wt -n '__fish_seen_subcommand_from completion' -a 'bash' -d 'Bash completion'
complete -c wt -n '__fish_seen_subcommand_from completion' -a 'zsh' -d 'Zsh completion'
complete -c wt -n '__fish_seen_subcommand_from completion' -a 'fish' -d 'Fish completion'
`;

export const completionCommand: CommandModule<object, CompletionArgs> = {
  command: 'completion [shell]',
  describe: 'Generate shell completion scripts',
  builder: (yargs) => {
    return yargs
      .positional('shell', {
        describe: 'Shell type',
        type: 'string',
        choices: ['bash', 'zsh', 'fish'],
      })
      .example('$0 completion bash >> ~/.bashrc', 'Add bash completion to your profile')
      .example('$0 completion zsh > ~/.zsh/completions/_wt', 'Create zsh completion file')
      .example(
        '$0 completion fish > ~/.config/fish/completions/wt.fish',
        'Create fish completion file'
      );
  },
  handler: (argv) => {
    if (!argv.shell) {
      console.log(`
wt completion - Generate shell completion scripts

Usage: wt completion <shell>

Shells:
  bash    Bash completion script
  zsh     Zsh completion script
  fish    Fish completion script

Installation:

  Bash:
    wt completion bash >> ~/.bashrc
    source ~/.bashrc

  Zsh:
    mkdir -p ~/.zsh/completions
    wt completion zsh > ~/.zsh/completions/_wt
    # Add to .zshrc: fpath=(~/.zsh/completions $fpath)
    # Then run: autoload -Uz compinit && compinit

  Fish:
    wt completion fish > ~/.config/fish/completions/wt.fish
`);
      return;
    }

    switch (argv.shell) {
      case 'bash':
        console.log(BASH_COMPLETION);
        break;
      case 'zsh':
        console.log(ZSH_COMPLETION);
        break;
      case 'fish':
        console.log(FISH_COMPLETION);
        break;
    }
  },
};
