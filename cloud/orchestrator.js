/**
 * Orchestrator:
 * Takes a high-level command and returns a task graph.
 * This is project-agnostic and works for any request.
 */

module.exports = {
  buildTaskGraph(command, projectName = "Generic") {
    return [
      {
        id: "T1",
        title: "Understand the request",
        description: `Analyze the following command and clarify goals:\n\n${command}`,
        assigned_agent_role: "architect",
        dependencies: []
      },
      {
        id: "T2",
        title: "Produce core output",
        description: `Based on the clarified understanding from T1, produce the main deliverable for:\n\n${command}`,
        assigned_agent_role: "writer",
        dependencies: ["T1"]
      },
      {
        id: "T3",
        title: "Review and refine",
        description: `Review the output from T2 and refine it for REDACTED use.`,
        assigned_agent_role: "engineer",
        dependencies: ["T2"]
      }
    ];
  }
};
