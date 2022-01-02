"use strict";
const configPath = "./config.json"
const config = require(configPath);
const Utils = require("./utils")
const Path = require("path")
const Express = require("express");
const ExpressHandlebars = require("express-handlebars");
const Axios = require("axios").default
const SQLite = require("better-sqlite3");
const CookieParser = require('cookie-parser')
const Crypto = require('crypto');

const app = Express();
const db = SQLite("database.db");

// region Config verification

if (!Utils.verifyConfig(configPath)) {
    process.exit(1);
}

// Set base url, if specified
const BASE = config.base === undefined ? "/" : config.base;

// Get session expiry time or use default of 15 mins
const SESSION_EXPIRY = (config.sessionExpiry === undefined ? 15 : config.sessionExpiry) * 60 * 1000;

// endregion

// region Database setup

// Create database table if it does not exist yet
db.prepare(`CREATE TABLE IF NOT EXISTS userdata
            (
                id                 INTEGER PRIMARY KEY, -- Primary ID, alias for ROWID
                oauth_id           INTEGER,             -- ID provided by OAuth provider
                oauth_provider     TEXT,                -- OAuth provider
                oauth_access_token TEXT,                -- Access token for OAuth provider
                session_id         TEXT,                -- Session ID cookie, unique and unguessable
                session_expiry     INTEGER,             -- Expiry of session, in milliseconds since 1 Jan 1970
                UNIQUE(oauth_id, oauth_provider)        -- Combination of provider and ID must be unique
            );
`).run();

// endregion

// region Rendering engine setup

// Set up rendering engine
app.engine(".hbs", ExpressHandlebars.engine({
    extname: ".hbs",
    defaultLayout: "index"
}));
app.set("view engine", ".hbs");
app.set("views", Path.join(__dirname, "views"));

// endregion

// region Cookies
app.use(CookieParser());
// endregion

// region GET /

// Host index.hbs with main.hbs view
app.get(BASE, (req, res) => {
    if (req.cookies?.session !== undefined) {
        const query = db.prepare(`
            SELECT * FROM userdata
            WHERE session_id = '${req.cookies.session}';
        `).get();

        // If we can not get the access token, let the user login again
        if (query?.oauth_access_token === undefined) {
            res.render("main", {
                clientId: config.clientId,
                redirectUri: config.redirectUri
            });
            return;
        }

        Axios.get("https://api.github.com/user", {
            headers: {
                Authorization: "token " + query.oauth_access_token
            }
        })
        .then((response) => {
            res.render("main", {
                clientId: config.clientId,
                redirectUri: config.redirectUri,
                name: response.data.login,
                profilePictureUrl: response.data.avatar_url
            });
        })
        .catch((error) => {
            console.log(error);

            res.render("main", {
                clientId: config.clientId,
                redirectUri: config.redirectUri
            });
        });
    } else {
        res.render("main", {
            clientId: config.clientId,
            redirectUri: config.redirectUri
        });
    }
});

// endregion

// region GET /oauth/github

// Attempt login using GitHub OAuth
app.get(BASE + "oauth/github", (req, res) => {
    // Check if code param is present and do basic test
    if (req.query.code === undefined || req.query.code.replace(/\s/g, "").length === 0) {
        res.send("Something went wrong, please try again")
        return;
    }

    // Attempt to get access token from GitHub
    Axios.post("https://github.com/login/oauth/access_token",
        {
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: req.query.code,
        },
        {
            headers: { accept: "application/json" }
        })
        .then((response) => {
            const { access_token, error, error_description, error_uri } = response.data;

            if (access_token !== undefined) {
                Axios.get("https://api.github.com/user", {
                        headers: {
                            Authorization: "token " + access_token
                        }
                    })
                    .then((userResponse) => {
                        if (userResponse.data.id !== undefined && !isNaN(parseInt(userResponse.data.id))) {
                            const { id } = userResponse.data;

                            const sessionId = Crypto.randomBytes(16).toString("base64");
                            const dbExp = Date.now() + SESSION_EXPIRY; // Expiry time to store in database

                            // Insert new user entry, or update existing
                            db.prepare(`
                                INSERT INTO userdata
                                (
                                    oauth_id,
                                    oauth_provider,
                                    oauth_access_token,
                                    session_id,
                                    session_expiry
                                )
                                VALUES
                                (
                                    '${id}',
                                    'github',
                                    '${access_token}',
                                    '${sessionId}',
                                    '${dbExp}'
                                )
                                ON CONFLICT(oauth_id, oauth_provider)
                                DO UPDATE SET
                                    oauth_access_token='${access_token}',
                                    session_id='${sessionId}',
                                    session_expiry='${dbExp}';
                            `).run();

                            res.cookie("session", sessionId, {
                                maxAge: SESSION_EXPIRY,
                                secure: true,
                                httpOnly: true
                            })
                        }

                        res.redirect("/");
                    })
                    .catch((error) => {
                        console.log("Error getting user data:")
                        console.log(error.message)
                    });
            } else {
                throw new Error(`${error}: ${error_description}\nMore info at ${error_uri}`);
            }
        })
        .catch((error) => {
            // TODO: add logger
            console.log("Error getting OAuth access token:");
            console.log(error.message);

            res.send("Something went wrong while logging in. Please try again.")
        });
});

// endregion

// region Listen

// Listen on port
const port = config.port;
app.listen(port, () => console.log("Listening on http://localhost:" + port));

// endregion