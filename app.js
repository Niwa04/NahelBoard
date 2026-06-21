const STORAGE_KEY = "etatboards.boards.v1";
const LEGACY_STORAGE_KEY = "nahelboard.boards.v1";
const app = document.querySelector("#app");
let deferredInstallPrompt = null;

const starterIcons = [
  iconSvg("Toilette", "🚽", "#dbeafe"),
  iconSvg("Se laver", "🪥", "#dcfce7"),
  iconSvg("Manger", "🥣", "#fef3c7"),
  iconSvg("S'habiller", "👕", "#fee2e2"),
  iconSvg("Partir", "➡️", "#e0f2fe")
];

function iconSvg(label, symbol, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 180"><rect width="220" height="180" rx="12" fill="${bg}"/><text x="110" y="88" text-anchor="middle" dominant-baseline="middle" font-size="76">${symbol}</text><text x="110" y="154" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#18202a">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadBoards() {
  try {
    const storedValue = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "[]";
    const boards = JSON.parse(storedValue);
    if (Array.isArray(boards) && boards.length) return boards;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }

  const demo = {
    id: uid(),
    title: "Routine du matin",
    childName: "Mon enfant",
    childImage: "",
    selectedTaskId: "",
    tasks: ["Toilette", "Se laver", "Petit déjeuner", "S'habiller", "Partir"].map((title, index) => ({
      id: uid(),
      title,
      image: starterIcons[index]
    }))
  };
  saveBoards([demo]);
  return [demo];
}

function saveBoards(boards) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
}

function getBoards() {
  return loadBoards();
}

function getBoard(id) {
  return getBoards().find((board) => board.id === id);
}

function setBoard(nextBoard) {
  const boards = getBoards();
  const index = boards.findIndex((board) => board.id === nextBoard.id);
  if (index >= 0) boards[index] = nextBoard;
  saveBoards(boards);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function routeTo(hash) {
  window.location.hash = hash;
}

window.addEventListener("hashchange", render);
window.addEventListener("storage", render);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  renderInstallButtonState();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  renderInstallButtonState();
});

registerServiceWorker();

function render() {
  const [view, id] = window.location.hash.replace("#", "").split("/");
  if (view === "edit") return renderEditor(id);
  if (view === "view") return renderChildView(id);
  renderHome();
}

