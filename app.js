/**
 * TUI Agent Workspace & Cross-Session IPC Daemon Runtime
 * Implements:
 * 1. Background Daemon Engine & Unix Domain Socket IPC Broker
 * 2. Terminal Multiplexer Panes & Interactive CLI Emulation
 * 3. Model Context Protocol (MCP) Runtime with Tool Discovery
 * 4. Interactive Confirmation Approval Gates for Destructive Actions
 * 5. Session History, TOML Config Sync, and Shell Integrations
 */

// ==========================================================================
// 1. STATE & DATA STORE
// ==========================================================================

const STATE = {
  daemon: {
    running: true,
    pid: 41920,
    socketPath: '/tmp/tui-agent.sock',
    totalBusMessages: 1429,
    connectedPanes: 3,
    startTime: Date.now() - 3600000,
    tokenCount: 1842,
    maxTokens: 128000,
    activeProvider: 'anthropic',
  },
  themes: ['theme-tokyo-night', 'theme-catppuccin', 'theme-monokai', 'theme-emerald'],
  currentThemeIdx: 0,
  
  // Multiplexer Panes
  panes: [
    {
      id: 'pane-1',
      title: 'bash (main-dev)',
      shell: 'bash',
      cwd: '~/projects/tui-agent-workspace',
      status: 'idle',
      historyIndex: 0,
      lines: [
        { type: 'system', text: 'TUI Agent Bus connected via /tmp/tui-agent.sock' },
        { type: 'prompt', text: 'dev@station:~/projects/tui-agent-workspace$ tui-agent status' },
        { type: 'system', text: '[DAEMON] ONLINE | PID 41920 | 3 Clients | 12 MCP Tools Available' },
        { type: 'prompt', text: 'dev@station:~/projects/tui-agent-workspace$ ' }
      ]
    },
    {
      id: 'pane-2',
      title: 'zsh (worker-build)',
      shell: 'zsh',
      cwd: '~/projects/tui-agent-workspace/crates/daemon',
      status: 'streaming',
      historyIndex: 0,
      lines: [
        { type: 'system', text: 'Subscribed to agent:prompt, agent:token_stream' },
        { type: 'prompt', text: 'dev@station:~/.../crates/daemon$ tui-agent listen' },
        { type: 'system', text: '>> Waiting for cross-session broadcasts on /tmp/tui-agent.sock...' }
      ]
    },
    {
      id: 'pane-3',
      title: 'fish (agent-repl)',
      shell: 'fish',
      cwd: '~/projects/tui-agent-workspace',
      status: 'idle',
      historyIndex: 0,
      lines: [
        { type: 'system', text: 'Interactive TUI Agent REPL ready. Type "help" or query directly.' },
        { type: 'prompt', text: 'fish ⋊> tui-agent query "Inspect current git diff and summarize"' },
        { type: 'agent-header', text: '🤖 Agent (Claude 3.5 Sonnet):' },
        { type: 'agent-token', text: 'Found 2 modified files in crates/daemon/src/bus.rs and README.md. Changes introduce socket locking to prevent stale daemon instances.' }
      ]
    }
  ],
  activePaneId: 'pane-1',
  
  // Model Context Protocol (MCP) Servers & Tools
  mcpServers: [
    {
      id: 'server-fs',
      name: 'file_inspector',
      description: 'Filesystem reads, diff calculation, syntax-highlighted excerpts',
      command: 'mcp-server-filesystem /home/dev/tui-agent-workspace',
      status: 'healthy',
      version: '1.2.0',
      toolsCount: 4
    },
    {
      id: 'server-shell',
      name: 'shell_runner',
      description: 'Executes commands in sandboxed subshell with approval gates',
      command: 'mcp-server-shell --safe-mode',
      status: 'healthy',
      version: '2.0.1',
      toolsCount: 3
    },
    {
      id: 'server-git',
      name: 'git_assistant',
      description: 'Git branch inspections, stash inspection, staged commit drafts',
      command: 'mcp-server-git --repo=.',
      status: 'healthy',
      version: '1.1.4',
      toolsCount: 3
    },
    {
      id: 'server-fetch',
      name: 'web_fetcher',
      description: 'HTTP REST / Documentation lookup and curl simulation',
      command: 'mcp-server-fetch --timeout=15',
      status: 'healthy',
      version: '1.0.0',
      toolsCount: 2
    }
  ],
  
  selectedMcpServerId: 'server-fs',

  mcpTools: [
    {
      id: 'tool-read-file',
      serverId: 'server-fs',
      serverName: 'file_inspector',
      name: 'read_file',
      category: 'filesystem',
      isDestructive: false,
      description: 'Read complete content of a workspace file',
      params: { path: 'crates/daemon/src/lib.rs', encoding: 'utf-8' },
      mockReturn: (p) => `// Content of ${p.path || 'file.rs'}\npub struct AgentBus {\n    socket_path: PathBuf,\n    clients: Arc<RwLock<Vec<ClientStream>>>,\n}`
    },
    {
      id: 'tool-write-file',
      serverId: 'server-fs',
      serverName: 'file_inspector',
      name: 'write_file',
      category: 'filesystem',
      isDestructive: true,
      description: 'Write or overwrite file at given path with new content',
      params: { path: 'crates/daemon/src/version.rs', content: 'pub const VERSION: &str = "0.4.2";\n' },
      mockReturn: (p) => ({ status: 'success', bytes_written: (p.content || '').length, path: p.path })
    },
    {
      id: 'tool-list-dir',
      serverId: 'server-fs',
      serverName: 'file_inspector',
      name: 'list_directory',
      category: 'filesystem',
      isDestructive: false,
      description: 'List recursive or flat directory contents',
      params: { dir_path: './crates', depth: 2 },
      mockReturn: () => ({ files: ['daemon/Cargo.toml', 'daemon/src/bus.rs', 'daemon/src/mcp.rs', 'cli/src/main.rs', 'tui/src/ui.rs'] })
    },
    {
      id: 'tool-exec-cmd',
      serverId: 'server-shell',
      serverName: 'shell_runner',
      name: 'exec_command',
      category: 'shell',
      isDestructive: true,
      description: 'Execute arbitrary terminal shell command in current workspace directory',
      params: { command: 'cargo test --workspace', timeout_sec: 30 },
      mockReturn: (p) => ({ exit_code: 0, stdout: `test bus::tests::test_ipc_broadcast ... ok\ntest mcp::tests::test_tool_discovery ... ok\ntest result: ok. 2 passed; 0 failed` })
    },
    {
      id: 'tool-rm-rf',
      serverId: 'server-shell',
      serverName: 'shell_runner',
      name: 'remove_path',
      category: 'shell',
      isDestructive: true,
      description: 'Remove file or directory from workspace filesystem',
      params: { path: './target/debug/build_temp', recursive: true },
      mockReturn: (p) => ({ success: true, removed: p.path })
    },
    {
      id: 'tool-git-diff',
      serverId: 'server-git',
      serverName: 'git_assistant',
      name: 'get_git_diff',
      category: 'git',
      isDestructive: false,
      description: 'Retrieve unstaged or staged git diff',
      params: { staged: false },
      mockReturn: () => `diff --git a/crates/daemon/src/bus.rs b/crates/daemon/src/bus.rs\n--- a/crates/daemon/src/bus.rs\n+++ b/crates/daemon/src/bus.rs\n@@ -12,3 +12,4 @@\n+    // Added socket lockfile cleanup\n+    std::fs::remove_file(&socket_path).ok();`
    },
    {
      id: 'tool-git-commit',
      serverId: 'server-git',
      serverName: 'git_assistant',
      name: 'create_commit',
      category: 'git',
      isDestructive: true,
      description: 'Stage files and execute git commit with generated message',
      params: { message: 'feat(daemon): implement cross-session socket IPC bus' },
      mockReturn: (p) => ({ commit_hash: '9f8a4e1', message: p.message, files_changed: 4 })
    },
    {
      id: 'tool-http-fetch',
      serverId: 'server-fetch',
      serverName: 'web_fetcher',
      name: 'fetch_url',
      category: 'network',
      isDestructive: false,
      params: { url: 'https://docs.anthropic.com/en/docs/mcp-overview', method: 'GET' },
      description: 'Fetch remote documentation or API endpoint payload',
      mockReturn: (p) => ({ status: 200, url: p.url, content_type: 'text/markdown', body: '# Model Context Protocol (MCP)\nOpen standard for linking AI agents to local tools...' })
    }
  ],

  selectedToolForTest: null,

  // IPC Bus Real-Time Events
  busEvents: [
    { time: '12:00:01', topic: 'daemon:heartbeat', source: 'daemon_pid_41920', payload: 'status: OK, clients: 3, memory_mb: 18.4' },
    { time: '12:00:15', topic: 'pane:context_sync', source: 'pane-1(bash)', payload: 'cwd: ~/projects/tui-agent-workspace, branch: feature/mcp-client' },
    { time: '12:00:33', topic: 'agent:prompt', source: 'pane-3(fish)', payload: 'prompt: "Inspect current git diff and summarize"' },
    { time: '12:00:34', topic: 'agent:tool_call', source: 'agent_runtime', payload: 'tool: git_assistant.get_git_diff({staged: false})' },
    { time: '12:00:35', topic: 'agent:token_stream', source: 'anthropic_claude', payload: 'chunk: "Found 2 modified files in crates/daemon/src/bus.rs..."' }
  ],

  // Shared Context Memory Pool
  contextPool: [
    { key: 'WORKSPACE_ROOT', value: '/home/dev/projects/tui-agent-workspace', updatedBy: 'daemon', time: '11:58' },
    { key: 'ACTIVE_GIT_BRANCH', value: 'feature/mcp-client', updatedBy: 'pane-1', time: '12:00' },
    { key: 'LAST_BUILD_STATUS', value: 'OK (cargo check 0 errors)', updatedBy: 'pane-2', time: '11:45' },
    { key: 'ACTIVE_MODEL', value: 'claude-3-5-sonnet-20241022', updatedBy: 'config', time: '11:30' },
    { key: 'APPROVED_GATE_SESSION', value: 'SESSION_AUTH_VERIFIED', updatedBy: 'security_gate', time: '12:01' }
  ],

  // Session DB History
  sessions: [
    {
      id: 'sess-8492',
      title: 'Git Diff & Architecture Overview',
      timestamp: 'Today, 12:00:33',
      messageCount: 4,
      messages: [
        { role: 'user', text: 'tui-agent query "Inspect current git diff and summarize"' },
        { role: 'tool', text: '[TOOL CALL: git_assistant.get_git_diff] -> 42 lines diff returned' },
        { role: 'agent', text: 'The workspace changes implement Unix Domain Socket locking in `bus.rs` and update the documentation for the Model Context Protocol.' }
      ]
    },
    {
      id: 'sess-8491',
      title: 'Daemon IPC Benchmarking',
      timestamp: 'Today, 11:42:10',
      messageCount: 6,
      messages: [
        { role: 'user', text: 'tui-agent run-benchmark --packets 1000' },
        { role: 'agent', text: 'Dispatched 1,000 IPC test frames through `/tmp/tui-agent.sock`. Avg latency: 0.14ms. Zero dropped frames.' }
      ]
    },
    {
      id: 'sess-8490',
      title: 'MCP Server Registration',
      timestamp: 'Today, 11:15:00',
      messageCount: 3,
      messages: [
        { role: 'user', text: 'tui-agent mcp register --name file_inspector' },
        { role: 'agent', text: 'Registered MCP Server `file_inspector` at stdio socket. Discovered 4 tools: read_file, write_file, list_directory, get_metadata.' }
      ]
    }
  ],
  selectedSessionId: 'sess-8492',

  // Active Approval Request
  pendingApproval: null
};

