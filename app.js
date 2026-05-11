import { supabase, hasSupabaseConfig } from "./supabaseClient.js";

let state = {
  roles: [],
  tasks: [],
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
const memberCount = document.querySelector("#memberCount");
const resetDemoButton = document.querySelector("#resetDemoButton");
const filterButtons = document.querySelectorAll(".filter-button");
let taskAssigneeLinksEnabled = true;

function setStatus(message, type = "idle") {
  if (type === "error") {
    console.warn(message);
    if (!appShell.hidden) {
      window.alert(message);
    }
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
    const [rolesResult, membersResult, tasksResult] = await Promise.all([
      supabase.from("cargos").select("id,nome,created_at").order("created_at", { ascending: true }),
      supabase.from("colegas").select("id,nome,cargo_id,created_at").order("created_at", { ascending: true }),
      supabase.from("tarefas").select("id,titulo,colega_id,concluida,created_at").order("created_at", { ascending: false }),
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
  renderRoles();
  renderAssigneeOptions(taskAssigneeInput);
  renderTasks();
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
  state = { roles: [], tasks: [], filter: "all" };
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
      if (!confirm(`Remover o cargo "${role.name}" e os nomes dentro dele?`)) return;
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
    if (!confirm(`Remover "${member.name}"?`)) return;
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
  return Array.from(select.selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean);
}

function renderAssigneeOptions(select, selectedValues = getSelectedValues(select)) {
  const members = getMembers();
  const selectedSet = new Set(Array.isArray(selectedValues) ? selectedValues : [selectedValues].filter(Boolean));
  select.replaceChildren();

  if (members.length === 0) {
    const option = new Option("Adiciona colegas primeiro", "");
    option.disabled = true;
    select.append(option);
    return;
  }

  members.forEach((member) => {
    const option = new Option(`${member.name} - ${member.roleName}`, member.id);
    option.selected = selectedSet.has(member.id);
    select.append(option);
  });
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
    renderAssigneeOptions(assignee, task.assigneeIds);

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
      if (!confirm(`Remover a tarefa "${task.title}"?`)) return;
      await deleteTask(task.id);
    });

    taskList.append(node);
  });
}

function emptyState(text) {
  const element = document.createElement("p");
  element.className = "empty-state";
  element.textContent = text;
  return element;
}

async function runMutation(action) {
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
  });
}

async function updateRole(id, name) {
  await runMutation(async () => {
    const { error } = await supabase.from("cargos").update({ nome: name }).eq("id", id);
    throwIfError(error);
  });
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
  });
}

async function createMember(roleId, name) {
  await runMutation(async () => {
    const { error } = await supabase.from("colegas").insert({ nome: name, cargo_id: roleId });
    throwIfError(error);
  });
}

async function updateMember(id, name) {
  await runMutation(async () => {
    const { error } = await supabase.from("colegas").update({ nome: name }).eq("id", id);
    throwIfError(error);
  });
}

async function deleteMember(id) {
  await runMutation(async () => {
    const { error } = await supabase.from("colegas").delete().eq("id", id);
    throwIfError(error);
  });
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
  });
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
  });
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
  });
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
  Array.from(taskAssigneeInput.options).forEach((option) => {
    option.selected = false;
  });
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    renderTasks();
  });
});

resetDemoButton.addEventListener("click", async () => {
  if (!confirm("Queres apagar todos os cargos, nomes e tarefas da base de dados?")) return;

  await runMutation(async () => {
    const taskLinksResult = taskAssigneeLinksEnabled
      ? await supabase.from("tarefa_colegas").delete().neq("tarefa_id", "00000000-0000-0000-0000-000000000000")
      : { error: null };
    const [tasksResult, membersResult, rolesResult] = await Promise.all([
      supabase.from("tarefas").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      supabase.from("colegas").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      supabase.from("cargos").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    ]);

    throwIfError(taskLinksResult.error);
    throwIfError(tasksResult.error);
    throwIfError(membersResult.error);
    throwIfError(rolesResult.error);
  });
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
