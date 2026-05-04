document.getElementById("auto").onclick = () => {
  fetch("http://localhost:3333/acc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "auto" })
  });
};

document.getElementById("snapshots").onclick = () => {
  fetch("http://localhost:3333/snapshots")
    .then(r => r.json())
    .then(data => alert(JSON.stringify(data, null, 2)));
};

document.getElementById("telegram").onclick = () => {
  window.open("https://t.me/Clubosbot", "_blank");
};
