module.exports = {
  routeTask(task) {
    const role = task.assigned_agent_role;

    if (role === "architect") return "copilot";
    if (role === "writer") return "chatgpt";
    if (role === "engineer") return "copilot";

    return "copilot";
  }
};
