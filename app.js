const STORAGE_KEY = "etatboards.boards.v1";
const LEGACY_STORAGE_KEY = "nahelboard.boards.v1";
const PROFILE_STORAGE_KEY = "etatboards.profile.v1";
const MAX_CHILD_IMAGE_BYTES = 2 * 1024 * 1024;
const app = document.querySelector("#app");
let deferredInstallPrompt = null;
let boardsCache = [];
let userProfile = { childImage: "" };
let currentUser = null;
let authReady = false;
let statusMessage = "";

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

function loadLocalBoards() {
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
    selectedTaskId: "",
    tasks: ["Toilette", "Se laver", "Petit déjeuner", "S'habiller", "Partir"].map((title, index) => ({
      id: uid(),
      title,
      image: starterIcons[index]
    }))
  };
  saveLocalBoards([demo]);
  return [demo];
}

function saveBoards(boards) {
  const cleanBoards = removeChildImagesFromBoards(boards);
  boardsCache = cleanBoards;
  saveLocalBoards(cleanBoards);
  syncCloudBoards(cleanBoards);
}

function saveLocalBoards(boards) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
}

function loadLocalProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "{}");
    return { childImage: profile.childImage || "" };
  } catch {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    return { childImage: "" };
  }
}

function saveLocalProfile(profile) {
  userProfile = { childImage: profile.childImage || "" };
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(userProfile));
}

function migrateChildImageToProfile(boards) {
  if (userProfile.childImage) return boards;
  const boardWithImage = boards.find((board) => board.childImage);
  if (!boardWithImage) return boards;

  saveLocalProfile({ childImage: boardWithImage.childImage });
  const migratedBoards = boards.map(({ childImage, ...board }) => board);
  saveLocalBoards(migratedBoards);
  return migratedBoards;
}

function removeChildImagesFromBoards(boards) {
  return boards.map(({ childImage, ...board }) => board);
}

function getChildImage() {
  return userProfile.childImage || "";
}

