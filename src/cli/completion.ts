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
  return `#compdef ai-agent-switch as

_ai_agent_switch() {
  local -a commands
  commands=(${commands.map((command) => `"${command}:${command}"`).join(" ")})
  _describe 'command' commands
}

compdef _ai_agent_switch ai-agent-switch
compdef _ai_agent_switch as
`;
}

function bashCompletion(): string {
  return `_ai_agent_switch_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "${commands.join(" ")}" -- "$cur") )
}

complete -F _ai_agent_switch_complete ai-agent-switch
complete -F _ai_agent_switch_complete as
`;
}
