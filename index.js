const config = require("./config.json");
const Path = require("path")
const Express = require("express");
const ExpressHandlebars = require("express-handlebars");

const app = Express();

// Set up rendering engine
app.engine('.hbs', ExpressHandlebars.engine({
    extname: ".hbs",
    defaultLayout: "index"
}));
app.set('view engine', '.hbs');
app.set('views', Path.join(__dirname, 'views'));

// Set base url, if specified
let base = "/";
if (config.hasOwnProperty("base")) {
    base += config.base;
}

// Host index.hbs with main.hbs view
app.get(base, (req, res) => {
    res.render("main", {
        clientId: config.clientId,
        redirectUri: config.redirectUri
    });
})

// Check if port is specified in config
if (!config.hasOwnProperty("port")) {
    console.log("No port specified in config.json!");
    process.exit(1);
}

// Listen on port
const port = config.port;
app.listen(port, () => console.log("Listening on http://localhost:" + port));