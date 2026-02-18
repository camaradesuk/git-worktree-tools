/**
 * wt completion - Generate shell completion scripts
 *
 * Generates shell completion scripts for bash, zsh, and fish.
 */

import type { CommandModule } from 'yargs';

interface CompletionArgs {
  shell?: string;
}

export const BASH_COMPLETION = `###-begin-wt-completions-###
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

export const ZSH_COMPLETION = `#compdef wt
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
    'prs:Browse repository pull requests'
    'init:Initialize configuration'
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
            '--action[Action to take]:action:(empty_commit commit_staged commit_all stash_and_empty use_commits push_then_branch use_commits_and_commit_all use_commits_and_stash create_pr_for_branch pr_for_branch_commit_all pr_for_branch_stash branch_from_detached)' \\
            '--no-wtlink[Skip wtlink config sync]' \\
            '--no-hooks[Disable lifecycle hooks]' \\
            '--confirm-hooks[Prompt before running hooks]' \\
            '--plan[Generate AI plan document]' \\
            '--no-plan[Skip plan generation]' \\
            '--ready[Create PR as ready for review]' \\
            '--install[Install dependencies after setup]' \\
            '--code[Open editor to the new worktree]' \\
            '--base[Base branch for PR]:branch:'
          ;;
        list|ls)
          _arguments \\
            '--verbose[Show full paths and commit hashes]' \\
            '--json[Output as JSON]' \\
            '--no-status[Skip GitHub PR status lookup]' \\
            '--no-interactive[Disable interactive mode]' \\
            '--filter[Filter worktrees by type]:filter:(pr main feature)' \\
            '--refresh[Force refresh PR status from GitHub]'
          ;;
        clean|c)
          _arguments \\
            '1:pr-number:' \\
            '--all[Clean all merged/closed worktrees]' \\
            '--dry-run[Show what would be cleaned]' \\
            '--force[Force cleanup even with uncommitted changes]' \\
            '--delete-remote[Delete remote branches after cleaning]' \\
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
            '--verbose[Show detailed state information]' \\
            '--base-branch[Base branch to compare against]:branch:' \\
            '--quiet[Only output state name]'
          ;;
        config|cfg)
          _arguments \\
            '1:command:(interactive init show set get edit validate migrate schema)' \\
            '--json[Output as JSON]' \\
            '--help[Show help]'
          ;;
        prs)
          _arguments \\
            '--state[Filter by PR state]:state:(open closed merged all)' \\
            '--author[Filter by author]:author:' \\
            '--label[Filter by label]:label:' \\
            '--draft[Show only draft PRs]' \\
            '--no-draft[Exclude draft PRs]' \\
            '--with-worktree[Show only PRs with local worktrees]' \\
            '--limit[Maximum PRs to fetch]:number:' \\
            '--json[Output as JSON]' \\
            '--no-interactive[Disable interactive mode]' \\
            '--refresh[Force refresh from GitHub]'
          ;;
        init)
          _arguments \\
            '--local[Create local config]' \\
            '--global[Create global config]' \\
            '--force[Overwrite existing config]'
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