function renderHome() {
  const boards = getBoards();
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">✓</div>
        </div>
        <div class="actions">
          ${installButton()}
          <button class="primary" data-action="new-board">+ Nouveau board</button>
        </div>
      </header>
      <section class="content">
        ${boards.length ? boardCards(boards) : emptyHome()}
      </section>
    </main>
  `;

  app.querySelector("[data-action='new-board']").addEventListener("click", createBoard);
  bindInstallButtons();
  app.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => routeTo(`edit/${button.dataset.edit}`)));
  app.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => routeTo(`view/${button.dataset.view}`)));
  app.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", () => duplicateBoard(button.dataset.copy)));
  app.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteBoard(button.dataset.delete)));
}

function boardCards(boards) {
  return `
    <div class="boards-grid">
      ${boards.map((board) => `
        <article class="board-card">
          <div>
            <h2>${escapeHtml(board.title)}</h2>
            <p class="meta">${board.tasks.length} états · ${escapeHtml(board.childName || "Enfant")}</p>
          </div>
          <div class="board-preview" aria-hidden="true">
            ${board.tasks.slice(0, 4).map((task) => `
              <div class="mini-task">${task.image ? `<img src="${task.image}" alt="">` : "★"}</div>
            `).join("")}
          </div>
          <div class="actions">
            <button class="green" data-view="${board.id}">Utiliser</button>
            <button data-edit="${board.id}">Modifier</button>
            <button class="ghost" data-copy="${board.id}">Copier</button>
            <button class="danger" data-delete="${board.id}">Supprimer</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function emptyHome() {
  return `
    <div class="empty-state">
      <h2>Aucun board pour le moment</h2>
      <p class="subtitle">Crée un premier tableau, ajoute les images d'états, puis passe en mode enfant.</p>
    </div>
  `;
}

function createBoard() {
  const boards = getBoards();
  const board = {
    id: uid(),
    title: "Nouveau board",
    childName: "Mon enfant",
    childImage: "",
    selectedTaskId: "",
    tasks: [
      { id: uid(), title: "Réveillé", image: iconSvg("Réveillé", "☀️", "#fef3c7") },
      { id: uid(), title: "Dents brossées", image: iconSvg("Dents", "🪥", "#dcfce7") },
      { id: uid(), title: "Manger", image: iconSvg("Manger", "🥣", "#e0f2fe") },
      { id: uid(), title: "Habillé", image: iconSvg("Habillé", "👕", "#fee2e2") }
    ]
  };
  boards.unshift(board);
  saveBoards(boards);
  routeTo(`edit/${board.id}`);
}

function duplicateBoard(id) {
  const source = getBoard(id);
  if (!source) return;
  const clone = {
    ...structuredClone(source),
    id: uid(),
    title: `${source.title} copie`,
    selectedTaskId: "",
    tasks: source.tasks.map((task) => ({ ...task, id: uid() }))
  };
  saveBoards([clone, ...getBoards()]);
  renderHome();
}

function deleteBoard(id) {
  const board = getBoard(id);
  if (!board) return;
  if (!confirm(`Supprimer "${board.title}" ?`)) return;
  saveBoards(getBoards().filter((item) => item.id !== id));
  renderHome();
}

function renderEditor(id) {
  const board = getBoard(id);
  if (!board) return routeTo("");

  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">✎</div>
          <div>
            <h1>Modifier le board</h1>
            <p class="subtitle">Les changements sont sauvegardés automatiquement sur cet appareil.</p>
          </div>
        </div>
        <div class="actions">
          ${installButton()}
          <button class="ghost" data-action="home">Accueil</button>
          <button class="green" data-action="view">Utiliser</button>
        </div>
      </header>
      <section class="content form-grid">
        <aside class="panel">
          <div class="field">
            <label for="board-title">Nom du board</label>
            <input id="board-title" type="text" value="${escapeHtml(board.title)}">
          </div>
          <div class="field">
            <label for="child-name">Nom de l'enfant</label>
            <input id="child-name" type="text" value="${escapeHtml(board.childName || "")}">
          </div>
          <div class="field">
            <label for="child-image-url">URL de la photo de l'enfant</label>
            <div class="child-preview">
              ${board.childImage ? `<img src="${board.childImage}" alt="">` : `<span>Photo</span>`}
            </div>
            <input id="child-image-url" type="url" inputmode="url" placeholder="https://..." value="${escapeHtml(board.childImage || "")}">
          </div>
          <button class="primary" data-action="add-task">+ Ajouter un état</button>
        </aside>
        <div class="panel">
          <h2>États du board</h2>
          <div class="tasks-editor">
            ${board.tasks.map((task, index) => taskEditor(task, index)).join("")}
          </div>
        </div>
      </section>
    </main>
  `;

  bindInstallButtons();
  app.querySelector("[data-action='home']").addEventListener("click", () => routeTo(""));
  app.querySelector("[data-action='view']").addEventListener("click", () => routeTo(`view/${board.id}`));
  app.querySelector("[data-action='add-task']").addEventListener("click", () => {
    board.tasks.push({ id: uid(), title: "Nouvel état", image: iconSvg("État", "⭐", "#f4f4f5") });
    setBoard(board);
    renderEditor(board.id);
  });

  app.querySelector("#board-title").addEventListener("input", (event) => {
    board.title = event.target.value.trimStart() || "Board sans nom";
    setBoard(board);
  });

  app.querySelector("#child-name").addEventListener("input", (event) => {
    board.childName = event.target.value;
    setBoard(board);
  });

  app.querySelector("#child-image-url").addEventListener("change", (event) => {
    board.childImage = event.target.value.trim();
    setBoard(board);
    renderEditor(board.id);
  });

  app.querySelectorAll("[data-task-title]").forEach((input) => {
    input.addEventListener("input", () => {
      const task = board.tasks.find((item) => item.id === input.dataset.taskTitle);
      if (!task) return;
      task.title = input.value;
      setBoard(board);
    });
  });

  app.querySelectorAll("[data-task-image-url]").forEach((input) => {
    input.addEventListener("change", () => {
      const task = board.tasks.find((item) => item.id === input.dataset.taskImageUrl);
      if (!task) return;
      task.image = input.value.trim();
      setBoard(board);
      renderEditor(board.id);
    });
  });

  app.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", () => {
      moveTask(board, button.dataset.move, Number(button.dataset.direction));
      renderEditor(board.id);
    });
  });

  app.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      board.tasks = board.tasks.filter((task) => task.id !== button.dataset.remove);
      if (board.selectedTaskId === button.dataset.remove) board.selectedTaskId = "";
      setBoard(board);
      renderEditor(board.id);
    });
  });
}