function getBoards() {
  if (!boardsCache.length) boardsCache = loadLocalBoards();
  boardsCache = migrateChildImageToProfile(boardsCache);
  return boardsCache;
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
preventManualZoom();

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
          ${authControls()}
          ${installButton()}
          <button class="primary" data-action="new-board">+ Nouveau board</button>
        </div>
      </header>
      ${statusBanner()}
      <section class="content">
        ${boards.length ? boardCards(boards) : emptyHome()}
      </section>
    </main>
  `;

  app.querySelector("[data-action='new-board']").addEventListener("click", createBoard);
  bindInstallButtons();
  bindAuthControls();
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
  const childImage = getChildImage();

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
          ${authControls()}
          ${installButton()}
          <button class="ghost" data-action="home">Accueil</button>
          <button class="green" data-action="view">Utiliser</button>
        </div>
      </header>
      ${statusBanner()}
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
            <label for="child-image-file">Photo de l'enfant</label>
            <div class="child-preview">
              ${childImage ? `<img src="${childImage}" alt="">` : `<span>Photo</span>`}
            </div>
            <input id="child-image-file" type="file" accept="image/*">
            <p class="field-hint">Maximum 2 Mo. Cette photo est liee au compte, pas au board.</p>
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
  bindAuthControls();
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

  app.querySelector("#child-image-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const result = await saveChildImage(file);
    if (!result.ok) {
      showInlineDialog("Image refusee", result.message);
      event.target.value = "";
      return;
    }

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
            ${authControls()}
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
  bindAuthControls();
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
  const childImage = getChildImage();
  if (childImage) {
    return `<div class="child-token" data-child-token role="button" aria-label="${escapeHtml(board.childName || "Enfant")}"><img src="${childImage}" alt=""></div>`;
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

async function initApp() {
  userProfile = loadLocalProfile();
  boardsCache = loadLocalBoards();
  boardsCache = migrateChildImageToProfile(boardsCache);
  await initAuth();
  render();
}

async function initAuth() {
  authReady = false;

  if (!canUseOnlineAuth()) {
    statusMessage = "Mode local: connecte l'app sur Netlify pour synchroniser les boards en ligne.";
    authReady = true;
    return;
  }

  try {
    currentUser = await fetchCurrentUser();
    await loadBoardsForCurrentUser();
  } catch {
    statusMessage = "Connexion indisponible: verifie que le site Netlify est deploye.";
  } finally {
    authReady = true;
  }
}

function canUseOnlineAuth() {
  return location.protocol === "https:" && !["localhost", "127.0.0.1"].includes(location.hostname);
}

async function fetchCurrentUser() {
  const response = await fetch("/api/auth/me", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;

  const data = await response.json();
  return data.user || null;
}

async function loadBoardsForCurrentUser() {
  if (!currentUser) {
    userProfile = loadLocalProfile();
    boardsCache = loadLocalBoards();
    boardsCache = migrateChildImageToProfile(boardsCache);
    statusMessage = authReady ? "Connecte-toi pour sauvegarder les boards en ligne." : statusMessage;
    render();
    return;
  }

  try {
    const localBoards = migrateChildImageToProfile(loadLocalBoards());
    const localProfile = loadLocalProfile();
    const cloudProfile = await fetchCloudProfile();
    userProfile = cloudProfile.childImage ? cloudProfile : localProfile;
    saveLocalProfile(userProfile);
    if (!cloudProfile.childImage && localProfile.childImage?.startsWith("data:")) {
      await uploadDataUrlChildImage(localProfile.childImage);
    }
    const cloudBoards = removeChildImagesFromBoards(await fetchCloudBoards());

    if (!cloudBoards.length && localBoards.length) {
      boardsCache = localBoards;
      await syncCloudBoards(localBoards, true);
    } else {
      boardsCache = cloudBoards;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudBoards));
    }

    statusMessage = `Connecte: ${currentUser.pseudo || "compte utilisateur"} - sauvegarde en ligne active.`;
  } catch {
    boardsCache = loadLocalBoards();
    statusMessage = "Connexion au stockage en ligne impossible. Les changements restent locaux pour le moment.";
  }

  render();
}

async function fetchCloudProfile() {
  const response = await fetch("/api/profile", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401) return loadLocalProfile();
  if (!response.ok) throw new Error("Cloud profile request failed");

  const data = await response.json();
  const profile = { childImage: data.profile?.childImage || "" };
  return profile;
}

async function fetchCloudBoards() {
  const response = await fetch("/api/boards", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401) return [];
  if (!response.ok) throw new Error("Cloud boards request failed");

  const data = await response.json();
  return Array.isArray(data.boards) ? data.boards : [];
}

async function syncCloudBoards(boards, force = false) {
  if (!currentUser || (!authReady && !force)) return;

  try {
    const response = await fetch("/api/boards", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ boards }),
    });

    if (!response.ok) throw new Error("Cloud boards save failed");
    statusMessage = `Connecte: ${currentUser.pseudo || "compte utilisateur"} - sauvegarde en ligne active.`;
  } catch {
    statusMessage = "Sauvegarde en ligne impossible. Reessaie quand la connexion est revenue.";
  }
}

async function saveChildImage(file) {
  if (!file.type.startsWith("image/")) {
    return { ok: false, message: "Choisis un fichier image." };
  }

  if (file.size > MAX_CHILD_IMAGE_BYTES) {
    return { ok: false, message: "L'image ne doit pas depasser 2 Mo." };
  }

  if (currentUser && authReady) {
    try {
      const response = await fetch("/api/profile/image", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!response.ok) throw new Error("Profile image upload failed");
      const data = await response.json();
      saveLocalProfile({ childImage: data.profile?.childImage || "" });
      statusMessage = "Photo enfant sauvegardee sur le compte.";
      return { ok: true };
    } catch {
      return { ok: false, message: "Upload impossible pour le moment. Reessaie une fois connecte." };
    }
  }

  const dataUrl = await readFileAsDataUrl(file);
  saveLocalProfile({ childImage: dataUrl });
  statusMessage = "Photo enfant sauvegardee en local. Connecte-toi pour la mettre en ligne.";
  return { ok: true };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadDataUrlChildImage(dataUrl) {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    if (blob.size > MAX_CHILD_IMAGE_BYTES) return;

    const uploadResponse = await fetch("/api/profile/image", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": blob.type || "image/jpeg" },
      body: blob,
    });

    if (!uploadResponse.ok) return;
    const data = await uploadResponse.json();
    saveLocalProfile({ childImage: data.profile?.childImage || dataUrl });
  } catch {
    // Keeping the local image is better than blocking login.
  }
}

function authControls() {
  if (!authReady) return `<span class="auth-note">Connexion...</span>`;
  if (currentUser) {
    return `
      <span class="auth-note">${escapeHtml(currentUser.pseudo || "Connecte")}</span>
      <button class="ghost" data-action="logout">Deconnexion</button>
    `;
  }

  return `
    <button class="ghost" data-action="login">Connexion</button>
    <button class="ghost" data-action="signup">Compte</button>
  `;
}

function bindAuthControls() {
  app.querySelectorAll("[data-action='login']").forEach((button) => {
    button.addEventListener("click", () => showAuthDialog("login"));
  });
  app.querySelectorAll("[data-action='signup']").forEach((button) => {
    button.addEventListener("click", () => showAuthDialog("signup"));
  });
  app.querySelectorAll("[data-action='logout']").forEach((button) => {
    button.addEventListener("click", logoutUser);
  });
}

function statusBanner() {
  if (!statusMessage) return "";
  return `<div class="status-banner">${escapeHtml(statusMessage)}</div>`;
}

function showAuthDialog(mode) {
  if (!canUseOnlineAuth()) {
    showInlineDialog(
      "Compte utilisateur",
      "Les comptes fonctionnent apres deploiement Netlify. En local, les boards restent sur cet appareil."
    );
    return;
  }

  const title = mode === "signup" ? "Creer un compte" : "Connexion";
  document.body.insertAdjacentHTML("beforeend", `
    <div class="install-help" data-auth-dialog>
      <form class="install-help-panel auth-form" data-auth-form>
        <h2>${title}</h2>
        <label>
          Pseudo
          <input name="pseudo" type="text" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_-]+">
        </label>
        <label>
          Mot de passe
          <input name="password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" required minlength="6">
        </label>
        <p class="auth-error" data-auth-error></p>
        <div class="actions">
          <button class="primary" type="submit">${title}</button>
          <button class="ghost" type="button" data-action="close-auth">Annuler</button>
        </div>
      </form>
    </div>
  `);

  const dialog = document.querySelector("[data-auth-dialog]");
  const form = dialog.querySelector("[data-auth-form]");
  dialog.querySelector("[data-action='close-auth']").addEventListener("click", () => dialog.remove());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const pseudo = String(formData.get("pseudo") || "").trim();
    const password = String(formData.get("password") || "");
    const error = form.querySelector("[data-auth-error]");

    try {
      currentUser = await submitAuth(mode, pseudo, password);
      statusMessage = mode === "signup"
        ? "Compte cree. Sauvegarde en ligne active."
        : "Connecte. Sauvegarde en ligne active.";
      dialog.remove();
      await loadBoardsForCurrentUser();
    } catch (errorValue) {
      error.textContent = errorValue?.message || "Connexion impossible.";
    }
  });
}

async function logoutUser() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } finally {
    currentUser = null;
    boardsCache = loadLocalBoards();
    statusMessage = "Deconnecte. Les changements restent locaux.";
    render();
  }
}

async function submitAuth(mode, pseudo, password) {
  const response = await fetch(`/api/auth/${mode}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ pseudo, password }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Connexion impossible.");
  }

  return data.user;
}

function showInlineDialog(title, message) {
  document.body.insertAdjacentHTML("beforeend", `
    <div class="install-help" data-inline-dialog>
      <div class="install-help-panel" role="dialog" aria-modal="true">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <button class="primary" data-action="close-inline-dialog">OK</button>
      </div>
    </div>
  `);
  const dialog = document.querySelector("[data-inline-dialog]");
  dialog.querySelector("[data-action='close-inline-dialog']").addEventListener("click", () => dialog.remove(), { once: true });
}

function preventManualZoom() {
  document.addEventListener("gesturestart", (event) => event.preventDefault());
  document.addEventListener("gesturechange", (event) => event.preventDefault());
  document.addEventListener("gestureend", (event) => event.preventDefault());
  document.addEventListener("wheel", (event) => {
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });
  document.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });
}

initApp();
