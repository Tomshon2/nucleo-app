import { supabase, hasSupabaseConfig } from "./supabaseClient.js";

let state = {
  roles: [],
  tasks: [],
  events: [],
  filter: "all",
};

let currentSession = null;

const appShell = document.querySelector("#appShell");
const authGate = document.querySelector("#authGate");
const authForm = document.querySelector("#authForm");
const authEmailInput = document.querySelector("#authEmailInput");
const authPasswordInput = document.querySelector("#authPasswordInput");
const authError = document.querySelector("#authError");
const logoutButton = document.querySelector("#logoutButton");
const userEmail = document.querySelector("#userEmail");
const roleForm = document.querySelector("#roleForm");
const roleNameInput = document.querySelector("#roleNameInput");
const roleList = document.querySelector("#roleList");
const roleTemplate = document.querySelector("#roleTemplate");
const memberTemplate = document.querySelector("#memberTemplate");
const taskForm = document.querySelector("#taskForm");
const taskTitleInput = document.querySelector("#taskTitleInput");
const taskAssigneeInput = document.querySelector("#taskAssigneeInput");
const taskList = document.querySelector("#taskList");
const taskTemplate = document.querySelector("#taskTemplate");
const eventForm = document.querySelector("#eventForm");
const eventTitleInput = document.querySelector("#eventTitleInput");
const eventDateInput = document.querySelector("#eventDateInput");
const eventOwnerInput = document.querySelector("#eventOwnerInput");
const eventList = document.querySelector("#eventList");
const eventTemplate = document.querySelector("#eventTemplate");
const memberCount = document.querySelector("#memberCount");
const resetDemoButton = document.querySelector("#resetDemoButton");
const filterButtons = document.querySelectorAll(".filter-button");
const rolesStat = document.querySelector("#rolesStat");
const membersStat = document.querySelector("#membersStat");
const openTasksStat = document.querySelector("#openTasksStat");
const doneTasksStat = document.querySelector("#doneTasksStat");
const upcomingEventsStat = document.querySelector("#upcomingEventsStat");
const confirmDialog = document.querySelector("#confirmDialog");
const confirmTitle = document.querySelector("#confirmTitle");
const confirmMessage = document.querySelector("#confirmMessage");
const confirmCancel = document.querySelector("#confirmCancel");
const confirmAccept = document.querySelector("#confirmAccept");
const toast = document.querySelector("#toast");
let taskAssigneeLinksEnabled = true;
let eventsEnabled = true;
let toastTimer = null;

function setStatus(message, type = "idle") {
  if (type === "error") {
    console.warn(message);
  }
}

function setBusy(isBusy) {
  document.body.classList.toggle("is-busy", isBusy);
}