const DEFAULT_TOML_CONFIG = `# ~/.config/tui-agent-workspace/config.toml
# TUI Agent Workspace & Cross-Session IPC Daemon Configuration

[daemon]
socket_path = "/tmp/tui-agent.sock"
lock_file = "/tmp/tui-agent.lock"
max_clients = 32
heartbeat_interval_sec = 15
log_level = "info"

[model]
default_provider = "anthropic"
model_name = "claude-3-5-sonnet-20241022"
temperature = 0.2
max_tokens = 4096
stream_tokens = true

[model.openai]
api_key_env = "OPENAI_API_KEY"
endpoint = "https://api.openai.com/v1"
model_name = "gpt-4o"

[model.ollama]
endpoint = "http://127.0.0.1:11434"
model_name = "deepseek-coder:33b"

[safety]
require_approval_for_destructive = true
allowed_shell_prefixes = ["git", "cargo", "ls", "cat", "grep"]
auto_approve_readonly = true
local_only_storage = true

[[mcp_servers]]
name = "file_inspector"
command = "mcp-server-filesystem"
args = ["/home/dev/tui-agent-workspace"]

[[mcp_servers]]
name = "shell_runner"
command = "mcp-server-shell"
args = ["--safe-mode"]

[[mcp_servers]]
name = "git_assistant"
command = "mcp-server-git"
args = ["--repo=."]

[multiplexer]
status_format = "{agent_icon} {active_tasks} tasks | {provider}"
split_direction = "vertical"
auto_connect_panes = true
`;