function taskEditor(task, index) {
  return `
    <article class="task-editor">
      <div class="image-picker-preview">${task.image ? `<img src="${task.image}" alt="">` : "★"}</div>
      <div>
        <div class="field">
          <label class="task-title" for="task-${task.id}">État ${index + 1}</label>
          <input id="task-${task.id}" data-task-title="${task.id}" type="text" value="${escapeHtml(task.title)}">
        </div>
        <div class="field">
          <label for="image-${task.id}">URL de l'image</label>
          <input id="image-${task.id}" data-task-image-url="${task.id}" type="url" inputmode="url" placeholder="https://..." value="${escapeHtml(task.image || "")}">
        </div>
      </div>
      <div class="actions">
        <button class="ghost" data-move="${task.id}" data-direction="-1" title="Monter">↑</button>
        <button class="ghost" data-move="${task.id}" data-direction="1" title="Descendre">↓</button>
        <button class="danger" data-remove="${task.id}" title="Supprimer">×</button>
      </div>
    </article>
  `;
}

function moveTask(board, taskId, direction) {
  const index = board.tasks.findIndex((task) => task.id === taskId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= board.tasks.length) return;
  const [task] = board.tasks.splice(index, 1);
  board.tasks.splice(nextIndex, 0, task);
  setBoard(board);
}

function renderChildView(id) {
  const board = getBoard(id);
  if (!board) return routeTo("");
  requestLandscape();

  const taskCount = Math.max(board.tasks.length, 1);
  app.innerHTML = `
    <main class="view-shell">
      <section class="board-paper" style="--task-count: ${taskCount}">
        <header class="view-header">
          <span></span>
          <h1>${escapeHtml(board.title)}</h1>
          <div class="actions">
            ${installButton()}
            <button class="ghost" data-action="edit">Modifier</button>
            <button class="ghost" data-action="home">Accueil</button>
          </div>
        </header>
        <div class="states-row">
          ${board.tasks.map((task) => stateColumn(board, task)).join("")}
        </div>
        <div class="home-zone" data-drop-home>
          <div class="drop-zone ${board.selectedTaskId ? "" : "is-home"}">
            ${board.selectedTaskId ? "" : childToken(board)}
          </div>
        </div>
      </section>
      <div class="portrait-warning">
        <div>
          <h2>Tourne l'écran</h2>
          <p>Ce board est prévu en mode horizontal pour être plus facile à utiliser.</p>
        </div>
      </div>
      ${installHelpDialog()}
    </main>
  `;

  bindInstallButtons();
  app.querySelector("[data-action='edit']").addEventListener("click", () => routeTo(`edit/${board.id}`));
  app.querySelector("[data-action='home']").addEventListener("click", () => routeTo(""));
  enableChildDrag(board);
}

function stateColumn(board, task) {
  const hasChild = board.selectedTaskId === task.id;
  return `
    <article class="state-column">
      <div class="state-picture">${task.image ? `<img src="${task.image}" alt="">` : "★"}</div>
      <div class="state-label">${escapeHtml(task.title)}</div>
      <div class="arrow">↓</div>
      <div class="drop-zone" data-drop-task="${task.id}" aria-label="${escapeHtml(task.title)}">
        ${hasChild ? childToken(board) : ""}
      </div>
    </article>
  `;
}

function childToken(board) {
  if (board.childImage) {
    return `<div class="child-token" data-child-token role="button" aria-label="${escapeHtml(board.childName || "Enfant")}"><img src="${board.childImage}" alt=""></div>`;
  }
  return `<div class="child-token fallback" data-child-token role="button" aria-label="${escapeHtml(board.childName || "Enfant")}">🙂</div>`;
}