async function loadState() {
  if (!hasSupabaseConfig) {
    setStatus("Coloca o URL e a chave no ficheiro .env", "error");
    return;
  }

  if (!currentSession) {
    return;
  }

  setBusy(true);
  setStatus("A carregar dados...", "idle");

  try {
    const [rolesResult, membersResult, tasksResult, eventsResult] = await Promise.all([
      supabase.from("cargos").select("id,nome,created_at").order("created_at", { ascending: true }),
      supabase.from("colegas").select("id,nome,cargo_id,created_at").order("created_at", { ascending: true }),
      supabase.from("tarefas").select("id,titulo,colega_id,concluida,created_at").order("created_at", { ascending: false }),
      loadEvents(),
    ]);

    throwIfError(rolesResult.error);
    throwIfError(membersResult.error);
    throwIfError(tasksResult.error);

    const membersByRole = new Map();
    membersResult.data.forEach((member) => {
      if (!membersByRole.has(member.cargo_id)) {
        membersByRole.set(member.cargo_id, []);
      }
      membersByRole.get(member.cargo_id).push({
        id: member.id,
        name: member.nome,
        createdAt: member.created_at,
      });
    });

    state.roles = rolesResult.data.map((role) => ({
      id: role.id,
      name: role.nome,
      createdAt: role.created_at,
      members: membersByRole.get(role.id) || [],
    }));

    const taskAssigneesByTask = await loadTaskAssigneeLinks();

    state.tasks = tasksResult.data.map((task) => ({
      id: task.id,
      title: task.titulo,
      assigneeIds: taskAssigneesByTask.get(task.id) || (task.colega_id ? [task.colega_id] : []),
      done: Boolean(task.concluida),
      createdAt: task.created_at,
    }));
    state.events = eventsResult;

    render();
  } catch (error) {
    console.error(error);
    setStatus(`Erro: ${getFriendlyErrorMessage(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

function getFriendlyErrorMessage(error) {
  const message = error?.message || "";

  if (message.includes("Failed to fetch")) {
    return "nao consegui ligar ao Supabase. O dominio do Project URL nao esta a responder neste PC/rede.";
  }

  return message || "algo correu mal";
}

function throwIfError(error) {
  if (error) {
    throw error;
  }
}

function getMembers() {
  return state.roles.flatMap((role) =>
    role.members.map((member) => ({
      ...member,
      roleName: role.name,
    })),
  );
}

async function loadEvents() {
  const result = await supabase
    .from("eventos")
    .select("id,titulo,data_evento,colega_id,concluido,created_at")
    .order("data_evento", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (result.error) {
    eventsEnabled = false;
    console.warn("Tabela eventos ainda nao existe. Corre a migracao SQL para ativar eventos.");
    return [];
  }

  eventsEnabled = true;
  return result.data.map((event) => ({
    id: event.id,
    title: event.titulo,
    date: event.data_evento || "",
    ownerId: event.colega_id || "",
    done: Boolean(event.concluido),
    createdAt: event.created_at,
  }));
}

async function loadTaskAssigneeLinks() {
  const linksByTask = new Map();
  const result = await supabase.from("tarefa_colegas").select("tarefa_id,colega_id");

  if (result.error) {
    taskAssigneeLinksEnabled = false;
    console.warn("Tabela tarefa_colegas ainda nao existe. A app usa o primeiro responsavel ate correres a migracao SQL.");
    return linksByTask;
  }

  taskAssigneeLinksEnabled = true;
  result.data.forEach((link) => {
    if (!linksByTask.has(link.tarefa_id)) {
      linksByTask.set(link.tarefa_id, []);
    }
    linksByTask.get(link.tarefa_id).push(link.colega_id);
  });

  return linksByTask;
}

function render() {
  renderStats();
  renderRoles();
  renderAssigneePicker(taskAssigneeInput);
  renderOwnerOptions(eventOwnerInput);
  renderTasks();
  renderEvents();
}

function renderStats() {
  const members = getMembers();
  const openTasks = state.tasks.filter((task) => !task.done).length;
  const doneTasks = state.tasks.filter((task) => task.done).length;
  const today = new Date().toISOString().slice(0, 10);
  const upcomingEvents = state.events.filter((event) => !event.done && (!event.date || event.date >= today)).length;

  rolesStat.textContent = state.roles.length;
  membersStat.textContent = members.length;
  openTasksStat.textContent = openTasks;
  doneTasksStat.textContent = doneTasks;
  upcomingEventsStat.textContent = upcomingEvents;
}

async function initAuth() {
  if (!hasSupabaseConfig) {
    showLoggedOut("Configura primeiro o Supabase no ficheiro .env.");
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showLoggedOut(error.message);
    return;
  }

  updateAuthView(data.session);

  supabase.auth.onAuthStateChange((_event, session) => {
    updateAuthView(session);
  });
}

function updateAuthView(session) {
  currentSession = session;

  if (!session) {
    showLoggedOut();
    return;
  }

  authGate.hidden = true;
  appShell.hidden = false;
  logoutButton.hidden = false;
  resetDemoButton.hidden = false;
  userEmail.hidden = false;
  userEmail.textContent = session.user.email || "Sessao ativa";
  authError.textContent = "";
  loadState();
}

function showLoggedOut(message = "") {
  currentSession = null;
  state = { roles: [], tasks: [], events: [], filter: "all" };
  appShell.hidden = true;
  authGate.hidden = false;
  logoutButton.hidden = true;
  resetDemoButton.hidden = true;
  userEmail.hidden = true;
  userEmail.textContent = "";
  authError.textContent = message;
}

function renderRoles() {
  const members = getMembers();
  memberCount.textContent = `${members.length} ${members.length === 1 ? "colega" : "colegas"}`;
  roleList.replaceChildren();

  if (state.roles.length === 0) {
    roleList.append(emptyState("Adiciona cargos para construir a hierarquia do n\u00facleo."));
    return;
  }

  state.roles.forEach((role, index) => {
    const node = roleTemplate.content.firstElementChild.cloneNode(true);
    const rank = node.querySelector(".role-rank");
    const roleName = node.querySelector(".role-name-input");
    const memberList = node.querySelector(".member-list");
    const memberForm = node.querySelector(".member-form");
    const memberNameInput = node.querySelector(".member-name-input");
    const moveUp = node.querySelector(".move-up");
    const moveDown = node.querySelector(".move-down");
    const removeRole = node.querySelector(".remove-role");

    rank.textContent = index + 1;
    roleName.value = role.name;
    moveUp.disabled = index === 0;
    moveDown.disabled = index === state.roles.length - 1;

    roleName.addEventListener("change", async () => {
      const name = roleName.value.trim();
      if (!name || name === role.name) return;
      await updateRole(role.id, name);
    });

    moveUp.addEventListener("click", async () => {
      await swapRoles(index, index - 1);
    });

    moveDown.addEventListener("click", async () => {
      await swapRoles(index, index + 1);
    });

    removeRole.addEventListener("click", async () => {
      const confirmed = await askConfirmation({
        title: "Remover cargo",
        message: `Isto vai remover "${role.name}" e os membros dentro desse cargo.`,
        action: "Remover cargo",
      });
      if (!confirmed) return;
      await deleteRole(role.id);
    });

    if (role.members.length === 0) {
      memberList.append(emptyState("Sem nomes neste cargo."));
    } else {
      role.members.forEach((member) => {
        memberList.append(renderMemberRow(role, member));
      });
    }

    memberForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = memberNameInput.value.trim();
      if (!name) return;
      await createMember(role.id, name);
      memberNameInput.value = "";
    });

    roleList.append(node);
  });
}

function renderMemberRow(role, member) {
  const node = memberTemplate.content.firstElementChild.cloneNode(true);
  const input = node.querySelector(".member-input");
  const remove = node.querySelector(".remove-member");

  input.value = member.name;
  input.addEventListener("change", async () => {
    const name = input.value.trim();
    if (!name || name === member.name) return;
    await updateMember(member.id, name);
  });

  remove.addEventListener("click", async () => {
    const confirmed = await askConfirmation({
      title: "Remover colega",
      message: `Queres remover "${member.name}" deste cargo?`,
      action: "Remover colega",
    });
    if (!confirmed) return;
    await deleteMember(member.id);
  });

  return node;
}

async function swapRoles(from, to) {
  if (to < 0 || to >= state.roles.length) return;

  const current = state.roles[from];
  const target = state.roles[to];

  await runMutation(async () => {
    const [currentResult, targetResult] = await Promise.all([
      supabase.from("cargos").update({ created_at: target.createdAt }).eq("id", current.id),
      supabase.from("cargos").update({ created_at: current.createdAt }).eq("id", target.id),
    ]);

    throwIfError(currentResult.error);
    throwIfError(targetResult.error);
  });
}

function getSelectedValues(select) {
  return Array.from(select.querySelectorAll("input[type='checkbox']:checked"))
    .map((input) => input.value)
    .filter(Boolean);
}

function renderAssigneePicker(container, selectedValues = getSelectedValues(container)) {
  const members = getMembers();
  const selectedSet = new Set(Array.isArray(selectedValues) ? selectedValues : [selectedValues].filter(Boolean));
  container.replaceChildren();

  if (members.length === 0) {
    const empty = document.createElement("p");
    empty.className = "picker-empty";
    empty.textContent = "Adiciona colegas primeiro.";
    container.append(empty);
    return;
  }

  members.forEach((member) => {
    const label = document.createElement("label");
    label.className = "assignee-chip";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = member.id;
    input.checked = selectedSet.has(member.id);

    const text = document.createElement("span");
    text.textContent = `${member.name} - ${member.roleName}`;

    label.append(input, text);
    container.append(label);
  });
}

function renderOwnerOptions(select, selectedValue = select.value) {
  const members = getMembers();
  select.replaceChildren(new Option("Sem responsavel", ""));

  members.forEach((member) => {
    select.append(new Option(`${member.name} - ${member.roleName}`, member.id));
  });

  select.value = members.some((member) => member.id === selectedValue) ? selectedValue : "";
}

function renderTasks() {
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === state.filter);
  });

  taskList.replaceChildren();
  const visibleTasks = state.tasks.filter((task) => {
    if (state.filter === "open") return !task.done;
    if (state.filter === "done") return task.done;
    return true;
  });

  if (visibleTasks.length === 0) {
    taskList.append(emptyState("Sem tarefas nesta vista."));
    return;
  }

  visibleTasks.forEach((task) => {
    const node = taskTemplate.content.firstElementChild.cloneNode(true);
    const done = node.querySelector(".task-done");
    const title = node.querySelector(".task-title-input");
    const assignee = node.querySelector(".task-assignee-input");
    const remove = node.querySelector(".remove-task");

    node.classList.toggle("done", task.done);
    done.checked = task.done;
    title.value = task.title;
    renderAssigneePicker(assignee, task.assigneeIds);

    done.addEventListener("change", async () => {
      await updateTask(task.id, { concluida: done.checked });
    });

    title.addEventListener("change", async () => {
      const value = title.value.trim();
      if (!value || value === task.title) return;
      await updateTask(task.id, { titulo: value });
    });

    assignee.addEventListener("change", async () => {
      await updateTaskAssignees(task.id, getSelectedValues(assignee));
    });

    remove.addEventListener("click", async () => {
      const confirmed = await askConfirmation({
        title: "Remover tarefa",
        message: `Queres remover a tarefa "${task.title}"?`,
        action: "Remover tarefa",
      });
      if (!confirmed) return;
      await deleteTask(task.id);
    });

    taskList.append(node);
  });
}

function renderEvents() {
  eventList.replaceChildren();
  setEventFormEnabled(eventsEnabled);

  if (!eventsEnabled) {
    eventList.append(emptyState("Eventos ainda nao estao ativos. Corre o SQL atualizado no Supabase para criar a tabela eventos."));
    return;
  }

  if (state.events.length === 0) {
    eventList.append(emptyState("Sem eventos planeados."));
    return;
  }

  state.events.forEach((event) => {
    const node = eventTemplate.content.firstElementChild.cloneNode(true);
    const done = node.querySelector(".event-done");
    const title = node.querySelector(".event-title-input");
    const date = node.querySelector(".event-date-input");
    const owner = node.querySelector(".event-owner-input");
    const remove = node.querySelector(".remove-event");

    node.classList.toggle("done", event.done);
    done.checked = event.done;
    title.value = event.title;
    date.value = event.date;
    renderOwnerOptions(owner, event.ownerId);

    done.addEventListener("change", async () => {
      await updateEvent(event.id, { concluido: done.checked });
    });

    title.addEventListener("change", async () => {
      const value = title.value.trim();
      if (!value || value === event.title) return;
      await updateEvent(event.id, { titulo: value });
    });

    date.addEventListener("change", async () => {
      await updateEvent(event.id, { data_evento: date.value || null });
    });

    owner.addEventListener("change", async () => {
      await updateEvent(event.id, { colega_id: owner.value || null });
    });

    remove.addEventListener("click", async () => {
      const confirmed = await askConfirmation({
        title: "Remover evento",
        message: `Queres remover o evento "${event.title}"?`,
        action: "Remover evento",
      });
      if (!confirmed) return;
      await deleteEvent(event.id);
    });

    eventList.append(node);
  });
}

function setEventFormEnabled(enabled) {
  eventForm.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = !enabled;
  });
}

function emptyState(text) {
  const element = document.createElement("p");
  element.className = "empty-state";
  element.textContent = text;
  return element;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 2600);
}

function askConfirmation({ title, message, action = "Confirmar" }) {
  return new Promise((resolve) => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmAccept.textContent = action;

    const cleanup = (value) => {
      confirmCancel.removeEventListener("click", onCancel);
      confirmAccept.removeEventListener("click", onConfirm);
      confirmDialog.removeEventListener("close", onClose);
      if (confirmDialog.open) confirmDialog.close();
      resolve(value);
    };
    const onCancel = () => cleanup(false);
    const onConfirm = () => cleanup(true);
    const onClose = () => cleanup(false);

    confirmCancel.addEventListener("click", onCancel);
    confirmAccept.addEventListener("click", onConfirm);
    confirmDialog.addEventListener("close", onClose, { once: true });
    confirmDialog.showModal();
  });
}

async function runMutation(action, successMessage = "") {
  if (!hasSupabaseConfig) {
    setStatus("Configura primeiro o .env", "error");
    return;
  }

  if (!currentSession) {
    showLoggedOut("Tens de iniciar sessao para modificar a app.");
    return;
  }

  setBusy(true);
  setStatus("A guardar...", "idle");

  try {
    await action();
    await loadState();
    if (successMessage) showToast(successMessage);
  } catch (error) {
    console.error(error);
    setStatus(`Erro: ${getFriendlyErrorMessage(error)}`, "error");
  } finally {
    setBusy(false);
  }
}

async function createRole(name) {
  await runMutation(async () => {
    const { error } = await supabase.from("cargos").insert({ nome: name });
    throwIfError(error);
  }, "Cargo adicionado.");
}

async function updateRole(id, name) {
  await runMutation(async () => {
    const { error } = await supabase.from("cargos").update({ nome: name }).eq("id", id);
    throwIfError(error);
  }, "Cargo atualizado.");
}

async function deleteRole(id) {
  await runMutation(async () => {
    const members = state.roles.find((role) => role.id === id)?.members || [];
    if (members.length > 0) {
      const { error: membersError } = await supabase.from("colegas").delete().eq("cargo_id", id);
      throwIfError(membersError);
    }

    const { error } = await supabase.from("cargos").delete().eq("id", id);
    throwIfError(error);
  }, "Cargo removido.");
}

async function createMember(roleId, name) {
  await runMutation(async () => {
    const { error } = await supabase.from("colegas").insert({ nome: name, cargo_id: roleId });
    throwIfError(error);
  }, "Colega adicionado.");
}

async function updateMember(id, name) {
  await runMutation(async () => {
    const { error } = await supabase.from("colegas").update({ nome: name }).eq("id", id);
    throwIfError(error);
  }, "Colega atualizado.");
}

async function deleteMember(id) {
  await runMutation(async () => {
    const { error } = await supabase.from("colegas").delete().eq("id", id);
    throwIfError(error);
  }, "Colega removido.");
}

async function createTask(title, assigneeId) {
  const assigneeIds = Array.isArray(assigneeId) ? assigneeId : [assigneeId].filter(Boolean);
  await runMutation(async () => {
    requireTaskAssigneeLinks(assigneeIds);
    const { data, error } = await supabase.from("tarefas").insert({
      titulo: title,
      colega_id: assigneeIds[0] || null,
      concluida: false,
    }).select("id").single();
    throwIfError(error);
    await saveTaskAssigneeLinks(data.id, assigneeIds);
  }, "Tarefa adicionada.");
}

async function updateTask(id, values) {
  await runMutation(async () => {
    const { error } = await supabase.from("tarefas").update(values).eq("id", id);
    throwIfError(error);
  });
}

async function updateTaskAssignees(id, assigneeIds) {
  await runMutation(async () => {
    requireTaskAssigneeLinks(assigneeIds);
    const { error } = await supabase.from("tarefas").update({ colega_id: assigneeIds[0] || null }).eq("id", id);
    throwIfError(error);
    await saveTaskAssigneeLinks(id, assigneeIds);
  }, "Responsaveis atualizados.");
}

function requireTaskAssigneeLinks(assigneeIds) {
  if (!taskAssigneeLinksEnabled && assigneeIds.length > 1) {
    throw new Error("Para atribuir varias pessoas a uma tarefa, corre primeiro o SQL de migracao tarefa_colegas no Supabase.");
  }
}

async function saveTaskAssigneeLinks(taskId, assigneeIds) {
  if (!taskAssigneeLinksEnabled && assigneeIds.length <= 1) return;

  const deleteResult = await supabase.from("tarefa_colegas").delete().eq("tarefa_id", taskId);
  if (deleteResult.error) {
    taskAssigneeLinksEnabled = false;
    throw new Error("Para atribuir varias pessoas a uma tarefa, corre primeiro o SQL de migracao tarefa_colegas no Supabase.");
  }

  if (assigneeIds.length === 0) return;

  const rows = assigneeIds.map((memberId) => ({
    tarefa_id: taskId,
    colega_id: memberId,
  }));
  const insertResult = await supabase.from("tarefa_colegas").insert(rows);
  throwIfError(insertResult.error);
}

async function deleteTask(id) {
  await runMutation(async () => {
    if (taskAssigneeLinksEnabled) {
      const linksResult = await supabase.from("tarefa_colegas").delete().eq("tarefa_id", id);
      throwIfError(linksResult.error);
    }
    const { error } = await supabase.from("tarefas").delete().eq("id", id);
    throwIfError(error);
  }, "Tarefa removida.");
}

async function createEvent(title, date, ownerId) {
  await runMutation(async () => {
    if (!eventsEnabled) {
      throw new Error("Para adicionar eventos, corre primeiro o SQL de migracao eventos no Supabase.");
    }
    const { error } = await supabase.from("eventos").insert({
      titulo: title,
      data_evento: date || null,
      colega_id: ownerId || null,
      concluido: false,
    });
    throwIfError(error);
  }, "Evento adicionado.");
}

async function updateEvent(id, values) {
  await runMutation(async () => {
    const { error } = await supabase.from("eventos").update(values).eq("id", id);
    throwIfError(error);
  }, "Evento atualizado.");
}

async function deleteEvent(id) {
  await runMutation(async () => {
    const { error } = await supabase.from("eventos").delete().eq("id", id);
    throwIfError(error);
  }, "Evento removido.");
}

roleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = roleNameInput.value.trim();
  if (!name) return;
  await createRole(name);
  roleNameInput.value = "";
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = taskTitleInput.value.trim();
  if (!title) return;
  await createTask(title, getSelectedValues(taskAssigneeInput));
  taskTitleInput.value = "";
  Array.from(taskAssigneeInput.querySelectorAll("input[type='checkbox']")).forEach((input) => {
    input.checked = false;
  });
});

eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = eventTitleInput.value.trim();
  if (!title) return;
  await createEvent(title, eventDateInput.value, eventOwnerInput.value);
  eventTitleInput.value = "";
  eventDateInput.value = "";
  eventOwnerInput.value = "";
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    renderTasks();
  });
});

resetDemoButton.addEventListener("click", async () => {
  const confirmed = await askConfirmation({
    title: "Limpar todo o painel",
    message: "Esta acao remove cargos, colegas, tarefas e eventos. Nao pode ser anulada.",
    action: "Limpar tudo",
  });
  if (!confirmed) return;

  await runMutation(async () => {
    const eventsResult = eventsEnabled
      ? await supabase.from("eventos").delete().neq("id", "00000000-0000-0000-0000-000000000000")
      : { error: null };
    const taskLinksResult = taskAssigneeLinksEnabled
      ? await supabase.from("tarefa_colegas").delete().neq("tarefa_id", "00000000-0000-0000-0000-000000000000")
      : { error: null };
    const [tasksResult, membersResult, rolesResult] = await Promise.all([
      supabase.from("tarefas").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      supabase.from("colegas").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      supabase.from("cargos").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    ]);

    throwIfError(eventsResult.error);
    throwIfError(taskLinksResult.error);
    throwIfError(tasksResult.error);
    throwIfError(membersResult.error);
    throwIfError(rolesResult.error);
  }, "Painel limpo.");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;
  if (!email || !password) return;

  authError.textContent = "";
  setBusy(true);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    authError.textContent = getFriendlyErrorMessage(error);
  }

  setBusy(false);
});

logoutButton.addEventListener("click", async () => {
  await supabase.auth.signOut();
});

initAuth();