// ==========================================================================
// 2. DOM ELEMENTS & INITIALIZATION
// ==========================================================================

function initApp() {
  setupNavigation();
  setupPanes();
  setupMcpView();
  setupBusView();
  setupConfigView();
  setupLogsView();
  setupModals();
  setupClock();
  setupKeyboardShortcuts();

  // Populate initial select for testing
  if (STATE.mcpTools.length > 0) {
    selectToolForTesting(STATE.mcpTools[0]);
  }

  // Periodic mock heartbeat on bus
  setInterval(emitMockHeartbeat, 12000);
}

// ==========================================================================
// 3. NAVIGATION & THEMES
// ==========================================================================

function setupNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');
  const tmuxTabs = document.querySelectorAll('.tmux-win-pill[data-view-target]');

  function switchView(viewName) {
    navTabs.forEach(t => t.classList.toggle('active', t.dataset.view === viewName));
    document.querySelectorAll('.view-section').forEach(s => {
      s.classList.toggle('active-view', s.id === `view-${viewName}`);
    });
    tmuxTabs.forEach(t => t.classList.toggle('active', t.dataset.viewTarget === viewName));
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  tmuxTabs.forEach(pill => {
    pill.addEventListener('click', () => switchView(pill.dataset.viewTarget));
  });

  // Theme Switcher
  const btnTheme = document.getElementById('btn-toggle-theme');
  btnTheme.addEventListener('click', () => {
    document.body.classList.remove(STATE.themes[STATE.currentThemeIdx]);
    STATE.currentThemeIdx = (STATE.currentThemeIdx + 1) % STATE.themes.length;
    const nextTheme = STATE.themes[STATE.currentThemeIdx];
    document.body.classList.add(nextTheme);
    showToast(`Theme switched to ${nextTheme.replace('theme-', '')}`, 'info');
  });

  // Daemon Restart Mock
  const btnDaemon = document.getElementById('btn-restart-daemon');
  btnDaemon.addEventListener('click', () => {
    showToast('Restarting IPC Daemon on /tmp/tui-agent.sock...', 'warn');
    STATE.daemon.pid = Math.floor(40000 + Math.random() * 9000);
    const statusPill = document.getElementById('daemon-status-pill');
    statusPill.innerHTML = `<span class="indicator active"></span> DAEMON: RUNNING (PID ${STATE.daemon.pid})`;
    addBusEvent('daemon:restart', 'daemon_manager', `Daemon recycled. Socket unlocked and bound at ${STATE.daemon.socketPath}`);
    setTimeout(() => {
      showToast(`Daemon active (PID ${STATE.daemon.pid})`, 'success');
    }, 400);
  });

  // Provider selector
  const provSelect = document.getElementById('active-provider-select');
  provSelect.addEventListener('change', (e) => {
    STATE.daemon.activeProvider = e.target.value;
    showToast(`Active Model Engine set to: ${e.target.options[e.target.selectedIndex].text}`, 'info');
    addBusEvent('config:model_change', 'user_ui', `Provider switched to ${e.target.value}`);
  });
}

// ==========================================================================
// 4. MULTIPLEXER PANES & TERMINAL EMULATION
// ==========================================================================

function setupPanes() {
  renderPanesGrid();

  document.getElementById('btn-mux-split-v').addEventListener('click', () => splitPane('vertical'));
  document.getElementById('btn-mux-split-h').addEventListener('click', () => splitPane('horizontal'));
  document.getElementById('btn-spawn-pane').addEventListener('click', () => splitPane('vertical'));
  document.getElementById('btn-mux-presets').addEventListener('click', cyclePresets);
}

function renderPanesGrid() {
  const grid = document.getElementById('panes-grid');
  grid.innerHTML = '';

  document.getElementById('pane-counter-label').textContent = `${STATE.panes.length} Active Panes`;

  STATE.panes.forEach((pane, idx) => {
    const paneEl = document.createElement('div');
    paneEl.className = `tui-pane ${pane.id === STATE.activePaneId ? 'pane-active' : ''}`;
    paneEl.id = pane.id;
    paneEl.addEventListener('click', () => setActivePane(pane.id));

    let statusBadge = `<span class="pane-badge badge-idle">IDLE</span>`;
    if (pane.status === 'streaming') {
      statusBadge = `<span class="pane-badge badge-streaming">● STREAMING</span>`;
    } else if (pane.status === 'busy') {
      statusBadge = `<span class="pane-badge badge-online">BUSY</span>`;
    }

    paneEl.innerHTML = `
      <div class="tui-pane-header">
        <div class="pane-header-left">
          <span class="pane-num">[${idx + 1}]</span>
          <span class="pane-title">${escapeHtml(pane.title)}</span>
          <span class="pane-proc-info">${escapeHtml(pane.cwd)}</span>
        </div>
        <div class="pane-header-right">
          ${statusBadge}
          <button class="pane-tool-btn" onclick="clearPaneOutput('${pane.id}', event)" title="Clear pane">✕</button>
        </div>
      </div>
      <div class="pane-terminal-viewport" id="viewport-${pane.id}">
        ${renderPaneLines(pane.lines)}
      </div>
      <div class="pane-input-bar">
        <span class="pane-prompt-symbol">❯</span>
        <input type="text" class="pane-cli-input" id="input-${pane.id}" placeholder="tui-agent query / send / listen / help..." autocomplete="off" spellcheck="false">
      </div>
    `;

    grid.appendChild(paneEl);

    // Attach input handler
    const inputEl = paneEl.querySelector(`#input-${pane.id}`);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleTerminalCommand(pane.id, inputEl.value.trim());
        inputEl.value = '';
      }
    });
  });

  // Scroll viewports to bottom
  STATE.panes.forEach(pane => {
    const vp = document.getElementById(`viewport-${pane.id}`);
    if (vp) vp.scrollTop = vp.scrollHeight;
  });
}

