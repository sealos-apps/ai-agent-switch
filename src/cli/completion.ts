const commands = [
  "status",
  "doctor",
  "config",
  "client",
  "provider",
  "preset-list",
  "model",
  "route",
  "use",
  "use-all",
  "current",
  "proxy",
  "completion",
];

export function completionScript(shell: string): string {
  if (shell === "zsh") return zshCompletion();
  if (shell === "bash") return bashCompletion();
  throw new Error(`Unsupported shell: ${shell}`);
}

function zshCompletion(): string {
  return `#compdef agent-switch as

_agent_switch() {
  local -a commands
  commands=(${commands.map((command) => `"${command}:${command}"`).join(" ")})
  _describe 'command' commands
}

compdef _agent_switch agent-switch
compdef _agent_switch as
`;
}

function bashCompletion(): string {
  return `_agent_switch_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "${commands.join(" ")}" -- "$cur") )
}

complete -F _agent_switch_complete agent-switch
complete -F _agent_switch_complete as
`;
}
