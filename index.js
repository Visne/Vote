const config = require("./config.json");

const express = require("express");
const app = express();

app.use(express.static("public"));

const port = config.port;
app.listen(port, () => console.log("Listening on http://localhost:" + port));