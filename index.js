"use strict";
const configPath = "./config.json"
const config = require(configPath);
const Utils = require("./utils");
const Path = require("path");
const Express = require("express");
const ExpressHandlebars = require("express-handlebars");
const Axios = require("axios").default
const CookieParser = require('cookie-parser')
const GitHub = require("./github");
const Database = require("./database");

// region Config verification

if (!Utils.verifyConfig(configPath)) {
    process.exit(1);
}

// Set base url, if specified
const BASE = config.base === undefined ? "/" : config.base;

// Get session expiry time or use default of 1 hour (in seconds)
const SESSION_EXPIRY = (config.sessionExpiry === undefined ? 60 * 60 : config.sessionExpiry) * 1000;

const RENDER = {
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    base: BASE
}

// endregion

const app = Express();
const db = new Database("database.db");
const github = new GitHub(config.clientId, config.clientSecret);

// region Setup

// Set up database
db.createTablesIfNotExists();

// Set up rendering engine
app.engine(".hbs", ExpressHandlebars.engine({
    extname: ".hbs",
    defaultLayout: "index"
}));
app.set("view engine", ".hbs");
app.set("views", Path.join(__dirname, "views"));

// Set up cookie parser
app.use(CookieParser());

// Serve static content in /public directory
app.use(BASE, Express.static(__dirname + "/public"));

// endregion

let MOVIES = {
    movies: [
        {
            title: "Dune",
            year: 2021,
            description: "Paul Atreides, a brilliant and gifted young man born into a great destiny beyond his understanding, must travel to the most dangerous planet in the universe to ensure the future of his family and his people. As malevolent forces explode into conflict over the planet's exclusive supply of the most precious resource in existence-a commodity capable of unlocking humanity's greatest potential-only those who can conquer their fear will survive.",
            poster: "https://www.themoviedb.org/t/p/original/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
        },
        {
            title: "Apocalypse Now",
            year: 1979,
            description: "At the height of the Vietnam war, Captain Benjamin Willard is sent on a dangerous mission that, officially, \"does not exist, nor will it ever exist.\" His goal is to locate - and eliminate - a mysterious Green Beret Colonel named Walter Kurtz, who has been leading his personal army on illegal guerrilla missions into enemy territory.",
            poster: "https://www.themoviedb.org/t/p/w600_and_h900_bestv2/gQB8Y5RCMkv2zwzFHbUJX3kAhvA.jpg",
        },
    ]
}

// region GET /

// Host index.hbs with header.hbs view
app.get(BASE, (req, res) => {
    if (req.cookies?.session !== undefined) {
        const query = db.getUserdataFromSession(req.cookies.session);

        // If we can not get the access token, let the user login again
        if (query?.oauth_access_token === undefined) {
            res.render("main", { ...MOVIES, ...RENDER});
            return;
        }

        Axios.get("https://api.github.com/user", {
            headers: {
                Authorization: "token " + query.oauth_access_token
            }
        })
        .then((response) => {
            // Show logged in movies page
            res.render("main", {
                name: response.data.login,
                profilePictureUrl: response.data.avatar_url,
                ...MOVIES,
                ...RENDER
            });
        })
        .catch((error) => {
            console.log(error);

            // Show main page
            res.render("main", { ...MOVIES, ...RENDER});
        });
    } else {
        // Show main page
        res.render("main", { ...MOVIES, ...RENDER});
    }
});

// endregion

// region GET /add

app.get(BASE + "add", (req, res) => {

});

// endregion

// region GET /oauth/github

// Attempt login using GitHub OAuth
app.get(BASE + "oauth/github", async (req, res) => {
    // Check if code param is present and do basic test
    if (req.query.code === undefined || req.query.code.replace(/\s/g, "").length === 0) {
        res.send("Something went wrong, please try again (Invalid code)")
        return;
    }

    const accessTokenPromise = github.getAccessToken(req.query.code);
    const userDatePromise = accessTokenPromise.then(github.getUserData);

    Promise.all([accessTokenPromise, userDatePromise]).then(([accessToken, userData]) => {
        const sessionId = Utils.generateSessionId();
        const dbExp = Date.now() + SESSION_EXPIRY; // Expiry time to store in database

        // Insert new user entry, or update existing
        db.database.prepare(`
                    INSERT INTO users
                    (
                        oauth_id,
                        oauth_provider,
                        oauth_access_token,
                        session_id,
                        session_expiry
                    )
                    VALUES
                    (
                        '${userData.id}',
                        'github',
                        '${accessToken}',
                        '${sessionId}',
                        '${dbExp}'
                    )
                    ON CONFLICT(oauth_id, oauth_provider)
                    DO UPDATE SET
                        oauth_access_token='${accessToken}',
                        session_id='${sessionId}',
                        session_expiry='${dbExp}';
                `).run();

        // Set session cookie
        res.cookie("session", sessionId, {
            maxAge: SESSION_EXPIRY,
            secure: true,
            httpOnly: false,
            path: BASE
        })

        // Return user to main page
        res.redirect(BASE);
    })
    .catch((error) => {
        console.log(error.message);
        res.send(`Something went wrong while logging in. Please try again. (${error.message})`);
    });
});

// endregion

// region Listen

// Listen on port
const port = config.port;
app.listen(port, () => console.log("Listening on http://localhost:" + port + BASE));

// endregion