function renderPaneLines(lines) {
  return lines.map(line => {
    let cls = 'term-line';
    if (line.type === 'system') cls += ' system-msg';
    else if (line.type === 'prompt') cls += ' prompt-line';
    else if (line.type === 'agent-header') cls += ' agent-header';
    else if (line.type === 'agent-token') cls += ' agent-token';
    else if (line.type === 'tool-exec') cls += ' tool-exec';
    else if (line.type === 'tool-success') cls += ' tool-success';
    else if (line.type === 'tool-denied') cls += ' tool-denied';
    else if (line.type === 'ipc-broadcast') cls += ' ipc-broadcast';
    return `<div class="${cls}">${escapeHtml(line.text)}</div>`;
  }).join('');
}

function setActivePane(paneId) {
  STATE.activePaneId = paneId;
  document.querySelectorAll('.tui-pane').forEach(el => {
    el.classList.toggle('pane-active', el.id === paneId);
  });
  const activeInput = document.getElementById(`input-${paneId}`);
  if (activeInput) activeInput.focus();
}

window.clearPaneOutput = function(paneId, ev) {
  if (ev) ev.stopPropagation();
  const target = STATE.panes.find(p => p.id === paneId);
  if (target) {
    target.lines = [{ type: 'system', text: `Pane ${paneId} cleared. Socket connected.` }];
    renderPanesGrid();
    showToast(`Cleared ${paneId}`, 'info');
  }
};

function splitPane(direction) {
  if (STATE.panes.length >= 6) {
    showToast('Maximum pane limit reached (6 panes)', 'warn');
    return;
  }
  const newId = `pane-${Date.now().toString().slice(-4)}`;
  const shells = ['bash', 'zsh', 'fish'];
  const randomShell = shells[STATE.panes.length % shells.length];
  
  STATE.panes.push({
    id: newId,
    title: `${randomShell} (sub-task)`,
    shell: randomShell,
    cwd: '~/projects/tui-agent-workspace',
    status: 'idle',
    historyIndex: 0,
    lines: [
      { type: 'system', text: `Auto-spawned pane ${newId} with IPC link.` },
      { type: 'prompt', text: `dev@station:~$ tui-agent listen` }
    ]
  });
  
  STATE.daemon.connectedPanes = STATE.panes.length;
  document.getElementById('metric-clients-count').textContent = STATE.panes.length;
  renderPanesGrid();
  setActivePane(newId);
  addBusEvent('pane:spawn', 'tmux_mux', `Spawned pane ${newId} (${direction})`);
  showToast(`Created new ${randomShell} pane`, 'success');
}

function cyclePresets() {
  const grid = document.getElementById('panes-grid');
  if (grid.style.gridTemplateColumns === '1fr') {
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gridTemplateRows = '1fr 1fr';
    showToast('Layout: 2x2 Grid', 'info');
  } else if (grid.style.gridTemplateColumns === '1fr 1fr 1fr') {
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gridTemplateRows = 'repeat(auto-fit, minmax(140px, 1fr))';
    showToast('Layout: Stacked Vertical', 'info');
  } else {
    grid.style.gridTemplateColumns = '1fr 1fr 1fr';
    grid.style.gridTemplateRows = '1fr';
    showToast('Layout: 3-Column Columns', 'info');
  }
}