function enableChildDrag(board) {
  const token = app.querySelector("[data-child-token]");
  if (!token) return;

  let offsetX = 0;
  let offsetY = 0;

  token.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const rect = token.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    token.style.width = `${rect.width}px`;
    token.style.height = `${rect.height}px`;
    token.classList.add("dragging");
    moveToken(token, event.clientX, event.clientY, offsetX, offsetY);
    token.setPointerCapture(event.pointerId);
  });

  token.addEventListener("pointermove", (event) => {
    if (!token.classList.contains("dragging")) return;
    moveToken(token, event.clientX, event.clientY, offsetX, offsetY);
    markDropTarget(event.clientX, event.clientY);
  });

  token.addEventListener("pointerup", (event) => {
    if (!token.classList.contains("dragging")) return;
    token.classList.remove("dragging");
    clearDropMarks();
    token.style.transform = "";
    token.style.width = "";
    token.style.height = "";

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const taskZone = target?.closest("[data-drop-task]");
    const homeZone = target?.closest("[data-drop-home]");
    if (taskZone) board.selectedTaskId = taskZone.dataset.dropTask;
    if (homeZone) board.selectedTaskId = "";
    setBoard(board);
    renderChildView(board.id);
  });
}

function moveToken(token, clientX, clientY, offsetX, offsetY) {
  token.style.transform = `translate(${clientX - offsetX}px, ${clientY - offsetY}px)`;
}

function markDropTarget(clientX, clientY) {
  clearDropMarks();
  const target = document.elementFromPoint(clientX, clientY);
  const zone = target?.closest(".drop-zone");
  if (zone) zone.classList.add("is-over");
}

function clearDropMarks() {
  app.querySelectorAll(".drop-zone.is-over").forEach((zone) => zone.classList.remove("is-over"));
}

async function requestLandscape() {
  try {
    if (screen.orientation?.lock) await screen.orientation.lock("landscape");
  } catch {
    // Browsers often allow orientation lock only after fullscreen/user gesture.
  }
}

function installButton() {
  if (isStandaloneApp()) return "";
  return `<button class="install-button" data-action="install-app">Installer l'app</button>`;
}

function bindInstallButtons() {
  app.querySelectorAll("[data-action='install-app']").forEach((button) => {
    button.disabled = false;
    button.addEventListener("click", installApp);
  });
  renderInstallButtonState();
}

function renderInstallButtonState() {
  app.querySelectorAll("[data-action='install-app']").forEach((button) => {
    if (isStandaloneApp()) {
      button.remove();
      return;
    }
    button.classList.toggle("is-ready", Boolean(deferredInstallPrompt));
  });
}

async function installApp() {
  await enterFullscreenForOrientation();
  await requestLandscape();

  if (!deferredInstallPrompt) {
    showInstallHelp();
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  renderInstallButtonState();
}

async function enterFullscreenForOrientation() {
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Fullscreen is optional and browser-dependent.
  }
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

function installHelpDialog() {
  return `
    <div class="install-help" data-install-help hidden>
      <div class="install-help-panel" role="dialog" aria-modal="true" aria-labelledby="install-help-title">
        <h2 id="install-help-title">Installer l'app</h2>
        <p>${installHelpText()}</p>
        <button class="primary" data-action="close-install-help">OK</button>
      </div>
    </div>
  `;
}

function installHelpText() {
  if (isIos()) {
    return "Sur iPhone ou iPad, appuie sur le bouton Partager du navigateur, puis choisis Ajouter a l'ecran d'accueil.";
  }
  return "Ouvre le menu du navigateur, puis choisis Installer l'application ou Ajouter a l'ecran d'accueil.";
}

function showInstallHelp() {
  if (!app.querySelector("[data-install-help]")) {
    document.body.insertAdjacentHTML("beforeend", installHelpDialog());
  }
  const dialog = document.querySelector("[data-install-help]");
  dialog.hidden = false;
  dialog.querySelector("[data-action='close-install-help']").addEventListener("click", () => {
    dialog.hidden = true;
  }, { once: true });
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

render();
