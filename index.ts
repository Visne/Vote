"use strict";
const configPath = "./config.json"
const config = require(configPath);
const Utils = require("./utils");
const Path = require("path");
const Express = require("express");
const ExpressHandlebars = require("express-handlebars");
const CookieParser = require('cookie-parser')
const GitHub = require("./github");
const Database = require("./database");
const MovieDB = require("./moviedb");
const Axios = require("axios");

// region Config verification

if (!Utils.verifyConfig(configPath)) {
    process.exit(1);
}

// Set base url, if specified
const BASE = config.base === undefined ? "/" : config.base;

// Get session expiry time or use default of 1 hour (in seconds)
const SESSION_EXPIRY = (config.sessionExpiry === undefined ? 60 * 60 : config.sessionExpiry) * 1000;

const DEFAULT_VIEW = {
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    base: BASE
}

// endregion

const app = Express();
const db = new Database("database.db");
const github = new GitHub(config.clientId, config.clientSecret);
const movieDb = new MovieDB(config.tmdbApiKey);

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

let MOVIES_VIEW = {
    movies: [
        {
            title: "Dune",
            year: 2021,
            description: "Paul Atreides, a brilliant and gifted young man born into a great destiny beyond his understanding, must travel to the most dangerous planet in the universe to ensure the future of his family and his people. As malevolent forces explode into conflict over the planet's exclusive supply of the most precious resource in existence-a commodity capable of unlocking humanity's greatest potential-only those who can conquer their fear will survive.",
            poster: "https://www.themoviedb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
        },
        {
            title: "Apocalypse Now",
            year: 1979,
            description: "At the height of the Vietnam war, Captain Benjamin Willard is sent on a dangerous mission that, officially, \"does not exist, nor will it ever exist.\" His goal is to locate - and eliminate - a mysterious Green Beret Colonel named Walter Kurtz, who has been leading his personal army on illegal guerrilla missions into enemy territory.",
            poster: "https://www.themoviedb.org/t/p/w500/gQB8Y5RCMkv2zwzFHbUJX3kAhvA.jpg",
        },
    ]
}

// Log in using session cookie
app.use((req, res, next) => {
    // By default, user is not logged in
    res.locals.loggedIn = false;

    // No session cookie means the user is not logged in
    if (req.cookies?.session === undefined) {
        return next();
    }

    // Get user data associated with cookie
    const query = db.getUserdataFromSession(req.cookies.session);

    // If we can not get the access token, the user is not logged in
    if (query?.oauth_access_token === undefined) {
        return next();
    }

    github.getUserData(query.oauth_access_token)
        .then((response) => {
            res.locals.user = response;
            res.locals.loggedIn = true;
        })
        .catch((error) => {
            console.log(error);
        })
        .finally(() => {
            next();
        });
});

// region GET /

// Host index.hbs with header.hbs view
app.get(BASE, (req, res) => {
    res.render("movie-list", {
        loggedIn: res.locals.loggedIn,
        name: res.locals.user?.login,
        profilePictureUrl: res.locals.user?.avatar_url,
        ...MOVIES_VIEW,
        ...DEFAULT_VIEW
    });
});

// endregion

// region GET /add

app.get(BASE + "add", async (req, res) => {
    try {
        // If not logged in, redirect to movie-list
        if (!res.locals.loggedIn) {
            res.redirect(BASE);
            return;
        }

        // Render default page if no id param
        if (!req.query?.id) {
            res.render("add", {
                loggedIn: res.locals.loggedIn,
                name: res.locals.user?.login,
                profilePictureUrl: res.locals.user?.avatar_url,
                ...DEFAULT_VIEW
            });
            return;
        }

        // Get ID
        let idOrFail = Utils.movieIdOrUrlToId(decodeURI(req.query.id));

        if (idOrFail.imdbId) {
            await movieDb.getIdFromImdbId(idOrFail.imdbId)
                .then((id) => {
                    if (id) {

                    }
                });

            await Axios.get(`https://api.themoviedb.org/3/find/${idOrFail.imdbId}`,
                {
                    params: {
                        api_key: config.tmdbApiKey,
                        external_source: "imdb_id",
                    }
                })
                .then((response) => {
                    if (response.status === 200) {
                        idOrFail.tmdbId = response.data.movie_results[0].id;
                    } else if (response.status === 404) {
                        idOrFail.reason = "Movie is on IMDb, but not linked to TMDB! Try searching for the movie on TMDB.";
                    } else {
                        throw new Error(response.data.status_message);
                    }
                });
        }

        let MOVIE_EXAMPLE = {};

        if (idOrFail.tmdbId) {
            await Axios.get(`https://api.themoviedb.org/3/movie/${idOrFail.tmdbId}`,
                {
                    params: {
                        api_key: config.tmdbApiKey,
                    }
                })
                .then((response) => {
                    if (response.status === 200) {
                        MOVIE_EXAMPLE.id = idOrFail.tmdbId;
                        MOVIE_EXAMPLE.title = response.data.title;
                        MOVIE_EXAMPLE.year = new Date(response.data.release_date).getFullYear();
                        MOVIE_EXAMPLE.description = response.data.overview;
                        MOVIE_EXAMPLE.poster = "https://www.themoviedb.org/t/p/w500" + response.data.poster_path;
                    } else {
                        throw new Error(response.data.status_message);
                    }
                });
        }

        // Display page
        res.render("add", {
            loggedIn: res.locals.loggedIn,
            name: res.locals.user?.login,
            profilePictureUrl: res.locals.user?.avatar_url,
            reason: idOrFail.reason,
            ...MOVIE_EXAMPLE,
            ...DEFAULT_VIEW,
        });
    } catch (error) {
        console.log(error.message);
        res.send(error.message);
    }
});


// endregion

// region GET /oauth/github

// Attempt login using GitHub OAuth
app.get(BASE + "oauth/github", async (req, res) => {
    // Check if code param is present and do basic test
    if (req.query.code === undefined || req.query.code.replace(/\s/g, "").length === 0) {
        Utils.sendErrorResponse(res, "Invalid code")
        return;
    }

    const accessTokenPromise = github.getAccessToken(req.query.code);
    const userDatePromise = accessTokenPromise.then(github.getUserData);

    Promise.all([accessTokenPromise, userDatePromise]).then(([accessToken, userData]) => {
        const sessionId = Utils.generateSessionId();
        const dbExp = Date.now() + SESSION_EXPIRY; // Expiry time to store in database

        if (userData.id === undefined) {
            console.log(userData);

            throw new Error("Tried to insert undefined oauth_id");
        }

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

        // Return user to movie-list page
        res.redirect(BASE);
    })
    .catch((error) => {
        console.log(error.message);
        Utils.sendErrorResponse(res, error.message);
    });
});

// endregion

// region Listen

// Listen on port
const port = config.port;
app.listen(port, () => console.log("Listening on http://localhost:" + port + BASE));

// endregion