// Handle interactive CLI inside panes
function handleTerminalCommand(paneId, rawCmd) {
  if (!rawCmd) return;
  const targetPane = STATE.panes.find(p => p.id === paneId);
  if (!targetPane) return;

  // Add prompt line
  targetPane.lines.push({ type: 'prompt', text: `${targetPane.shell} ❯ ${rawCmd}` });

  // Process commands
  if (rawCmd === 'help') {
    targetPane.lines.push({ type: 'system', text: `
=== TUI AGENT CLI COMMANDS ===
  tui-agent query "<prompt>"   - Run prompt through Model & MCP runtime
  tui-agent send "<msg>"       - Broadcast raw message across IPC socket
  tui-agent listen             - Subscribe to live bus token stream
  tui-agent mcp list           - List registered MCP tools
  tui-agent status             - Print daemon runtime metrics
  tui-agent clear              - Clear terminal history
  git status / ls / cat        - Mock shell environment commands
` });
  } else if (rawCmd.startsWith('tui-agent query')) {
    const promptText = rawCmd.replace(/^tui-agent query\s*/, '').replace(/"/g, '') || 'Analyze current workspace';
    dispatchAgentTask(promptText, paneId, true);
  } else if (rawCmd.startsWith('tui-agent send')) {
    const msg = rawCmd.replace(/^tui-agent send\s*/, '').replace(/"/g, '');
    broadcastIpcMessage(paneId, msg);
  } else if (rawCmd === 'tui-agent status') {
    targetPane.lines.push({
      type: 'system',
      text: `[DAEMON METRICS]\n Socket: ${STATE.daemon.socketPath}\n PID: ${STATE.daemon.pid}\n Provider: ${STATE.daemon.activeProvider}\n Connected Panes: ${STATE.panes.length}\n Bus Messages: ${STATE.daemon.totalBusMessages}`
    });
  } else if (rawCmd === 'tui-agent mcp list') {
    const toolList = STATE.mcpTools.map(t => `  - ${t.serverName}.${t.name} (${t.isDestructive ? '⚠️ GATE' : '✓ SAFE'})`).join('\n');
    targetPane.lines.push({ type: 'system', text: `Available MCP Tools (12 registered):\n${toolList}` });
  } else if (rawCmd === 'tui-agent clear' || rawCmd === 'clear') {
    targetPane.lines = [{ type: 'system', text: 'Terminal cleared.' }];
  } else if (rawCmd === 'ls' || rawCmd === 'dir') {
    targetPane.lines.push({ type: 'system', text: 'Cargo.toml  crates/  dist/  index.html  package.json  README.md  src/  styles.css' });
  } else if (rawCmd.startsWith('git')) {
    targetPane.lines.push({ type: 'system', text: 'On branch feature/mcp-client\nChanges not staged for commit:\n  modified: crates/daemon/src/bus.rs\n  modified: README.md' });
  } else {
    // General command response
    targetPane.lines.push({ type: 'system', text: `[exec] ${rawCmd}: completed with exit code 0` });
    addBusEvent('shell:exec', paneId, `Executed: ${rawCmd}`);
  }

  renderPanesGrid();
}

function broadcastIpcMessage(senderPaneId, message) {
  addBusEvent('pane:broadcast', senderPaneId, `Broadcast: "${message}"`);
  STATE.panes.forEach(pane => {
    pane.lines.push({
      type: 'ipc-broadcast',
      text: `[IPC BROADCAST from ${senderPaneId}]: ${message}`
    });
  });
  renderPanesGrid();
  showToast(`IPC Message sent across all panes`, 'info');
}

// ==========================================================================
// 5. AGENT EXECUTION ENGINE & APPROVAL GATE
// ==========================================================================

function dispatchAgentTask(promptText, targetPaneId = 'broadcast', allowTools = true) {
  const session = {
    id: `sess-${Date.now().toString().slice(-4)}`,
    title: promptText.slice(0, 36) + (promptText.length > 36 ? '...' : ''),
    timestamp: 'Just now',
    messageCount: 3,
    messages: [
      { role: 'user', text: promptText }
    ]
  };
  STATE.sessions.unshift(session);
  STATE.selectedSessionId = session.id;
  renderSessionsList();

  addBusEvent('agent:prompt', targetPaneId, `Prompt received: "${promptText}"`);
  
  // Determine panes to write to
  const targetPanes = targetPaneId === 'broadcast' 
    ? STATE.panes 
    : STATE.panes.filter(p => p.id === targetPaneId);

  targetPanes.forEach(p => {
    p.status = 'streaming';
    p.lines.push({ type: 'agent-header', text: `🤖 Agent (${STATE.daemon.activeProvider.toUpperCase()}):` });
  });
  renderPanesGrid();

  // Check if tools should be triggered
  const needsDestructiveTool = promptText.toLowerCase().includes('write') || promptText.toLowerCase().includes('patch') || promptText.toLowerCase().includes('rm') || promptText.toLowerCase().includes('exec');
  
  // Simulate streaming tokens
  const chunks = [
    'Analyzing request and consulting workspace context... ',
    'Scanning active directory and repository state. ',
    'Found relevant modules in `crates/daemon/src/bus.rs`. '
  ];

  let chunkIdx = 0;
  const streamTimer = setInterval(() => {
    if (chunkIdx < chunks.length) {
      const piece = chunks[chunkIdx];
      targetPanes.forEach(p => {
        p.lines.push({ type: 'agent-token', text: piece });
      });
      STATE.daemon.tokenCount += 48;
      updateTokenBadge();
      addBusEvent('agent:token_stream', 'model_runner', `Stream chunk: ${piece.slice(0, 30)}...`);
      renderPanesGrid();
      chunkIdx++;
    } else {
      clearInterval(streamTimer);
      
      if (allowTools && needsDestructiveTool) {
        // Trigger tool requiring approval gate
        triggerApprovalGate({
          server: 'shell_runner',
          tool: 'exec_command',
          args: { command: 'cargo test --workspace && touch ./dist/.build_done', cwd: '/home/dev/tui-agent-workspace' },
          onApprove: () => {
            targetPanes.forEach(p => {
              p.lines.push({ type: 'tool-exec', text: `[APPROVED MCP TOOL] shell_runner.exec_command("cargo test --workspace")` });
              p.lines.push({ type: 'tool-success', text: `✓ Test suite passed: 14 ok, 0 failures. Target updated.` });
              p.status = 'idle';
            });
            session.messages.push({ role: 'tool', text: 'shell_runner.exec_command -> Approved & Executed (exit code 0)' });
            session.messages.push({ role: 'agent', text: 'Execution complete. Tests verified and state synced.' });
            renderPanesGrid();
            renderSessionDetails();
          },
          onDeny: () => {
            targetPanes.forEach(p => {
              p.lines.push({ type: 'tool-denied', text: `❌ Execution denied by user approval gate.` });
              p.status = 'idle';
            });
            session.messages.push({ role: 'agent', text: 'Aborted execution due to permission gate rejection.' });
            renderPanesGrid();
            renderSessionDetails();
          }
        });
      } else {
        // Normal completion
        targetPanes.forEach(p => {
          p.lines.push({ type: 'agent-token', text: '\n✓ Action plan generated and verified against MCP tools.' });
          p.status = 'idle';
        });
        session.messages.push({ role: 'agent', text: 'Action plan generated and verified against MCP tools.' });
        renderPanesGrid();
        renderSessionDetails();
      }
    }
  }, 400);
}

function triggerApprovalGate(request) {
  STATE.pendingApproval = request;
  document.getElementById('gate-server-name').textContent = request.server;
  document.getElementById('gate-tool-name').textContent = request.tool;
  document.getElementById('gate-args-json').textContent = JSON.stringify(request.args, null, 2);
  
  document.getElementById('approval-gate-modal').style.display = 'flex';
  document.getElementById('tmux-last-agent-event').textContent = '⚠️ 1 Approval Gate Pending: ' + request.tool;
  addBusEvent('agent:tool_approval', 'gate_runtime', `Approval requested for ${request.server}.${request.tool}`);
}

function updateTokenBadge() {
  document.getElementById('tmux-token-counter').textContent = `${STATE.daemon.tokenCount.toLocaleString()} / 128k`;
}

// ==========================================================================
// 6. MCP TOOLS & RUNTIME VIEW
// ==========================================================================

function setupMcpView() {
  renderMcpServers();
  renderMcpToolsTable();

  // Search filter
  document.getElementById('tool-search-input').addEventListener('input', (e) => {
    renderMcpToolsTable(e.target.value.toLowerCase().trim());
  });

  // Test execution button
  document.getElementById('btn-exec-test-tool').addEventListener('click', () => {
    if (!STATE.selectedToolForTest) return;
    executeToolTestSandbox(STATE.selectedToolForTest);
  });

  // Add server modal / prompt
  document.getElementById('btn-add-mcp-server').addEventListener('click', () => {
    const name = prompt('Enter new MCP Server Name:', 'postgres_db_mcp');
    if (name) {
      const newServer = {
        id: `server-${Date.now()}`,
        name: name,
        description: 'Custom registered MCP server socket',
        command: `mcp-server-${name} --stdio`,
        status: 'healthy',
        version: '1.0.0',
        toolsCount: 1
      };
      STATE.mcpServers.push(newServer);
      STATE.mcpTools.push({
        id: `tool-${Date.now()}`,
        serverId: newServer.id,
        serverName: name,
        name: 'query_schema',
        category: 'database',
        isDestructive: false,
        description: 'Inspect relational database schema',
        params: { limit: 20 },
        mockReturn: () => ({ tables: ['sessions', 'events', 'mcp_registry', 'context_kv'] })
      });
      renderMcpServers();
      renderMcpToolsTable();
      showToast(`Registered MCP server: ${name}`, 'success');
      addBusEvent('mcp:server_registered', 'mcp_hub', `Server ${name} registered on stdio`);
    }
  });

  // Health check
  document.getElementById('btn-test-all-mcp').addEventListener('click', () => {
    showToast('Pinging all 4 MCP daemon sockets... [ALL HEALTHY]', 'success');
    addBusEvent('mcp:health_check', 'mcp_hub', 'All registered tool endpoints responded (avg 2.1ms)');
  });
}

function renderMcpServers() {
  const list = document.getElementById('mcp-server-list');
  list.innerHTML = '';

  document.getElementById('mcp-tool-count').textContent = STATE.mcpTools.length;

  STATE.mcpServers.forEach(srv => {
    const card = document.createElement('div');
    card.className = `mcp-server-card ${srv.id === STATE.selectedMcpServerId ? 'active' : ''}`;
    card.innerHTML = `
      <div class="server-card-top">
        <span class="server-card-name">${escapeHtml(srv.name)}</span>
        <span class="server-card-status">● ${srv.status}</span>
      </div>
      <div class="server-card-desc">${escapeHtml(srv.description)}</div>
      <div class="server-card-meta">
        <span>v${srv.version}</span>
        <span>${srv.toolsCount} Tools</span>
      </div>
    `;
    card.addEventListener('click', () => {
      STATE.selectedMcpServerId = srv.id;
      document.getElementById('selected-mcp-server-name').textContent = `${srv.name} (MCP Runtime)`;
      renderMcpServers();
      renderMcpToolsTable();
    });
    list.appendChild(card);
  });
}

function renderMcpToolsTable(filterQuery = '') {
  const tbody = document.getElementById('mcp-tools-tbody');
  tbody.innerHTML = '';

  const filtered = STATE.mcpTools.filter(t => {
    const matchesSearch = !filterQuery || t.name.toLowerCase().includes(filterQuery) || t.serverName.toLowerCase().includes(filterQuery);
    return matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--fg-dim); padding: 18px;">No matching MCP tools found.</td></tr>`;
    return;
  }

  filtered.forEach(tool => {
    const tr = document.createElement('tr');
    const gateBadge = tool.isDestructive 
      ? `<span class="badge-gate gate-destructive">⚠️ GATE REQ</span>` 
      : `<span class="badge-gate gate-safe">✓ READONLY</span>`;
    
    const paramSummary = Object.keys(tool.params).map(k => `<code>${k}</code>`).join(', ');

    tr.innerHTML = `
      <td><strong>${escapeHtml(tool.name)}</strong></td>
      <td><span class="badge-info">${escapeHtml(tool.serverName)}</span></td>
      <td>${tool.category}</td>
      <td>${gateBadge}</td>
      <td>${paramSummary}</td>
      <td>
        <button class="tui-btn-xs" onclick="selectToolForTestingById('${tool.id}')">Inspect & Test</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.selectToolForTestingById = function(toolId) {
  const tool = STATE.mcpTools.find(t => t.id === toolId);
  if (tool) {
    selectToolForTesting(tool);
  }
};

function selectToolForTesting(tool) {
  STATE.selectedToolForTest = tool;
  document.getElementById('active-test-tool-label').textContent = `Tool: ${tool.serverName}.${tool.name}`;
  document.getElementById('btn-exec-test-tool').disabled = false;

  const container = document.getElementById('tool-input-fields-container');
  container.innerHTML = `
    <p style="font-size: 11px; color: var(--fg-muted); margin-bottom: 8px;"><strong>Description:</strong> ${escapeHtml(tool.description)}</p>
    <div class="form-group">
      <label>JSON Parameters:</label>
      <textarea id="tool-test-json-params" class="tui-textarea" rows="4" style="font-size: 11px;">${JSON.stringify(tool.params, null, 2)}</textarea>
    </div>
  `;
}

function executeToolTestSandbox(tool) {
  let parsedParams = {};
  try {
    const raw = document.getElementById('tool-test-json-params').value;
    parsedParams = JSON.parse(raw);
  } catch (err) {
    showToast('Invalid JSON parameters format', 'warn');
    return;
  }

  if (tool.isDestructive) {
    triggerApprovalGate({
      server: tool.serverName,
      tool: tool.name,
      args: parsedParams,
      onApprove: () => {
        const result = tool.mockReturn(parsedParams);
        document.getElementById('tool-exec-output-pre').textContent = JSON.stringify(result, null, 2);
        addBusEvent('mcp:exec_success', 'mcp_test_runner', `Executed ${tool.name} (Approved)`);
        showToast(`Tool ${tool.name} executed successfully`, 'success');
      },
      onDeny: () => {
        document.getElementById('tool-exec-output-pre').textContent = JSON.stringify({ error: 'Tool execution rejected by user safety approval gate' }, null, 2);
        addBusEvent('mcp:exec_denied', 'mcp_test_runner', `Execution rejected for ${tool.name}`);
      }
    });
  } else {
    const result = tool.mockReturn(parsedParams);
    document.getElementById('tool-exec-output-pre').textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    addBusEvent('mcp:exec_safe', 'mcp_test_runner', `Executed read-only tool ${tool.name}`);
    showToast(`Executed ${tool.name}`, 'info');
  }
}

// ==========================================================================
// 7. IPC BUS STREAM & CONTEXT MEMORY
// ==========================================================================

function setupBusView() {
  renderBusEventsFeed();
  renderContextKeys();

  document.getElementById('ipc-topic-filter').addEventListener('change', (e) => {
    renderBusEventsFeed(e.target.value);
  });

  document.getElementById('btn-clear-bus-logs').addEventListener('click', () => {
    STATE.busEvents = [];
    renderBusEventsFeed();
    showToast('IPC Event log cleared', 'info');
  });

  document.getElementById('btn-bus-send-mock').addEventListener('click', () => {
    addBusEvent('agent:tool_call', 'test_injector', `Dispatched mock tool ping via socket descriptor.`);
    showToast('Injected mock bus event', 'info');
  });

  document.getElementById('btn-add-context-key').addEventListener('click', () => {
    const k = prompt('Context Key name (e.g. USER_EMAIL, DOCKER_HOST):', 'API_ENV_MODE');
    if (k) {
      const val = prompt('Context Value:', 'staging-us-east');
      if (val) {
        STATE.contextPool.push({
          key: k,
          value: val,
          updatedBy: 'user_tui',
          time: new Date().toTimeString().slice(0, 5)
        });
        renderContextKeys();
        addBusEvent('pane:context_sync', 'user_tui', `Context key added: ${k}=${val}`);
        showToast(`Stored shared variable ${k}`, 'success');
      }
    }
  });
}

function renderBusEventsFeed(topicFilter = 'all') {
  const feed = document.getElementById('bus-events-feed');
  feed.innerHTML = '';

  const filtered = STATE.busEvents.filter(ev => {
    return topicFilter === 'all' || ev.topic === topicFilter;
  });

  if (filtered.length === 0) {
    feed.innerHTML = `<div style="color: var(--fg-dim); padding: 12px;">No IPC events matching filter.</div>`;
    return;
  }

  filtered.forEach(ev => {
    const row = document.createElement('div');
    row.className = 'bus-event-item';
    
    let topicCls = 'topic-heartbeat';
    if (ev.topic.includes('prompt')) topicCls = 'topic-prompt';
    else if (ev.topic.includes('token_stream')) topicCls = 'topic-stream';
    else if (ev.topic.includes('tool_call')) topicCls = 'topic-tool';
    else if (ev.topic.includes('approval')) topicCls = 'topic-approval';
    else if (ev.topic.includes('sync')) topicCls = 'topic-sync';

    row.innerHTML = `
      <span class="event-time">${ev.time}</span>
      <span class="event-topic ${topicCls}">${escapeHtml(ev.topic)}</span>
      <span class="event-source">[${escapeHtml(ev.source)}]</span>
      <span class="event-payload">${escapeHtml(ev.payload)}</span>
    `;
    feed.appendChild(row);
  });

  feed.scrollTop = feed.scrollHeight;
}

function addBusEvent(topic, source, payload) {
  const time = new Date().toTimeString().slice(0, 8);
  const ev = { time, topic, source, payload };
  STATE.busEvents.push(ev);
  if (STATE.busEvents.length > 200) STATE.busEvents.shift();
  
  STATE.daemon.totalBusMessages++;
  document.getElementById('metric-bus-msgs').textContent = STATE.daemon.totalBusMessages.toLocaleString();
  
  // Check if bus view is rendered
  const currentFilter = document.getElementById('ipc-topic-filter')?.value || 'all';
  renderBusEventsFeed(currentFilter);
}

function emitMockHeartbeat() {
  const mem = (16 + Math.random() * 4).toFixed(1);
  addBusEvent('daemon:heartbeat', `daemon_pid_${STATE.daemon.pid}`, `status: OK, clients: ${STATE.panes.length}, memory_mb: ${mem}`);
}

function renderContextKeys() {
  const grid = document.getElementById('context-keys-grid');
  grid.innerHTML = '';

  document.getElementById('metric-context-chunks').textContent = `${STATE.contextPool.length} Shared Variables`;

  STATE.contextPool.forEach(ctx => {
    const card = document.createElement('div');
    card.className = 'context-key-card';
    card.innerHTML = `
      <div class="context-key-title">
        <span>${escapeHtml(ctx.key)}</span>
        <span style="font-size: 9px; color: var(--fg-dim);">${ctx.time}</span>
      </div>
      <div class="context-key-val" title="${escapeHtml(ctx.value)}">${escapeHtml(ctx.value)}</div>
    `;
    grid.appendChild(card);
  });
}

// ==========================================================================
// 8. CONFIG (TOML) & SHELL HOOKS
// ==========================================================================

function setupConfigView() {
  const textarea = document.getElementById('toml-editor-textarea');
  textarea.value = DEFAULT_TOML_CONFIG;

  document.getElementById('btn-save-config').addEventListener('click', () => {
    showToast('Saved to ~/.config/tui-agent-workspace/config.toml', 'success');
    addBusEvent('config:reload', 'config_engine', 'TOML configuration hot-reloaded successfully');
  });

  document.getElementById('btn-load-sample-config').addEventListener('click', () => {
    textarea.value = DEFAULT_TOML_CONFIG;
    showToast('Reset configuration to default template', 'info');
  });

  // Copy button hooks
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const el = document.getElementById(targetId);
      if (el) {
        navigator.clipboard.writeText(el.innerText).then(() => {
          showToast('Copied shell hook snippet to clipboard!', 'success');
        }).catch(() => {
          showToast('Snippet copied', 'info');
        });
      }
    });
  });
}

// ==========================================================================
// 9. LOGS & SQLITE STORAGE
// ==========================================================================

function setupLogsView() {
  renderSessionsList();
  renderSessionDetails();

  document.getElementById('btn-export-jsonl').addEventListener('click', () => {
    const jsonlData = STATE.sessions.map(s => JSON.stringify(s)).join('\n');
    downloadFile('workspace-sessions.jsonl', jsonlData, 'text/plain');
    showToast('Exported session logs to JSONL format', 'success');
  });

  document.getElementById('btn-export-sqlite-json').addEventListener('click', () => {
    const dump = {
      database: 'workspace.db',
      exported_at: new Date().toISOString(),
      sessions: STATE.sessions,
      context_pool: STATE.contextPool,
      mcp_servers: STATE.mcpServers
    };
    downloadFile('workspace-db-dump.json', JSON.stringify(dump, null, 2), 'application/json');
    showToast('Exported SQLite database dump JSON', 'success');
  });

  document.getElementById('btn-clear-db-history').addEventListener('click', () => {
    if (confirm('Wipe all SQLite conversation history and logs?')) {
      STATE.sessions = [];
      renderSessionsList();
      renderSessionDetails();
      showToast('Wiped local SQLite session store', 'warn');
    }
  });
}

function renderSessionsList() {
  const list = document.getElementById('session-selector-list');
  list.innerHTML = '';

  document.getElementById('logs-total-sessions').textContent = `${STATE.sessions.length} Sessions / ${STATE.sessions.reduce((acc, s) => acc + s.messages.length, 0)} Messages`;

  STATE.sessions.forEach(sess => {
    const card = document.createElement('div');
    card.className = `session-item-card ${sess.id === STATE.selectedSessionId ? 'active' : ''}`;
    const preview = sess.messages[sess.messages.length - 1]?.text || 'No messages';
    card.innerHTML = `
      <div class="session-card-id">${sess.id}: ${escapeHtml(sess.title)}</div>
      <div class="session-card-preview">${escapeHtml(preview)}</div>
      <div class="session-card-time">${sess.timestamp} • ${sess.messages.length} msgs</div>
    `;
    card.addEventListener('click', () => {
      STATE.selectedSessionId = sess.id;
      renderSessionsList();
      renderSessionDetails();
    });
    list.appendChild(card);
  });
}

function renderSessionDetails() {
  const titleEl = document.getElementById('session-detail-title');
  const metaEl = document.getElementById('session-detail-meta');
  const stream = document.getElementById('session-messages-stream');
  stream.innerHTML = '';

  const session = STATE.sessions.find(s => s.id === STATE.selectedSessionId);
  if (!session) {
    titleEl.textContent = 'No active session selected';
    metaEl.textContent = '';
    stream.innerHTML = '<div style="color: var(--fg-dim);">Select a session from the list on the left.</div>';
    return;
  }

  titleEl.textContent = `${session.id}: ${session.title}`;
  metaEl.textContent = `${session.timestamp}`;

  session.messages.forEach(msg => {
    const row = document.createElement('div');
    row.className = `chat-msg-row chat-msg-${msg.role}`;
    
    let roleTag = `<div class="msg-role-tag ${msg.role}">${msg.role.toUpperCase()}</div>`;
    row.innerHTML = `
      ${roleTag}
      <div class="msg-content">${escapeHtml(msg.text)}</div>
    `;
    stream.appendChild(row);
  });
}

// ==========================================================================
// 10. MODALS & APPROVAL GATE HANDLERS
// ==========================================================================

function setupModals() {
  // Prompt modal buttons
  const promptModal = document.getElementById('prompt-modal');
  document.getElementById('btn-send-agent-prompt').addEventListener('click', () => {
    promptModal.style.display = 'flex';
    document.getElementById('prompt-input-text').focus();
  });

  document.getElementById('btn-close-prompt-modal').addEventListener('click', () => {
    promptModal.style.display = 'none';
  });
  document.getElementById('btn-cancel-prompt').addEventListener('click', () => {
    promptModal.style.display = 'none';
  });

  document.getElementById('btn-submit-agent-prompt').addEventListener('click', () => {
    const text = document.getElementById('prompt-input-text').value.trim();
    const targetPane = document.getElementById('prompt-target-pane').value;
    const allowTools = document.getElementById('prompt-allow-tools').checked;
    if (text) {
      promptModal.style.display = 'none';
      dispatchAgentTask(text, targetPane, allowTools);
      showToast('Dispatched multi-session prompt to daemon bus', 'success');
    }
  });

  // Approval Gate modal buttons
  const gateModal = document.getElementById('approval-gate-modal');
  document.getElementById('btn-grant-approval').addEventListener('click', () => {
    if (STATE.pendingApproval && STATE.pendingApproval.onApprove) {
      STATE.pendingApproval.onApprove();
    }
    STATE.pendingApproval = null;
    gateModal.style.display = 'none';
    document.getElementById('tmux-last-agent-event').textContent = 'Socket /tmp/tui-agent.sock • 0 approvals pending';
    showToast('Tool execution granted', 'success');
  });

  document.getElementById('btn-deny-approval').addEventListener('click', () => {
    if (STATE.pendingApproval && STATE.pendingApproval.onDeny) {
      STATE.pendingApproval.onDeny();
    }
    STATE.pendingApproval = null;
    gateModal.style.display = 'none';
    document.getElementById('tmux-last-agent-event').textContent = 'Socket /tmp/tui-agent.sock • 0 approvals pending';
    showToast('Tool execution rejected', 'warn');
  });
}

// ==========================================================================
// 11. HELPERS, TOASTS & CLOCK
// ==========================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('tui-toast-container');
  const toast = document.createElement('div');
  toast.className = `tui-toast ${type}`;
  toast.textContent = `[TUI-BUS] ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function setupClock() {
  function tick() {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    document.getElementById('tmux-clock').textContent = timeStr;
  }
  setInterval(tick, 1000);
  tick();
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // F1 to F5 view switches
    if (e.key === 'F1') { e.preventDefault(); switchViewByName('panes'); }
    if (e.key === 'F2') { e.preventDefault(); switchViewByName('mcp'); }
    if (e.key === 'F3') { e.preventDefault(); switchViewByName('bus'); }
    if (e.key === 'F4') { e.preventDefault(); switchViewByName('config'); }
    if (e.key === 'F5') { e.preventDefault(); switchViewByName('logs'); }
    
    // Escape closes modals
    if (e.key === 'Escape') {
      document.getElementById('prompt-modal').style.display = 'none';
    }
  });
}

function switchViewByName(viewName) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.view === viewName));
  document.querySelectorAll('.view-section').forEach(s => {
    s.classList.toggle('active-view', s.id === `view-${viewName}`);
  });
  document.querySelectorAll('.tmux-win-pill[data-view-target]').forEach(t => t.classList.toggle('active', t.dataset.viewTarget === viewName));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Start runtime when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
