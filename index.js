const config = require("./config.json");
const path = require("path")
const express = require("express");
const app = express();

let base = "/";
if (config.hasOwnProperty("base")) {
    base += config.base;
}

app.use(base, express.static(path.join(__dirname, "public")));

const port = config.port;
app.listen(port, () => console.log("Listening on http://localhost:" + port));