export const FISH_COMPLETION = `# wt fish completion script
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
complete -c wt -n '__fish_use_subcommand' -a 'prs' -d 'Browse repository pull requests'
complete -c wt -n '__fish_use_subcommand' -a 'init' -d 'Initialize configuration'
complete -c wt -n '__fish_use_subcommand' -a 'completion' -d 'Generate shell completion scripts'

# new/n options
complete -c wt -n '__fish_seen_subcommand_from new n' -l pr -s p -d 'Existing PR number' -r
complete -c wt -n '__fish_seen_subcommand_from new n' -l branch -s B -d 'Create PR for existing branch' -r
complete -c wt -n '__fish_seen_subcommand_from new n' -l base -s b -d 'Base branch for PR' -r
complete -c wt -n '__fish_seen_subcommand_from new n' -l draft -s d -d 'Create as draft PR'
complete -c wt -n '__fish_seen_subcommand_from new n' -l ready -s r -d 'Create PR as ready for review'
complete -c wt -n '__fish_seen_subcommand_from new n' -l install -s i -d 'Install dependencies after setup'
complete -c wt -n '__fish_seen_subcommand_from new n' -l code -s c -d 'Open editor to the new worktree'
complete -c wt -n '__fish_seen_subcommand_from new n' -l no-wtlink -d 'Skip wtlink config sync'
complete -c wt -n '__fish_seen_subcommand_from new n' -l no-hooks -d 'Disable lifecycle hooks'
complete -c wt -n '__fish_seen_subcommand_from new n' -l confirm-hooks -d 'Prompt before running hooks'
complete -c wt -n '__fish_seen_subcommand_from new n' -l plan -d 'Generate AI plan document'
complete -c wt -n '__fish_seen_subcommand_from new n' -l no-plan -d 'Skip plan generation'
complete -c wt -n '__fish_seen_subcommand_from new n' -l json -d 'Output result as JSON'
complete -c wt -n '__fish_seen_subcommand_from new n' -l non-interactive -s n -d 'Run without prompts'
complete -c wt -n '__fish_seen_subcommand_from new n' -l yes -s y -d 'Run without prompts'
complete -c wt -n '__fish_seen_subcommand_from new n' -l action -s a -d 'Action to take' -ra 'empty_commit commit_staged commit_all stash_and_empty use_commits push_then_branch use_commits_and_commit_all use_commits_and_stash create_pr_for_branch pr_for_branch_commit_all pr_for_branch_stash branch_from_detached'

# list/ls options
complete -c wt -n '__fish_seen_subcommand_from list ls' -l verbose -s v -d 'Show full paths'
complete -c wt -n '__fish_seen_subcommand_from list ls' -l json -d 'Output as JSON'
complete -c wt -n '__fish_seen_subcommand_from list ls' -l no-status -s s -d 'Skip GitHub PR status'
complete -c wt -n '__fish_seen_subcommand_from list ls' -l no-interactive -s n -d 'Disable interactive mode'
complete -c wt -n '__fish_seen_subcommand_from list ls' -l filter -s f -d 'Filter by type' -ra 'pr main feature'
complete -c wt -n '__fish_seen_subcommand_from list ls' -l refresh -d 'Force refresh PR status from GitHub'

# clean/c options
complete -c wt -n '__fish_seen_subcommand_from clean c' -l all -s a -d 'Clean all merged/closed'
complete -c wt -n '__fish_seen_subcommand_from clean c' -l dry-run -s d -d 'Preview only'
complete -c wt -n '__fish_seen_subcommand_from clean c' -l force -s f -d 'Force cleanup'
complete -c wt -n '__fish_seen_subcommand_from clean c' -l delete-remote -s r -d 'Delete remote branches'
complete -c wt -n '__fish_seen_subcommand_from clean c' -l json -d 'Output as JSON'

# prs options
complete -c wt -n '__fish_seen_subcommand_from prs' -l state -s s -d 'Filter by PR state' -ra 'open closed merged all'
complete -c wt -n '__fish_seen_subcommand_from prs' -l author -s a -d 'Filter by author' -r
complete -c wt -n '__fish_seen_subcommand_from prs' -l label -s l -d 'Filter by label' -r
complete -c wt -n '__fish_seen_subcommand_from prs' -l draft -d 'Show only draft PRs'
complete -c wt -n '__fish_seen_subcommand_from prs' -l no-draft -d 'Exclude draft PRs'
complete -c wt -n '__fish_seen_subcommand_from prs' -l with-worktree -d 'Only PRs with local worktrees'
complete -c wt -n '__fish_seen_subcommand_from prs' -l limit -s n -d 'Maximum PRs to fetch' -r
complete -c wt -n '__fish_seen_subcommand_from prs' -l json -s j -d 'Output as JSON'
complete -c wt -n '__fish_seen_subcommand_from prs' -l no-interactive -d 'Disable interactive mode'
complete -c wt -n '__fish_seen_subcommand_from prs' -l refresh -s r -d 'Force refresh from GitHub'

# init options
complete -c wt -n '__fish_seen_subcommand_from init' -l local -s l -d 'Create local config'
complete -c wt -n '__fish_seen_subcommand_from init' -l global -s g -d 'Create global config'
complete -c wt -n '__fish_seen_subcommand_from init' -l force -s f -d 'Overwrite existing config'

# link/l subcommands
complete -c wt -n '__fish_seen_subcommand_from link l' -a 'link' -d 'Create hard links'
complete -c wt -n '__fish_seen_subcommand_from link l' -a 'manage' -d 'Manage manifest'
complete -c wt -n '__fish_seen_subcommand_from link l' -a 'validate' -d 'Validate manifest'

# state/s options
complete -c wt -n '__fish_seen_subcommand_from state s' -l json -d 'Output as JSON'
complete -c wt -n '__fish_seen_subcommand_from state s' -l verbose -s v -d 'Show detailed state'
complete -c wt -n '__fish_seen_subcommand_from state s' -l base-branch -s b -d 'Base branch to compare against' -r
complete -c wt -n '__fish_seen_subcommand_from state s' -l quiet -s q -d 'Only output state name'

# config/cfg subcommands
complete -c wt -n '__fish_seen_subcommand_from config cfg' -a 'show' -d 'Show config'
complete -c wt -n '__fish_seen_subcommand_from config cfg' -a 'init' -d 'Initialize config'
complete -c wt -n '__fish_seen_subcommand_from config cfg' -a 'set' -d 'Set config value'
complete -c wt -n '__fish_seen_subcommand_from config cfg' -a 'get' -d 'Get config value'
complete -c wt -n '__fish_seen_subcommand_from config cfg' -a 'edit' -d 'Edit config'
complete -c wt -n '__fish_seen_subcommand_from config cfg' -a 'validate' -d 'Validate config'
complete -c wt -n '__fish_seen_subcommand_from config cfg' -a 'migrate' -d 'Migrate legacy config'

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
