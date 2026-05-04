const express = require("express");
const cors = require("cors");
const taskEngine = require("./taskEngine");
const autoMode = require("./autoMode");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/acc", (req, res) => {
  const payload = req.body;

  if (payload.type === "auto") {
    const graph = [
      {
        id: "T1",
        title: "Auto Task",
        description: payload.text || "Auto",
        assigned_agent_role: "architect"
      }
    ];
    autoMode.runAutoMode(graph, "Browser Triggered");
  }

  if (payload.type === "role") {
    taskEngine.executeTask({
      id: "BR1",
      title: "Browser Task",
      description: payload.text,
      assigned_agent_role: payload.role
    });
  }

  res.json({ status: "ok" });
});

app.get("/snapshots", (req, res) => {
  const data = require("./snapshots.json");
  res.json(data);
});

app.listen(3333, () => console.log("ACC Local Bridge running on 3333"));
