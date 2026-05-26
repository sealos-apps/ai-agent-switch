#!/usr/bin/env sh
set -eu

AI_AGENT_SWITCH_REPO="${AI_AGENT_SWITCH_REPO:-sealos-apps/ai-agent-switch}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
VERSION=""

usage() {
  cat <<'EOF'
Usage:
  install.sh <vX.Y.Z>
  install.sh --version <vX.Y.Z> [--install-dir <dir>]

Examples:
  curl -fsSL https://raw.githubusercontent.com/sealos-apps/ai-agent-switch/main/install.sh | sh -s -- vX.Y.Z
  curl -fsSL https://raw.githubusercontent.com/sealos-apps/ai-agent-switch/main/install.sh | sh -s -- --version vX.Y.Z --install-dir /usr/local/bin

Environment:
  AI_AGENT_SWITCH_REPO  GitHub repo, default: sealos-apps/ai-agent-switch
  INSTALL_DIR           Install directory, default: /usr/local/bin
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      VERSION="${2:-}"
      [ -n "$VERSION" ] || { echo "Missing value for --version" >&2; exit 1; }
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      [ -n "$INSTALL_DIR" ] || { echo "Missing value for --install-dir" >&2; exit 1; }
      shift 2
      ;;
    v*.*.*)
      VERSION="$1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

[ -n "$VERSION" ] || { echo "--version is required" >&2; exit 1; }

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"

case "$os/$arch" in
  linux/x86_64|linux/amd64) platform="linux-x64"; archive="ai-agent-switch-linux-x64.tar.gz" ;;
  darwin/arm64|darwin/aarch64) platform="darwin-arm64"; archive="ai-agent-switch-darwin-arm64.tar.gz" ;;
  darwin/x86_64|darwin/amd64) platform="darwin-x64"; archive="ai-agent-switch-darwin-x64.tar.gz" ;;
  *)
    echo "Unsupported platform: $os/$arch" >&2
    exit 1
    ;;
esac

tmp_dir="$(mktemp -d 2>/dev/null || mktemp -d -t ai-agent-switch)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

url="https://github.com/${AI_AGENT_SWITCH_REPO}/releases/download/${VERSION}/${archive}"
archive_path="${tmp_dir}/${archive}"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$url" -o "$archive_path"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$archive_path" "$url"
else
  echo "curl or wget is required" >&2
  exit 1
fi

tar -xzf "$archive_path" -C "$tmp_dir"
install -m 0755 "${tmp_dir}/ai-agent-switch-${platform}/ai-agent-switch" "${INSTALL_DIR}/ai-agent-switch"
install -m 0755 "${tmp_dir}/ai-agent-switch-${platform}/as" "${INSTALL_DIR}/as"

expected_version="${VERSION#v}"
installed_version="$("${INSTALL_DIR}/ai-agent-switch" --version | awk '{print $1}' | sed 's#^ai-agent-switch/##')"
if [ "$installed_version" != "$expected_version" ]; then
  echo "Installed ai-agent-switch version ${installed_version} does not match ${expected_version}" >&2
  exit 1
fi
