const configPath = "./config.json"
const config = require(configPath);

import * as Path from "path";
import * as Express from "express";
import * as ExpressHandlebars from "express-handlebars";
import * as CookieParser from "cookie-parser";

import Utils from "./utils";
import GitHub from "./github";
import Database, { MovieData } from "./database";
import MovieDB from "./moviedb";

// region Config verification

if (!Utils.verifyConfig(configPath)) {
    process.exit(1);
}

// Set base url, if specified
const BASE: string = config.base === undefined ? "/" : config.base;

// Get session expiry time or use default of 1 hour (in seconds)
const SESSION_EXPIRY: number = (config.sessionExpiry === undefined ? 60 * 60 : config.sessionExpiry) * 1000;

const DEFAULT_VIEW: { clientId: string, redirectUri: string, base: string } = {
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    base: BASE,
};

// endregion

const app: Express.Express = Express();
const db: Database = new Database("database.db");
const github: GitHub = new GitHub(config.clientId, config.clientSecret);
const movieDb: MovieDB = new MovieDB(config.tmdbApiKey);

// region Setup

// Set up database
db.createTablesIfNotExists();

// Set up rendering engine
app.engine(".hbs", ExpressHandlebars.engine({
    extname: ".hbs",
    defaultLayout: "index",
}));
app.set("view engine", ".hbs");
app.set("views", Path.join(__dirname, "views"));

// Set up cookie parser
app.use(CookieParser());

// Serve static content in /public directory
app.use(BASE, Express.static(__dirname + "/public"));

// endregion

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
    let movies: MovieData[] = db.getMovies();

    let MOVIES_VIEW = {
        movies: movies.map(movie => ({
            title: movie.title,
            description: movie.overview,
            poster: movie.poster_path ? "https://www.themoviedb.org/t/p/w500" + movie.poster_path : "",
            year: new Date(parseInt(movie.release_date)).getUTCFullYear(),
        }))
    }

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

        let viewSuccess = null;
        let viewReason = null;

        if (typeof req.query.add === "string") {
            await movieDb.getMovieDetails(parseInt(req.query.add))
                .then(async ({ movieData: movie, reason }) => {
                    if (reason) {
                        viewReason = reason;
                    } else {
                        if (!db.insertMovieData(movie)) {
                            viewReason = "This movie is already in the list!";
                        } else {
                            viewSuccess = "Successfully added!";
                        }
                    }
                });

            res.render("add", {
                loggedIn: res.locals.loggedIn,
                name: res.locals.user?.login,
                profilePictureUrl: res.locals.user?.avatar_url,
                reason: viewReason,
                success: viewSuccess,
                ...DEFAULT_VIEW,
            });

            return;
        }

        // Render default page if no id param
        if (typeof req.query.id !== "string" || !req.query?.id) {
            res.render("add", {
                loggedIn: res.locals.loggedIn,
                name: res.locals.user?.login,
                profilePictureUrl: res.locals.user?.avatar_url,
                ...DEFAULT_VIEW,
            });
            return;
        }

        // Get ID
        let idOrFail = Utils.movieIdOrUrlToId(decodeURI(req.query.id));

        if (idOrFail.imdbId) {
            const imdbId = idOrFail.imdbId as string;

            await movieDb.getIdFromImdbId(imdbId)
                .then(({id, reason}) => {
                    if (id) {
                        idOrFail.tmdbId = id;
                        return;
                    }

                    idOrFail.reason = reason;
                });
        }

        type TmdbMovie = {
            id?: number;
            title?: string;
            year?: number;
            description?: string;
            poster?: string;
        }

        let MOVIE_EXAMPLE: TmdbMovie = {};

        if (idOrFail.tmdbId) {
            let sent: boolean = await movieDb.getMovieDetails(idOrFail.tmdbId)
                .then(({ movieData: movie, reason }) => {
                    if (reason) {
                        res.render("add", {
                            loggedIn: res.locals.loggedIn,
                            name: res.locals.user?.login,
                            profilePictureUrl: res.locals.user?.avatar_url,
                            reason: reason,
                            ...DEFAULT_VIEW,
                        });
                        return true;
                    }

                    MOVIE_EXAMPLE = {
                        id: idOrFail.tmdbId,
                        title: movie.title,
                        year: new Date(movie.release_date).getUTCFullYear(),
                        description: movie.overview,
                        poster: movie.poster_path ? "https://www.themoviedb.org/t/p/w500" + movie.poster_path : "",
                    }
                });

            if (sent) return;
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
        console.log(error.stack);
        console.log(error.message);
        Utils.sendErrorResponse(res, error.message);
    }
});


// endregion

// region GET /oauth/github

// Attempt login using GitHub OAuth
app.get(BASE + "oauth/github", async (req, res) => {
    // Check if code param is present and do basic test
    if (typeof req.query.code !== "string" || req.query.code.replace(/\s/g, "").length === 0) {
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
            db.insertGithubUserData({
                oauth_id: userData.id,
                oauth_provider: 'github',
                oauth_access_token: accessToken,
                session_id: sessionId,
                session_expiry: dbExp,
            });

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
        .catch((error: Error) => {
            console.log(error.message);
            console.log(error.stack);
            Utils.sendErrorResponse(res, error.message);
        });
});

// endregion

// region Listen

// Listen on port
const port = config.port;
app.listen(port, () => console.log("Listening on http://localhost:" + port + BASE));

// endregion